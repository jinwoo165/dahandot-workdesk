-- Collector-only completion evidence. No tasks, messages, credentials, or source copies.
begin;
create table public.source_collection_results (
 workspace_id uuid not null references public.workspaces(id), source_id text not null,
 run_id text not null, checked_at timestamptz not null,
 status text not null check(status in ('ok','partial','failed')),
 scope jsonb not null, checks jsonb not null, missing jsonb not null,
 detail text not null default '', feed_batch_id text, file_batch_id text,
 verified_at timestamptz, last_success_at timestamptz,
 next_expected_at timestamptz, schedule_verified_at timestamptz,
 fingerprint text not null, recorded_at timestamptz not null default now(),
 primary key(workspace_id,source_id),
 check(jsonb_typeof(scope)='object' and jsonb_typeof(checks)='object' and jsonb_typeof(missing)='array'),
 check(length(detail)<=6000)
);
alter table public.source_collection_results enable row level security;
revoke all on public.source_collection_results from public,anon,authenticated;
grant select on public.source_collection_results to authenticated;
grant all on public.source_collection_results to service_role;
create policy owner_read on public.source_collection_results for select to authenticated
 using(workdesk_private.can_access(workspace_id));

create function public.record_workdesk_collection(p_workspace uuid,p_report jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare sid text:=p_report->>'source_id'; stamp timestamptz; fp text; previous public.source_collection_results;
 required text[]; key text; c jsonb; expected integer; checked integer; all_done boolean:=true;
 feed_id text:=nullif(p_report->>'feed_batch_id',''); file_id text:=nullif(p_report->>'file_batch_id','');
 source jsonb; stored boolean:=false; result_status text:=p_report->>'status'; due timestamptz; calendar_at timestamptz;
begin
 required:=case sid
  when 'dooray-mail' then array['listing','content','attachments']
  when 'dooray-favorites' then array['favorites','history','attachments']
  when 'dooray-calendar' then array['listing','details']
  when 'google-primary' then array['listing']
  when 'google-secondary' then array['listing']
  when 'onedrive-files' then array['modified_search','created_search','folder_listing','metadata'] end;
 if required is null or p_report->>'schema_version' is distinct from '1'
  or result_status is null or result_status not in ('ok','partial','failed')
  or coalesce(length(p_report->>'run_id'),0) not between 1 and 200
  or coalesce(p_report->>'checked_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
  or jsonb_typeof(p_report->'scope') is distinct from 'object'
  or coalesce(length(trim(p_report#>>'{scope,description}')),0)=0
  or jsonb_typeof(p_report#>'{scope,limitations}') is distinct from 'array'
  or jsonb_typeof(p_report->'checks') is distinct from 'object'
  or jsonb_typeof(p_report->'missing') is distinct from 'array'
  or coalesce(length(trim(p_report->>'detail')),0)=0 then raise exception 'Invalid collection evidence'; end if;
 stamp:=(p_report->>'checked_at')::timestamptz;
 if stamp>now()+interval '5 minutes' then raise exception 'Future collection time'; end if;
 if coalesce(p_report#>>'{scope,from}','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
  or coalesce(p_report#>>'{scope,to}','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
  or (p_report#>>'{scope,from}')::timestamptz>=(p_report#>>'{scope,to}')::timestamptz
  then raise exception 'Collection range required'; end if;
 foreach key in array required loop
  c:=p_report->'checks'->key;
  if c is null then all_done:=false;continue;end if;
  if jsonb_typeof(c) is distinct from 'object' or jsonb_typeof(c->'complete') is distinct from 'boolean'
   or coalesce(c->>'expected','') !~ '^[0-9]+$' or coalesce(c->>'checked','') !~ '^[0-9]+$'
   then raise exception 'Invalid check counts: %',key;end if;
  expected:=(c->>'expected')::int; checked:=(c->>'checked')::int;
  if checked>expected then raise exception 'Checked exceeds expected';end if;
  if not(c->>'complete')::boolean or checked<>expected then all_done:=false;end if;
 end loop;
 for c in select value from jsonb_array_elements(p_report->'missing') loop
  if coalesce(length(trim(c->>'target')),0)=0 or coalesce(length(trim(c->>'reason')),0)=0
   then raise exception 'Missing item needs target and reason';end if;
 end loop;
 if nullif(p_report->>'next_expected_at','') is not null then
  if coalesce(p_report->>'next_expected_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
   or coalesce(p_report->>'schedule_verified_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
   then raise exception 'Verified holiday calendar and timezone required';end if;
  due:=(p_report->>'next_expected_at')::timestamptz;calendar_at:=(p_report->>'schedule_verified_at')::timestamptz;
  if due<=stamp or extract(isodow from due at time zone 'Asia/Seoul') in (6,7)
   or (due at time zone 'Asia/Seoul')::time<>'13:00'::time or calendar_at>now()+interval '5 minutes'
   then raise exception 'Invalid next scheduled check';end if;
 end if;
 perform 1 from public.workspaces where id=p_workspace for update;
 if not found then raise exception 'Workspace not found';end if;
 fp:=md5(p_report::text);
 select * into previous from public.source_collection_results where workspace_id=p_workspace and source_id=sid;
 if found then
  if stamp<previous.checked_at then return jsonb_build_object('ignored','older observation');end if;
  if stamp=previous.checked_at then
   if previous.fingerprint<>fp then raise exception 'Observation content conflict';end if;
   return jsonb_build_object('duplicate',true);end if;
 end if;
 if sid='onedrive-files' and file_id is not null then
  select true into stored from public.file_sync_runs f where f.workspace_id=p_workspace and f.id=file_id
   and f.checked_at=stamp and (result_status='failed' or f.status<>'failed');
 elsif sid<>'onedrive-files' and feed_id is not null then
  select s into source from public.sync_runs r cross join lateral jsonb_array_elements(r.sources) s
   where r.workspace_id=p_workspace and r.id=feed_id and s->>'id'=sid
   and (s->>'checked_at')::timestamptz=stamp and s->>'status' in ('ok','partial','failed') limit 1;
  stored:=source is not null and (result_status='failed' or source->>'status'<>'failed');
 end if;
 if result_status='ok' and (not all_done or jsonb_array_length(p_report->'missing')<>0 or not coalesce(stored,false))
  then raise exception 'Completion requires all checks and a persisted matching feed';end if;
 if result_status<>'ok' and jsonb_array_length(p_report->'missing')=0 then raise exception 'Incomplete collection needs a reason';end if;
 insert into public.source_collection_results as current(workspace_id,source_id,run_id,checked_at,status,scope,checks,missing,detail,
  feed_batch_id,file_batch_id,verified_at,last_success_at,next_expected_at,schedule_verified_at,fingerprint)
 values(p_workspace,sid,p_report->>'run_id',stamp,result_status,p_report->'scope',p_report->'checks',p_report->'missing',p_report->>'detail',
  feed_id,file_id,case when stored then now() end,case when result_status='ok' then stamp else previous.last_success_at end,due,calendar_at,fp)
 on conflict(workspace_id,source_id) do update set
  run_id=excluded.run_id,checked_at=excluded.checked_at,status=excluded.status,scope=excluded.scope,checks=excluded.checks,missing=excluded.missing,
  detail=excluded.detail,feed_batch_id=excluded.feed_batch_id,file_batch_id=excluded.file_batch_id,verified_at=excluded.verified_at,
  last_success_at=excluded.last_success_at,next_expected_at=excluded.next_expected_at,schedule_verified_at=excluded.schedule_verified_at,
  fingerprint=excluded.fingerprint,recorded_at=now();
 return jsonb_build_object('saved',true,'status',result_status,'stored',coalesce(stored,false));
end $$;
revoke all on function public.record_workdesk_collection(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_workdesk_collection(uuid,jsonb) to service_role;
alter publication supabase_realtime add table public.source_collection_results;
commit;
