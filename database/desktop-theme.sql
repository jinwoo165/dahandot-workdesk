-- PC appearance is independent from the existing mobile light/dark setting.
begin;
alter table public.workdesk_user_state drop constraint workdesk_user_state_state_key_check1;
alter table public.workdesk_user_state add constraint workdesk_user_state_state_key_check1
 check(state_key like 'read:%' or state_key like 'draft:%' or state_key in ('pref:theme','pref:scenery','pref:desktop-theme'));
commit;
