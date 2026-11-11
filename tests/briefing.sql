-- Local PostgreSQL fixture only. Never create these fixtures in production.
-- Run after schema.sql and briefing-visibility.sql; no test records persist.
begin;
insert into public.workspaces(id,name) values
 ('00000000-0000-4000-8000-000000000101','Example workspace'),
 ('00000000-0000-4000-8000-000000000102','Other workspace');
insert into workdesk_private.access(workspace_id,allowed_email) values
 ('00000000-0000-4000-8000-000000000101','owner@example.test'),
 ('00000000-0000-4000-8000-000000000102','other@example.test');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000201","email":"owner@example.test","is_anonymous":false}',true);
set local role authenticated;
do $$ declare first_row public.briefing_dismissals; saved public.briefing_dismissals; rejected boolean;
begin
 first_row:=public.set_workdesk_briefing_hidden('00000000-0000-4000-8000-000000000101','검토 요청: ''인용''',true);
 if first_row.hidden_at is null then raise exception 'Hide did not persist'; end if;
 select * into saved from public.briefing_dismissals where workspace_id=first_row.workspace_id and line_key=first_row.line_key;
 if saved.line_text is distinct from first_row.line_text then raise exception 'Readback mismatch'; end if;
 saved:=public.set_workdesk_briefing_hidden(first_row.workspace_id,first_row.line_text,true);
 if saved.hidden_at<>first_row.hidden_at or (select count(*) from public.briefing_dismissals)<>1 then raise exception 'Retry duplicated preference'; end if;
 saved:=public.set_workdesk_briefing_hidden(first_row.workspace_id,first_row.line_text,false);
 if saved.hidden_at is not null or (select hidden_at from public.briefing_dismissals where line_key=saved.line_key) is not null then raise exception 'Restore did not persist'; end if;
 rejected:=false;
 begin perform public.set_workdesk_briefing_hidden('00000000-0000-4000-8000-000000000102','Other workspace text',true);
 exception when others then rejected:=true;end;
 if not rejected then raise exception 'Other workspace accepted';end if;
 rejected:=false;
 begin perform public.set_workdesk_briefing_hidden(first_row.workspace_id,'  ',true);
 exception when others then rejected:=true;end;
 if not rejected then raise exception 'Empty text accepted';end if;
 rejected:=false;
 begin perform public.set_workdesk_briefing_hidden(first_row.workspace_id,repeat('x',8001),true);
 exception when others then rejected:=true;end;
 if not rejected then raise exception 'Oversized text accepted';end if;
 rejected:=false;
 begin perform public.set_workdesk_briefing_hidden(first_row.workspace_id,first_row.line_text,null);
 exception when others then rejected:=true;end;
 if not rejected then raise exception 'Null visibility accepted';end if;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000202","email":"other@example.test","is_anonymous":false}',true);
do $$ declare rejected boolean:=false; begin
 if (select count(*) from public.briefing_dismissals)<>0 then raise exception 'Other account read preference';end if;
 begin insert into public.briefing_dismissals(workspace_id,line_text,hidden_at)
 values('00000000-0000-4000-8000-000000000101','Unauthorized text',now());
 exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'RLS insert bypass';end if;
 update public.briefing_dismissals set hidden_at=now() where workspace_id='00000000-0000-4000-8000-000000000101';
 if found then raise exception 'RLS update bypass';end if;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000201","email":"owner@example.test","is_anonymous":true}',true);
do $$ begin
 if (select count(*) from public.briefing_dismissals)<>0 then raise exception 'Anonymous account read preference';end if;
end $$;
reset role;
do $$ begin
 if has_table_privilege('anon','public.briefing_dismissals','select')
 or has_function_privilege('anon','public.set_workdesk_briefing_hidden(uuid,text,boolean)','execute')
 or has_table_privilege('authenticated','public.briefing_dismissals','delete')
 then raise exception 'Unexpected public or delete access';end if;
 if (select prosecdef from pg_proc where oid='public.set_workdesk_briefing_hidden(uuid,text,boolean)'::regprocedure)
 then raise exception 'RPC must use caller permissions';end if;
end $$;
rollback;
