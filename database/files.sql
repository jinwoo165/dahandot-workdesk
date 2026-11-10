-- v2.2: metadata-only OneDrive changes, privately collected and read-only in the app.
begin;
create table public.file_changes (
 id bigint generated always as identity primary key,
 workspace_id uuid not null references public.workspaces(id),
 drive_id text not null, item_id text not null,
 name text not null check(length(name) between 1 and 500),
 web_url text not null check(web_url ~ '^https://[^/@?#[:space:]]+\.sharepoint\.com/'),
 folder_path text not null default '',
 created_at_source timestamptz, modified_at_source timestamptz not null,
 changed_at timestamptz not null,
 change_kind text not null check(change_kind in ('created','modified')),
 observed_at timestamptz not null,
 unique(workspace_id,drive_id,item_id,changed_at)
);
create index file_changes_workspace_date on public.file_changes(workspace_id,changed_at desc,id desc);
create table public.file_sync_runs (
 id text primary key, workspace_id uuid not null references public.workspaces(id),
 checked_at timestamptz not null, status text not null check(status in ('ok','partial','failed')),
 detail text not null default '', file_count integer not null default 0,
 fingerprint text not null, imported_at timestamptz not null default now()
);
create index file_sync_workspace_date on public.file_sync_runs(workspace_id,checked_at desc);
do $$ declare t text; begin
 foreach t in array array['file_changes','file_sync_runs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('create policy owner_read on public.%I for select to authenticated using (workdesk_private.can_access(workspace_id))',t);
 end loop;
end $$;
grant usage,select on sequence public.file_changes_id_seq to service_role;

create function public.ingest_workdesk_files(p_workspace uuid,p_feed jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare x jsonb; stamp timestamptz; created timestamptz; modified timestamptz; changed timestamptz;
 fp text; existing public.file_sync_runs; total integer:=0; n integer;
begin
 if p_feed->>'type' is distinct from 'dahandot.files' or p_feed->>'schema_version' is distinct from '1'
  or coalesce(length(p_feed->>'batch_id'),0) not between 1 and 200
  or jsonb_typeof(p_feed->'files') is distinct from 'array'
  or p_feed->>'status' not in ('ok','partial','failed') or p_feed->>'status' is null
  or nullif(p_feed->>'checked_at','') is null then raise exception 'Invalid file feed'; end if;
 if jsonb_array_length(p_feed->'files')>500 then raise exception 'File batch exceeds 500'; end if;
 if p_feed->>'status'='failed' and jsonb_array_length(p_feed->'files')>0 then raise exception 'Failed check cannot contain files'; end if;
 stamp:=(p_feed->>'checked_at')::timestamptz;
 if stamp>now()+interval '5 minutes' then raise exception 'Future check time'; end if;
 perform 1 from public.workspaces where id=p_workspace for update;
 if not found then raise exception 'Workspace not found'; end if;
 fp:=md5(p_feed::text);
 select * into existing from public.file_sync_runs where id=p_feed->>'batch_id';
 if found then
  if existing.workspace_id<>p_workspace or existing.fingerprint<>fp then raise exception 'Batch identity conflict'; end if;
  return jsonb_build_object('duplicate',true,'added',0);
 end if;
 if exists(select 1 from public.file_sync_runs where workspace_id=p_workspace and checked_at>stamp) then raise exception 'Outdated file feed'; end if;
 for x in select value from jsonb_array_elements(p_feed->'files') loop
  if coalesce(length(x->>'drive_id'),0)=0 or coalesce(length(x->>'item_id'),0)=0
   or nullif(x->>'modified_at','') is null then raise exception 'Missing file identity or modification time'; end if;
  created:=nullif(x->>'created_at','')::timestamptz; modified:=(x->>'modified_at')::timestamptz;
  changed:=greatest(created,modified);
  if changed>stamp+interval '5 minutes' then raise exception 'Future file timestamp'; end if;
  insert into public.file_changes(workspace_id,drive_id,item_id,name,web_url,folder_path,created_at_source,modified_at_source,changed_at,change_kind,observed_at)
  values(p_workspace,x->>'drive_id',x->>'item_id',x->>'name',x->>'web_url',coalesce(x->>'folder_path',''),created,modified,changed,
   case when created is not null and created>=modified-interval '2 seconds' then 'created' else 'modified' end,stamp)
  on conflict(workspace_id,drive_id,item_id,changed_at) do nothing;
  get diagnostics n=row_count;total:=total+n;
 end loop;
 insert into public.file_sync_runs(id,workspace_id,checked_at,status,detail,file_count,fingerprint)
 values(p_feed->>'batch_id',p_workspace,stamp,p_feed->>'status',coalesce(p_feed->>'detail',''),jsonb_array_length(p_feed->'files'),fp);
 return jsonb_build_object('duplicate',false,'added',total);
end $$;
revoke all on function public.ingest_workdesk_files(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_workdesk_files(uuid,jsonb) to service_role;
alter publication supabase_realtime add table public.file_changes,public.file_sync_runs;
commit;
