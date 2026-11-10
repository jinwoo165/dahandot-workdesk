-- Additive v2.1 migration. Apply once after schema.sql; no existing data is removed.
begin;
create table public.workdesk_messages (
 id uuid primary key, workspace_id uuid not null references public.workspaces(id),
 task_id text references public.tasks(id), event_id text references public.calendar_events(id),
 body text not null check(length(trim(body)) between 1 and 12000),
 created_at timestamptz not null default now(), base_revision bigint,
 resolution_status text not null default 'pending' check(resolution_status in ('pending','applied','clarification')),
 reply text not null default '', resolved_at timestamptz, changes jsonb not null default '[]',
 check(num_nonnulls(task_id,event_id)<=1), check(jsonb_typeof(changes)='array')
);
create index messages_workspace_date on public.workdesk_messages(workspace_id,created_at,id);
create index messages_pending on public.workdesk_messages(workspace_id,created_at,id) where resolution_status='pending';
create index messages_task on public.workdesk_messages(task_id,created_at);
create index messages_event on public.workdesk_messages(event_id,created_at);
alter table public.workdesk_messages enable row level security;
revoke all on public.workdesk_messages from anon,authenticated;
grant select on public.workdesk_messages to authenticated;
grant insert(id,workspace_id,task_id,event_id,body) on public.workdesk_messages to authenticated;
create policy owner_read on public.workdesk_messages for select to authenticated using(workdesk_private.can_access(workspace_id));
create policy owner_insert on public.workdesk_messages for insert to authenticated with check(workdesk_private.can_access(workspace_id));

create function workdesk_private.message_before_insert() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.task_id is not null then
   select revision into new.base_revision from public.tasks where id=new.task_id and workspace_id=new.workspace_id;
   if not found then raise exception 'Task not found in workspace'; end if;
 end if;
 if new.event_id is not null and not exists(select 1 from public.calendar_events where id=new.event_id and workspace_id=new.workspace_id) then
   raise exception 'Event not found in workspace';
 end if;
 new.body:=trim(new.body); new.created_at:=clock_timestamp();
 new.resolution_status:='pending'; new.reply:=''; new.resolved_at:=null; new.changes:='[]';
 return new;
end $$;
revoke all on function workdesk_private.message_before_insert() from public,anon,authenticated;
create trigger message_insert before insert on public.workdesk_messages for each row execute function workdesk_private.message_before_insert();

create function public.record_workdesk_message(p_workspace uuid,p_id uuid,p_body text,p_task_id text default null,p_event_id text default null)
returns public.workdesk_messages language plpgsql security invoker set search_path='' as $$
declare m public.workdesk_messages;
begin
 if not workdesk_private.can_access(p_workspace) then raise exception 'Access denied'; end if;
 -- A retried send has the same UUID and content; it never inserts twice.
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,1));
 select * into m from public.workdesk_messages where id=p_id;
 if found then
   if m.workspace_id<>p_workspace or m.body<>trim(p_body) or m.task_id is distinct from p_task_id or m.event_id is distinct from p_event_id then
     raise exception 'Message ID conflict';
   end if;
   return m;
 end if;
 insert into public.workdesk_messages(id,workspace_id,task_id,event_id,body)
 values(p_id,p_workspace,p_task_id,p_event_id,p_body) returning * into m;
 return m;
