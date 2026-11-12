-- Owner-only visibility for upcoming-event and recent-file panels.
-- Original calendar events, overrides, file metadata and summaries are untouched.
begin;
create table public.workdesk_item_visibility (
 workspace_id uuid not null references public.workspaces(id),
 kind text not null check(kind in ('agenda','file')),
 drive_id text not null default '',
 item_id text not null check(length(item_id)>0),
 label text not null,
 hidden_at timestamptz,
 updated_at timestamptz not null default now(),
 primary key(workspace_id,kind,drive_id,item_id),
 check((kind='agenda' and drive_id='') or (kind='file' and length(drive_id)>0)),
 check(octet_length(drive_id)+octet_length(item_id)<=2000)
);
alter table public.workdesk_item_visibility enable row level security;
revoke all on public.workdesk_item_visibility from public,anon,authenticated;
grant select,insert,update on public.workdesk_item_visibility to authenticated;
grant all on public.workdesk_item_visibility to service_role;
create policy owner_read on public.workdesk_item_visibility for select to authenticated
 using(workdesk_private.can_access(workspace_id));
create policy owner_insert on public.workdesk_item_visibility for insert to authenticated
 with check(workdesk_private.can_access(workspace_id));
create policy owner_update on public.workdesk_item_visibility for update to authenticated
 using(workdesk_private.can_access(workspace_id)) with check(workdesk_private.can_access(workspace_id));

create function public.set_workdesk_item_hidden(p_workspace uuid,p_kind text,p_drive_id text,p_item_id text,p_hidden boolean)
returns public.workdesk_item_visibility language plpgsql security invoker set search_path='' as $$
declare item public.workdesk_item_visibility; source_label text;
begin
 if not workdesk_private.can_access(p_workspace) then raise exception 'Workspace not available';end if;
 if p_hidden is null or p_kind is null or p_kind not in ('agenda','file') or p_drive_id is null
 or coalesce(length(p_item_id),0)=0 or octet_length(p_drive_id)+octet_length(p_item_id)>2000
 or (p_kind='agenda' and p_drive_id<>'') or (p_kind='file' and p_drive_id='')
 then raise exception 'Invalid item identity or visibility';end if;
 if p_hidden then
  if p_kind='agenda' then
   select title into source_label from public.calendar_events where workspace_id=p_workspace and id=p_item_id;
  else
   select name into source_label from public.file_changes
    where workspace_id=p_workspace and drive_id=p_drive_id and item_id=p_item_id
    order by modified_at_source desc,changed_at desc,id desc limit 1;
  end if;
  if not found then raise exception 'Source item not available';end if;
  insert into public.workdesk_item_visibility as existing(workspace_id,kind,drive_id,item_id,label,hidden_at,updated_at)
  values(p_workspace,p_kind,p_drive_id,p_item_id,source_label,now(),now())
  on conflict(workspace_id,kind,drive_id,item_id) do update
   set label=excluded.label,hidden_at=coalesce(existing.hidden_at,excluded.hidden_at),updated_at=excluded.updated_at
  returning * into item;
 else
  update public.workdesk_item_visibility set hidden_at=null,updated_at=now()
   where workspace_id=p_workspace and kind=p_kind and drive_id=p_drive_id and item_id=p_item_id
   returning * into item;
  if not found then raise exception 'Item preference not available';end if;
 end if;
 return item;
end $$;
revoke all on function public.set_workdesk_item_hidden(uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.set_workdesk_item_hidden(uuid,text,text,text,boolean) to authenticated;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(
  select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='workdesk_item_visibility')
 then alter publication supabase_realtime add table public.workdesk_item_visibility;end if;
end $$;
commit;
