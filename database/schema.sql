-- Public application schema. Provision workspace and allowed email separately, privately.
begin;
create schema if not exists workdesk_private;
revoke all on schema workdesk_private from public;
grant usage on schema workdesk_private to authenticated;

create table public.workspaces (id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz not null default now());
create table workdesk_private.access (workspace_id uuid primary key references public.workspaces(id), allowed_email text not null);
alter table workdesk_private.access enable row level security;
create function workdesk_private.can_access(w uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false
 and exists(select 1 from workdesk_private.access a where a.workspace_id=w and lower(a.allowed_email)=lower(auth.jwt()->>'email'));
$$;
revoke all on function workdesk_private.can_access(uuid) from public,anon;
grant execute on function workdesk_private.can_access(uuid) to authenticated;
alter table public.workspaces enable row level security;
create policy owner_read on public.workspaces for select to authenticated using(workdesk_private.can_access(id));
grant select on public.workspaces to authenticated;
revoke all on public.workspaces from anon;

create table public.tasks (
 id text primary key, workspace_id uuid not null references public.workspaces(id),
 title text not null check(length(title) between 1 and 300), project text not null default '일반', owner_label text not null default '',
 status text not null default 'review' check(status in ('review','todo','doing','partial','waiting','done')),
 priority text not null default 'normal' check(priority in ('high','normal','low')),
 due_date date, next_review_on date, next_action text not null default '', remaining_action text not null default '',
 note text not null default '', pinned boolean not null default false, archived boolean not null default false,
 origin text not null default 'manual' check(origin in('manual','ai')),
 source_data jsonb not null default '{}', source_refs jsonb not null default '[]', source_at timestamptz,
 pending_review boolean not null default false, user_fields text[] not null default '{}',
 revision bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz,
 check(status <> 'partial' or length(trim(remaining_action)) > 0),
 check(status <> 'done' or (remaining_action='' and next_review_on is null)),
 check(jsonb_typeof(source_refs)='array'), check(length(note)<=12000), check(length(remaining_action)<=6000)
);
create index tasks_workspace_due on public.tasks(workspace_id,due_date);
create index tasks_workspace_status on public.tasks(workspace_id,status);
create table public.task_history (
 id bigint generated always as identity primary key, workspace_id uuid not null references public.workspaces(id), task_id text not null references public.tasks(id),
 occurred_at timestamptz not null default now(), actor text not null, action text not null, before_data jsonb, after_data jsonb not null
);
create index history_workspace_date on public.task_history(workspace_id,occurred_at desc);
create index history_task_date on public.task_history(task_id,occurred_at desc);
create table public.calendar_events (
 id text primary key, workspace_id uuid not null references public.workspaces(id), title text not null,
 start_at timestamptz not null, end_at timestamptz not null, all_day boolean not null default false, source text not null default '', url text not null default '',
 note text not null default '', status text not null default 'confirmed', source_at timestamptz not null, check(end_at>=start_at)
);
create index events_workspace_start on public.calendar_events(workspace_id,start_at);
create table public.sync_runs (
 id text primary key, workspace_id uuid not null references public.workspaces(id), generated_at timestamptz not null,
 imported_at timestamptz not null default now(), summary text not null default '', sources jsonb not null default '[]', fingerprint text not null,
 added integer not null default 0, updated integer not null default 0
);
create index runs_workspace_date on public.sync_runs(workspace_id,generated_at desc);
create table public.workspace_links (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id), label text not null, url text not null, description text not null default '', sort_order integer not null default 0
);
create index links_workspace on public.workspace_links(workspace_id);

