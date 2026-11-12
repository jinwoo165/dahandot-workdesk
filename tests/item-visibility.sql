-- Local PostgreSQL only. Synthetic fixtures roll back; never run against production.
begin;
insert into public.workspaces(id,name) values
 ('00000000-0000-4000-8000-000000000101','Example'),
 ('00000000-0000-4000-8000-000000000102','Other');
insert into workdesk_private.access(workspace_id,allowed_email) values
 ('00000000-0000-4000-8000-000000000101','owner@example.test'),
 ('00000000-0000-4000-8000-000000000102','other@example.test');
insert into public.calendar_events(id,workspace_id,title,start_at,end_at,source_at) values
 ('fixture-event','00000000-0000-4000-8000-000000000101','Example meeting',now(),now()+interval '1 hour',now());
insert into public.file_changes(workspace_id,drive_id,item_id,name,web_url,modified_at_source,changed_at,change_kind,observed_at) values
 ('00000000-0000-4000-8000-000000000101','fixture-drive','fixture-file','Example.pdf','https://example.sharepoint.com/example.pdf',now(),now(),'modified',now());
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000201","email":"owner@example.test","is_anonymous":false}',true);
set local role authenticated;
do $$ declare event_row public.workdesk_item_visibility; file_row public.workdesk_item_visibility; saved public.workdesk_item_visibility; rejected boolean;
begin
 event_row:=public.set_workdesk_item_hidden('00000000-0000-4000-8000-000000000101','agenda','','fixture-event',true);
 file_row:=public.set_workdesk_item_hidden(event_row.workspace_id,'file','fixture-drive','fixture-file',true);
 if event_row.hidden_at is null or file_row.hidden_at is null or event_row.label<>'Example meeting' or file_row.label<>'Example.pdf'
 then raise exception 'Source-backed hide failed';end if;
 select * into saved from public.workdesk_item_visibility where workspace_id=event_row.workspace_id and kind='agenda' and item_id='fixture-event';
 if saved.hidden_at is distinct from event_row.hidden_at then raise exception 'Readback mismatch';end if;
 saved:=public.set_workdesk_item_hidden(event_row.workspace_id,'agenda','','fixture-event',true);
 if saved.hidden_at<>event_row.hidden_at or (select count(*) from public.workdesk_item_visibility)<>2 then raise exception 'Retry duplicated hide';end if;
 saved:=public.set_workdesk_item_hidden(event_row.workspace_id,'agenda','','fixture-event',false);
 if saved.hidden_at is not null then raise exception 'Event restore failed';end if;
 saved:=public.set_workdesk_item_hidden(file_row.workspace_id,'file','fixture-drive','fixture-file',false);
 if saved.hidden_at is not null then raise exception 'File restore failed';end if;
 if (select count(*) from public.calendar_events)<>1 or (select status from public.calendar_events where id='fixture-event')<>'confirmed'
 or (select count(*) from public.file_changes)<>1 then raise exception 'Original source changed';end if;
 rejected:=false;
 begin perform public.set_workdesk_item_hidden(event_row.workspace_id,'file','wrong-drive','fixture-file',true);
 exception when others then rejected:=true;end;
 if not rejected then raise exception 'Unverified source accepted';end if;
 rejected:=false;
 begin perform public.set_workdesk_item_hidden(event_row.workspace_id,'agenda','wrong-drive','fixture-event',true);
 exception when others then rejected:=true;end;
 if not rejected then raise exception 'Invalid agenda identity accepted';end if;
 rejected:=false;
 begin perform public.set_workdesk_item_hidden('00000000-0000-4000-8000-000000000102','agenda','','fixture-event',true);
 exception when others then rejected:=true;end;
 if not rejected then raise exception 'Other workspace accepted';end if;
 rejected:=false;
 begin update public.workdesk_item_visibility set workspace_id='00000000-0000-4000-8000-000000000102';
 exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'RLS workspace reassignment accepted';end if;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000202","email":"other@example.test","is_anonymous":false}',true);
do $$ begin
 if (select count(*) from public.workdesk_item_visibility)<>0 then raise exception 'Other account read preference';end if;
 update public.workdesk_item_visibility set hidden_at=now();
 if found then raise exception 'Other account updated preference';end if;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000201","email":"owner@example.test","is_anonymous":true}',true);
do $$ begin
 if (select count(*) from public.workdesk_item_visibility)<>0 then raise exception 'Anonymous account read preference';end if;
end $$;
reset role;
do $$ begin
 if has_table_privilege('anon','public.workdesk_item_visibility','select')
 or has_function_privilege('anon','public.set_workdesk_item_hidden(uuid,text,text,text,boolean)','execute')
 or has_table_privilege('authenticated','public.workdesk_item_visibility','delete')
 or (select prosecdef from pg_proc where oid='public.set_workdesk_item_hidden(uuid,text,text,text,boolean)'::regprocedure)
 then raise exception 'Unsafe permissions';end if;
end $$;
rollback;
