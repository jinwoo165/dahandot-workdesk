-- Concise source-content summaries; never store full reports or attachments here.
begin;
create table public.file_summaries (
 workspace_id uuid not null references public.workspaces(id),
 drive_id text not null, item_id text not null,
 source_modified_at timestamptz not null,
 summary text not null default '' check(length(summary)<=1000),
 status text not null check(status in ('ok','partial','failed','unsupported')),
 detail text not null default '' check(length(detail)<=4000),
 checked_at timestamptz not null,
 primary key(workspace_id,drive_id,item_id),
 check((status in ('ok','partial') and length(trim(summary))>0) or (status in ('failed','unsupported') and summary=''))
);
alter table public.file_summaries enable row level security;
revoke all on public.file_summaries from public,anon,authenticated;
grant select on public.file_summaries to authenticated;
grant all on public.file_summaries to service_role;
create policy owner_read on public.file_summaries for select to authenticated
 using(workdesk_private.can_access(workspace_id));

create function public.ingest_workdesk_file_summaries(p_workspace uuid,p_feed jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare x jsonb; stamp timestamptz; modified timestamptz; total integer:=0; n integer;
begin
 if p_feed->>'type' is distinct from 'dahandot.file_summaries'
 or p_feed->>'schema_version' is distinct from '1'
 or jsonb_typeof(p_feed->'files') is distinct from 'array'
 or jsonb_array_length(p_feed->'files')>100 then raise exception 'Invalid summary feed'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace::text,3));
 for x in select value from pg_catalog.jsonb_array_elements(p_feed->'files') loop
  if coalesce(x->>'checked_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
   or coalesce(x->>'source_modified_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'Timezone required'; end if;
  stamp:=(x->>'checked_at')::timestamptz; modified:=(x->>'source_modified_at')::timestamptz;
  if stamp>now()+interval '5 minutes' or modified>stamp+interval '5 minutes' then raise exception 'Future summary time'; end if;
  if not exists(select 1 from public.file_changes f where f.workspace_id=p_workspace
   and f.drive_id=x->>'drive_id' and f.item_id=x->>'item_id' and f.modified_at_source=modified)
   then raise exception 'Collect the verified source version first'; end if;
  insert into public.file_summaries as existing(workspace_id,drive_id,item_id,source_modified_at,summary,status,detail,checked_at)
  values(p_workspace,x->>'drive_id',x->>'item_id',modified,coalesce(x->>'summary',''),x->>'status',coalesce(x->>'detail',''),stamp)
  on conflict(workspace_id,drive_id,item_id) do update set
   source_modified_at=excluded.source_modified_at,summary=excluded.summary,status=excluded.status,
   detail=excluded.detail,checked_at=excluded.checked_at
  where excluded.source_modified_at>=existing.source_modified_at and excluded.checked_at>existing.checked_at
   and not(excluded.source_modified_at=existing.source_modified_at and existing.status in ('ok','partial') and excluded.status in ('failed','unsupported'));
  get diagnostics n=row_count; total:=total+n;
 end loop;
 return pg_catalog.jsonb_build_object('saved',total);
end $$;
revoke all on function public.ingest_workdesk_file_summaries(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_workdesk_file_summaries(uuid,jsonb) to service_role;
alter publication supabase_realtime add table public.file_summaries;
commit;