do $$ declare t text; begin
 foreach t in array array['tasks','task_history','calendar_events','sync_runs','workspace_links'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy owner_read on public.%I for select to authenticated using (workdesk_private.can_access(workspace_id))',t);
 end loop;
end $$;
grant insert,update on public.tasks to authenticated;
create policy owner_insert on public.tasks for insert to authenticated with check(workdesk_private.can_access(workspace_id) and origin='manual');
create policy owner_update on public.tasks for update to authenticated using(workdesk_private.can_access(workspace_id)) with check(workdesk_private.can_access(workspace_id));

create function workdesk_private.before_task() returns trigger language plpgsql set search_path='' as $$
declare f text; fields text[] := array['title','project','owner_label','due_date','priority','next_action'];
begin
 if TG_OP='UPDATE' then
   if new.id<>old.id or new.workspace_id<>old.workspace_id then raise exception 'Immutable identity'; end if;
   if current_user='authenticated' then
     if new.origin<>old.origin or new.source_data<>old.source_data or new.source_refs<>old.source_refs or new.source_at is distinct from old.source_at then raise exception 'Source fields are managed by collector'; end if;
     new.user_fields:=old.user_fields;
     foreach f in array fields loop
       if to_jsonb(new)->f is distinct from to_jsonb(old)->f and not f=any(new.user_fields) then new.user_fields:=array_append(new.user_fields,f); end if;
     end loop;
   end if;
   new.created_at:=old.created_at;
   new.revision:=old.revision+1;
 else
   new.revision:=1; new.created_at:=now();
   if current_user='authenticated' then new.origin:='manual'; new.source_data:='{}'; new.source_refs:='[]'; new.source_at:=null; new.user_fields:='{}'; end if;
 end if;
 new.updated_at:=now();
 if new.status='done' then
   if TG_OP='INSERT' or old.status<>'done' then new.completed_at:=now(); else new.completed_at:=old.completed_at; end if;
 else new.completed_at:=null; end if;
 return new;
end $$;
revoke all on function workdesk_private.before_task() from public;
create trigger task_before before insert or update on public.tasks for each row execute function workdesk_private.before_task();
create function workdesk_private.log_task() returns trigger language plpgsql security definer set search_path='' as $$
declare a text; actor_name text;
begin
 if auth.uid() is not null then
   if not workdesk_private.can_access(new.workspace_id) then raise exception 'Not authorized'; end if;
   actor_name:='본인';
 else actor_name:='다한닷'; end if;
 a:=case when TG_OP='INSERT' then '업무 등록' when new.archived and not old.archived then '보관' when not new.archived and old.archived then '복원' when new.status is distinct from old.status then '상태 변경' when new.note is distinct from old.note then '메모 작성' when new.source_data is distinct from old.source_data then '조회 반영' else '업무 수정' end;
 insert into public.task_history(workspace_id,task_id,actor,action,before_data,after_data) values(new.workspace_id,new.id,actor_name,a,case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;
revoke all on function workdesk_private.log_task() from public;
create trigger task_log after insert or update on public.tasks for each row execute function workdesk_private.log_task();

create function public.save_task(p_id text,p_expected bigint,p_patch jsonb) returns public.tasks language plpgsql security invoker set search_path='' as $$
declare t public.tasks; w uuid; begin
 select id into w from public.workspaces limit 1;
 if w is null then raise exception 'Access denied'; end if;
 if p_expected is null then
   insert into public.tasks(id,workspace_id,title) values(p_id,w,coalesce(nullif(trim(p_patch->>'title'),''),'새 업무')) returning * into t;
 else
   select * into t from public.tasks where id=p_id for update;
   if not found then raise exception 'Task not found'; end if;
   if t.revision<>p_expected then raise exception 'CONFLICT: 다른 기기에서 변경되었습니다. 다시 열어 확인하세요.'; end if;
 end if;
 update public.tasks set
 title=case when p_patch?'title' then trim(p_patch->>'title') else t.title end,
 project=case when p_patch?'project' then coalesce(nullif(p_patch->>'project',''),'일반') else t.project end,
 owner_label=case when p_patch?'owner_label' then p_patch->>'owner_label' else t.owner_label end,
 status=case when p_patch?'status' then p_patch->>'status' else t.status end,
 priority=case when p_patch?'priority' then p_patch->>'priority' else t.priority end,
 due_date=case when p_patch?'due_date' then nullif(p_patch->>'due_date','')::date else t.due_date end,
 next_review_on=case when p_patch?'next_review_on' then nullif(p_patch->>'next_review_on','')::date else t.next_review_on end,
 next_action=case when p_patch?'next_action' then p_patch->>'next_action' else t.next_action end,
 remaining_action=case when p_patch?'remaining_action' then p_patch->>'remaining_action' else t.remaining_action end,
 note=case when p_patch?'note' then p_patch->>'note' else t.note end,
 pinned=case when p_patch?'pinned' then (p_patch->>'pinned')::boolean else t.pinned end,
 archived=case when p_patch?'archived' then (p_patch->>'archived')::boolean else t.archived end,
 pending_review=case when p_patch?'pending_review' then (p_patch->>'pending_review')::boolean else t.pending_review end
 where id=p_id returning * into t;
 return t;
end $$;
revoke all on function public.save_task(text,bigint,jsonb) from public,anon;
grant execute on function public.save_task(text,bigint,jsonb) to authenticated;

-- Collector-only transaction. Never grants execution to a browser role.
create function public.ingest_workdesk_feed(p_workspace uuid,p_feed jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare x jsonb; t public.tasks; dt timestamptz; fp text; oldfp text; adds int:=0; updates int:=0; fields text[]; f text; changed boolean;
begin
 if coalesce(p_feed->>'type','')<>'dahandot.feed' or coalesce((p_feed->>'schema_version')::int,0)<>1 then raise exception 'Invalid feed'; end if;
 dt:=(p_feed->>'generated_at')::timestamptz; fp:=md5(p_feed::text);
 perform pg_advisory_xact_lock(hashtextextended(p_workspace::text,0));
 select fingerprint into oldfp from public.sync_runs where id=p_feed->>'batch_id';
 if found then if oldfp<>fp then raise exception 'Batch ID content conflict'; end if; return jsonb_build_object('duplicate',true); end if;
 for x in select value from jsonb_array_elements(p_feed->'tasks') loop
   if length(coalesce(x->>'id',''))=0 or jsonb_array_length(coalesce(x->'source_refs','[]'))=0 then raise exception 'Task identity and sources required'; end if;
   select * into t from public.tasks where id=x->>'id' for update;
   if not found then
     insert into public.tasks(id,workspace_id,title,project,owner_label,due_date,priority,next_action,origin,source_data,source_refs,source_at)
     values(x->>'id',p_workspace,x->>'title',coalesce(x->>'project','일반'),coalesce(x->>'owner',''),nullif(x->>'due_date','')::date,coalesce(x->>'priority','normal'),coalesce(x->>'next_action',''),'ai',x,coalesce(x->'source_refs','[]'),dt);
     adds:=adds+1;
   else
     if t.workspace_id<>p_workspace or t.origin<>'ai' then raise exception 'Identity collision'; end if;
     if dt< t.source_at then continue; end if;
     if t.source_data=x then continue; end if;
     changed:= (t.source_data - 'source_refs') is distinct from (x - 'source_refs');
     -- User status/notes/remaining work/review date are NEVER changed by collection.
     update public.tasks set
       title=case when 'title'=any(t.user_fields) then t.title else x->>'title' end,
       project=case when 'project'=any(t.user_fields) then t.project else coalesce(x->>'project','일반') end,
       owner_label=case when 'owner_label'=any(t.user_fields) then t.owner_label else coalesce(x->>'owner','') end,
       due_date=case when 'due_date'=any(t.user_fields) then t.due_date else nullif(x->>'due_date','')::date end,
       priority=case when 'priority'=any(t.user_fields) then t.priority else coalesce(x->>'priority','normal') end,
       next_action=case when 'next_action'=any(t.user_fields) then t.next_action else coalesce(x->>'next_action','') end,
       source_data=x,source_refs=coalesce(x->'source_refs','[]'),source_at=dt,pending_review=t.pending_review or changed
     where id=t.id;
     updates:=updates+1;
   end if;
 end loop;
 for x in select value from jsonb_array_elements(coalesce(p_feed->'events','[]')) loop
   insert into public.calendar_events(id,workspace_id,title,start_at,end_at,all_day,source,url,note,status,source_at)
   values(x->>'id',p_workspace,x->>'title',case when (x->>'all_day')::boolean then (x->>'start')::date::timestamp at time zone 'Asia/Seoul' else (x->>'start')::timestamptz end,
   case when (x->>'all_day')::boolean then (x->>'end')::date::timestamp at time zone 'Asia/Seoul' else (x->>'end')::timestamptz end,
   coalesce((x->>'all_day')::boolean,false),coalesce(x->>'source',''),coalesce(x->>'url',''),coalesce(x->>'note',''),coalesce(x->>'status','confirmed'),dt)
   on conflict(id) do update set title=excluded.title,start_at=excluded.start_at,end_at=excluded.end_at,all_day=excluded.all_day,source=excluded.source,url=excluded.url,note=excluded.note,status=excluded.status,source_at=excluded.source_at
   where public.calendar_events.workspace_id=p_workspace and public.calendar_events.source_at<=excluded.source_at;
 end loop;
 insert into public.sync_runs(id,workspace_id,generated_at,summary,sources,fingerprint,added,updated)
 values(p_feed->>'batch_id',p_workspace,dt,coalesce(p_feed->>'summary',''),coalesce(p_feed->'sources','[]'),fp,adds,updates);
 return jsonb_build_object('added',adds,'updated',updates,'duplicate',false);
end $$;
revoke all on function public.ingest_workdesk_feed(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_workdesk_feed(uuid,jsonb) to service_role;

alter publication supabase_realtime add table public.tasks, public.task_history, public.calendar_events, public.sync_runs;
commit;
