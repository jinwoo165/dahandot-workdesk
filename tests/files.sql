-- Synthetic metadata only. No real files or users are modified.
begin;
insert into public.workspaces(id,name) values('11111111-1111-4111-8111-111111111111','Files QA');
insert into workdesk_private.access(workspace_id,allowed_email) values('11111111-1111-4111-8111-111111111111','qa-owner@example.invalid');
do $$ declare f jsonb; result jsonb; begin
 f:=jsonb_build_object('schema_version',1,'type','dahandot.files','batch_id','files:qa:1','checked_at',now()-interval '1 hour','status','ok','files',jsonb_build_array(jsonb_build_object('drive_id','qa','item_id','one','name','example.pdf','web_url','https://example.sharepoint.com/document.pdf','created_at',now()-interval '1 day','modified_at',now()-interval '1 day')));
 perform public.ingest_workdesk_files('11111111-1111-4111-8111-111111111111',f);
 result:=public.ingest_workdesk_files('11111111-1111-4111-8111-111111111111',f);
 if result->>'duplicate'<>'true' or (select count(*) from public.file_changes where workspace_id='11111111-1111-4111-8111-111111111111')<>1 then raise exception 'Duplicate check failed'; end if;
 if (select change_kind from public.file_changes where workspace_id='11111111-1111-4111-8111-111111111111')<>'created' then raise exception 'Creation classification failed'; end if;
 begin
  perform public.ingest_workdesk_files('11111111-1111-4111-8111-111111111111',f||jsonb_build_object('batch_id','files:qa:old','checked_at',now()-interval '2 hours'));
  raise exception 'Old check accepted';
 exception when others then if SQLERRM<>'Outdated file feed' then raise; end if; end;
 f:=jsonb_set(f,'{files,0,modified_at}',to_jsonb(now()-interval '30 minutes'))||jsonb_build_object('batch_id','files:qa:2','checked_at',now());
 perform public.ingest_workdesk_files('11111111-1111-4111-8111-111111111111',f);
 if (select count(*) from public.file_changes where workspace_id='11111111-1111-4111-8111-111111111111')<>2 then raise exception 'History overwritten'; end if;
 perform public.ingest_workdesk_files('11111111-1111-4111-8111-111111111111',jsonb_build_object('schema_version',1,'type','dahandot.files','batch_id','files:qa:failed','checked_at',now(),'status','failed','files','[]'::jsonb));
 if (select count(*) from public.file_changes where workspace_id='11111111-1111-4111-8111-111111111111')<>2 then raise exception 'Failed check erased files'; end if;
 begin
  perform public.ingest_workdesk_files('11111111-1111-4111-8111-111111111111',jsonb_set(f,'{files,0,web_url}','"https://evil.invalid/file"')||jsonb_build_object('batch_id','files:qa:unsafe'));
  raise exception 'Unsafe URL accepted';
 exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","email":"qa-owner@example.invalid","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if (select count(*) from public.file_changes)<>2 then raise exception 'Owner scope failed'; end if;
 if has_function_privilege('authenticated','public.ingest_workdesk_files(uuid,jsonb)','EXECUTE') or has_table_privilege('authenticated','public.file_changes','UPDATE') then raise exception 'Collector publicly writable'; end if;
 if has_table_privilege('anon','public.file_changes','SELECT') then raise exception 'Anonymous metadata access'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","email":"outsider@example.invalid","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.file_changes)<>0 or (select count(*) from public.file_sync_runs)<>0 then raise exception 'Outsider read metadata'; end if;
end $$;
reset role;
select 'PASS: owner/outsider RLS, private collector, creation/modification history, duplicate and stale feed protection, failed-check preservation, unsafe URL rejection' as result;
rollback;