end $$;
revoke all on function public.record_workdesk_message(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.record_workdesk_message(uuid,uuid,text,text,text) to authenticated;

-- Personal display preferences are separate from the imported calendar source.
create table public.calendar_overrides (
 event_id text primary key references public.calendar_events(id), workspace_id uuid not null references public.workspaces(id),
 excluded boolean not null default false, start_at timestamptz, end_at timestamptz,
 reason text not null default '', revision bigint not null default 1, updated_at timestamptz not null default now(),
 check((start_at is null and end_at is null) or (start_at is not null and end_at is not null and end_at>=start_at))
);
create index overrides_workspace on public.calendar_overrides(workspace_id);
alter table public.calendar_overrides enable row level security;
revoke all on public.calendar_overrides from anon,authenticated;
grant select on public.calendar_overrides to authenticated;
create policy owner_read on public.calendar_overrides for select to authenticated using(workdesk_private.can_access(workspace_id));

-- Only the authorized agent/collector can interpret a message and apply a result.
-- The browser can submit plain text but cannot forge an assistant response.
create function public.resolve_workdesk_message(p_message uuid,p_reply text,p_actions jsonb default '[]',p_clarification boolean default false)
returns public.workdesk_messages language plpgsql security invoker set search_path='' as $$
declare
 m public.workdesk_messages; t public.tasks; ev public.calendar_events; ov public.calendar_overrides;
 a jsonb; p jsonb; before_row jsonb; after_row jsonb; result_changes jsonb:='[]'; f text; fields text[];
 action_id text; is_new boolean; override_exists boolean; expected_revision bigint;
begin
 select * into m from public.workdesk_messages where id=p_message for update;
 if not found then raise exception 'Message not found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(m.workspace_id::text,0));
 if m.resolution_status<>'pending' then return m; end if;
 if length(trim(coalesce(p_reply,''))) not between 1 and 12000 then raise exception 'Reply required'; end if;
 if jsonb_typeof(p_actions) is distinct from 'array' or jsonb_array_length(p_actions)>10 then raise exception 'Invalid actions'; end if;
 if p_clarification and jsonb_array_length(p_actions)>0 then raise exception 'Clarification cannot change records'; end if;
 if exists(select 1 from public.workdesk_messages x where x.workspace_id=m.workspace_id and x.resolution_status='pending' and (x.created_at,x.id)<(m.created_at,m.id)) then
   raise exception 'Process earlier pending conversations first';
 end if;
 for a in select value from jsonb_array_elements(p_actions) loop
   p:=a->'patch'; action_id:=a->>'id';
   if jsonb_typeof(p) is distinct from 'object' or length(coalesce(action_id,''))=0 then raise exception 'Invalid action patch'; end if;
   if a->>'kind' in ('task','new_task') then
     is_new:=a->>'kind'='new_task';
     if exists(select 1 from jsonb_object_keys(p) k where k not in ('title','project','owner_label','status','priority','due_date','next_review_on','next_action','remaining_action','note','pinned','archived','pending_review')) then raise exception 'Unsupported task field'; end if;
     if is_new then
       if action_id not like 'conversation:%' or length(trim(coalesce(p->>'title','')))=0 then raise exception 'New task identity and title required'; end if;
       insert into public.tasks(id,workspace_id,title) values(action_id,m.workspace_id,trim(p->>'title')) returning * into t;
       before_row:=null;
     else
       select * into t from public.tasks where id=action_id and workspace_id=m.workspace_id for update;
       if not found then raise exception 'Task not found in workspace'; end if;
       expected_revision:=(a->>'expected_revision')::bigint;
       if expected_revision is null or expected_revision<>t.revision then raise exception 'CONFLICT: task changed; read again before interpreting'; end if;
       before_row:=to_jsonb(t);
     end if;
     fields:=t.user_fields;
     foreach f in array array['title','project','owner_label','due_date','priority','next_action'] loop
       if p?f and not f=any(fields) then fields:=array_append(fields,f); end if;
     end loop;
     update public.tasks set
       title=case when p?'title' then trim(p->>'title') else t.title end,
       project=case when p?'project' then coalesce(nullif(p->>'project',''),'일반') else t.project end,
       owner_label=case when p?'owner_label' then p->>'owner_label' else t.owner_label end,
       status=case when p?'status' then p->>'status' else t.status end,
       priority=case when p?'priority' then p->>'priority' else t.priority end,
       due_date=case when p?'due_date' then nullif(p->>'due_date','')::date else t.due_date end,
       next_review_on=case when p?'next_review_on' then nullif(p->>'next_review_on','')::date else t.next_review_on end,
       next_action=case when p?'next_action' then p->>'next_action' else t.next_action end,
       remaining_action=case when p?'remaining_action' then p->>'remaining_action' else t.remaining_action end,
       note=case when p?'note' then p->>'note' else t.note end,
       pinned=case when p?'pinned' then (p->>'pinned')::boolean else t.pinned end,
       archived=case when p?'archived' then (p->>'archived')::boolean else t.archived end,
       pending_review=case when p?'pending_review' then (p->>'pending_review')::boolean else t.pending_review end,
       user_fields=fields
       where id=t.id returning to_jsonb(tasks.*) into after_row;
   elsif a->>'kind'='event' then
     if exists(select 1 from jsonb_object_keys(p) k where k not in ('excluded','start_at','end_at','reason')) then raise exception 'Unsupported event field'; end if;
     select * into ev from public.calendar_events where id=action_id and workspace_id=m.workspace_id for update;
     if not found then raise exception 'Event not found in workspace'; end if;
     if (a->>'expected_source_at')::timestamptz is distinct from ev.source_at then raise exception 'CONFLICT: calendar source changed'; end if;
     select * into ov from public.calendar_overrides where event_id=action_id for update;
     override_exists:=found;
     expected_revision:=case when override_exists then ov.revision else 0 end;
     if (a->>'expected_revision')::bigint is distinct from expected_revision then raise exception 'CONFLICT: calendar preference changed'; end if;
     if override_exists and ov.workspace_id<>m.workspace_id then raise exception 'Workspace conflict'; end if;
     before_row:=jsonb_build_object('source',to_jsonb(ev),'override',case when override_exists then to_jsonb(ov) else null end);
     insert into public.calendar_overrides(event_id,workspace_id,excluded,start_at,end_at,reason,revision)
     values(action_id,m.workspace_id,
       case when p?'excluded' then (p->>'excluded')::boolean else coalesce(ov.excluded,false) end,
       case when p?'start_at' then nullif(p->>'start_at','')::timestamptz else ov.start_at end,
       case when p?'end_at' then nullif(p->>'end_at','')::timestamptz else ov.end_at end,
       case when p?'reason' then p->>'reason' else coalesce(ov.reason,'') end,
       case when override_exists then ov.revision+1 else 1 end)
     on conflict(event_id) do update set excluded=excluded.excluded,start_at=excluded.start_at,end_at=excluded.end_at,reason=excluded.reason,revision=excluded.revision,updated_at=now()
     returning to_jsonb(calendar_overrides.*) into after_row;
   else raise exception 'Unsupported action kind';
   end if;
   result_changes:=result_changes||jsonb_build_array(jsonb_build_object('kind',a->>'kind','id',action_id,'before',before_row,'after',after_row));
 end loop;
 update public.workdesk_messages set resolution_status=case when p_clarification then 'clarification' else 'applied' end,
 reply=trim(p_reply),resolved_at=now(),changes=result_changes where id=m.id returning * into m;
 return m;
end $$;
revoke all on function public.resolve_workdesk_message(uuid,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.resolve_workdesk_message(uuid,text,jsonb,boolean) to service_role;
alter publication supabase_realtime add table public.workdesk_messages,public.calendar_overrides;
commit;
