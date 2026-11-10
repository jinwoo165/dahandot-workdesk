-- Integration assertions use only synthetic data, and always roll back.
begin;
insert into public.workspaces(id,name) values('11111111-1111-4111-8111-111111111111','Conversation QA');
insert into workdesk_private.access(workspace_id,allowed_email) values('11111111-1111-4111-8111-111111111111','qa-owner@example.invalid');
insert into public.tasks(id,workspace_id,title) values('conversation:qa-task','11111111-1111-4111-8111-111111111111','가상 업무');
insert into public.calendar_events(id,workspace_id,title,start_at,end_at,source_at) values('conversation:qa-event','11111111-1111-4111-8111-111111111111','가상 회의','2026-11-13T13:00:00+09:00','2026-11-13T14:00:00+09:00','2026-11-10T08:00:00+09:00');
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","email":"qa-owner@example.invalid","role":"authenticated"}',true);
set local role authenticated;
select public.record_workdesk_message('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333331','자료는 보냈어. 금요일에 답변 확인하면 돼.','conversation:qa-task',null);
select public.record_workdesk_message('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333331','자료는 보냈어. 금요일에 답변 확인하면 돼.','conversation:qa-task',null);
do $$ begin
 if (select count(*) from public.workdesk_messages)<>1 then raise exception 'Owner scope or idempotency failed'; end if;
 if (select status from public.tasks where id='conversation:qa-task')<>'review' then raise exception 'Unprocessed text changed task'; end if;
 if has_function_privilege('authenticated','public.resolve_workdesk_message(uuid,text,jsonb,boolean)','EXECUTE') then raise exception 'Client can forge assistant'; end if;
 if has_column_privilege('authenticated','public.workdesk_messages','reply','INSERT') or has_table_privilege('authenticated','public.workdesk_messages','UPDATE') then raise exception 'Client can overwrite conversation'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","email":"outsider@example.invalid","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.workdesk_messages)<>0 then raise exception 'Outsider read messages'; end if;
 begin
 perform public.record_workdesk_message('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333339','forged',null,null);
 raise exception 'Outsider submitted message';
 exception when others then if SQLERRM<>'Access denied' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claims','{}',true);
select public.resolve_workdesk_message('33333333-3333-4333-8333-333333333331','자료 전달은 완료했고 금요일에는 답변만 확인하도록 정리했습니다.', '[{"kind":"task","id":"conversation:qa-task","expected_revision":1,"patch":{"status":"partial","note":"자료 전달 완료","remaining_action":"답변 확인","next_review_on":"2026-11-13","next_action":"답변 확인"}}]');
select public.resolve_workdesk_message('33333333-3333-4333-8333-333333333331','retry','[]');
do $$ begin
 if not exists(select 1 from public.tasks where id='conversation:qa-task' and status='partial' and revision=2 and next_review_on='2026-11-13' and 'next_action'=any(user_fields)) then raise exception 'Partial or duplicate resolution failed'; end if;
 if not exists(select 1 from public.workdesk_messages where id='33333333-3333-4333-8333-333333333331' and resolution_status='applied' and jsonb_array_length(changes)=1) then raise exception 'Reply/history missing'; end if;
end $$;
insert into public.workdesk_messages(id,workspace_id,task_id,body) values('33333333-3333-4333-8333-333333333332','11111111-1111-4111-8111-111111111111','conversation:qa-task','답변도 받았어. 다 끝났어.');
do $$ begin
 begin
 perform public.resolve_workdesk_message('33333333-3333-4333-8333-333333333332','완료','[{"kind":"task","id":"conversation:qa-task","expected_revision":1,"patch":{"status":"done","remaining_action":"","next_review_on":null}}]');
 raise exception 'Stale revision accepted';
 exception when others then if SQLERRM not like 'CONFLICT:%' then raise; end if; end;
 if (select resolution_status from public.workdesk_messages where id='33333333-3333-4333-8333-333333333332')<>'pending' then raise exception 'Failure incorrectly marked applied'; end if;
end $$;
select public.resolve_workdesk_message('33333333-3333-4333-8333-333333333332','완료로 정리하고 다음 확인에서는 제외했습니다.','[{"kind":"task","id":"conversation:qa-task","expected_revision":2,"patch":{"status":"done","remaining_action":"","next_review_on":null}}]');
insert into public.workdesk_messages(id,workspace_id,event_id,body) values('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','conversation:qa-event','나는 참석 안 해. 내 일정에서 빼줘.');
select public.resolve_workdesk_message('33333333-3333-4333-8333-333333333333','내 업무보드에서 제외했습니다. 원본 초대는 유지됩니다.','[{"kind":"event","id":"conversation:qa-event","expected_source_at":"2026-11-10T08:00:00+09:00","expected_revision":0,"patch":{"excluded":true,"reason":"본인 참석 없음"}}]');
update public.calendar_events set note='source refresh' where id='conversation:qa-event';
do $$ begin
 if not exists(select 1 from public.calendar_overrides where event_id='conversation:qa-event' and excluded) then raise exception 'Calendar exclusion missing'; end if;
 if (select status from public.calendar_events where id='conversation:qa-event')<>'confirmed' then raise exception 'Calendar source modified'; end if;
 if not exists(select 1 from public.tasks where id='conversation:qa-task' and status='done' and completed_at is not null and next_review_on is null) then raise exception 'Completion failed'; end if;
end $$;
insert into public.workdesk_messages(id,workspace_id,body) values('33333333-3333-4333-8333-333333333334','11111111-1111-4111-8111-111111111111','그거 미뤄줘');
select public.resolve_workdesk_message('33333333-3333-4333-8333-333333333334','어떤 일을 언제로 미룰까요?','[]',true);
insert into public.workdesk_messages(id,workspace_id,body) values('33333333-3333-4333-8333-333333333335','11111111-1111-4111-8111-111111111111','월요일에 새 자료 검토도 해야 해');
select public.resolve_workdesk_message('33333333-3333-4333-8333-333333333335','새 자료 검토를 월요일에 챙기도록 남겼습니다.','[{"kind":"new_task","id":"conversation:qa-followup","patch":{"title":"새 자료 검토","status":"todo","next_review_on":"2026-11-16","next_action":"새 자료 검토"}}]');
do $$ begin
 if (select resolution_status from public.workdesk_messages where id='33333333-3333-4333-8333-333333333334')<>'clarification' then raise exception 'Clarification lost'; end if;
 if not exists(select 1 from public.tasks where id='conversation:qa-followup' and origin='manual' and next_review_on='2026-11-16') then raise exception 'Followup creation failed'; end if;
end $$;
select 'PASS: owner/outsider RLS, immutable replies, idempotent send/resolve, pending truthfulness, partial/done, conflict rollback, calendar exclusion/source preservation, clarification, followup creation' as result;
rollback;
