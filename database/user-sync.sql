-- Per-user read receipts, conversation drafts and appearance preferences.
begin;
create table public.workdesk_user_state (
 workspace_id uuid not null references public.workspaces(id),
 user_id uuid not null default auth.uid(),
 state_key text not null check(octet_length(state_key) between 1 and 1800),
 value jsonb not null check(octet_length(value::text)<=100000),
 revision bigint not null default 1 check(revision>0),
 updated_at timestamptz not null default now(),
 primary key(workspace_id,user_id,state_key),
 check(state_key like 'read:%' or state_key like 'draft:%' or state_key in ('pref:theme','pref:scenery'))
);
alter table public.workdesk_user_state enable row level security;
revoke all on public.workdesk_user_state from public,anon,authenticated;
grant select,insert,update on public.workdesk_user_state to authenticated;
create policy own_read on public.workdesk_user_state for select to authenticated
 using(user_id=(select auth.uid()) and workdesk_private.can_access(workspace_id));
create policy own_insert on public.workdesk_user_state for insert to authenticated
 with check(user_id=(select auth.uid()) and workdesk_private.can_access(workspace_id));
create policy own_update on public.workdesk_user_state for update to authenticated
 using(user_id=(select auth.uid()) and workdesk_private.can_access(workspace_id))
 with check(user_id=(select auth.uid()) and workdesk_private.can_access(workspace_id));
create function public.save_workdesk_user_state(p_workspace uuid,p_key text,p_value jsonb,p_revision bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.workdesk_user_state;
begin
 if auth.uid() is null or not workdesk_private.can_access(p_workspace) then raise exception 'Workspace not available'; end if;
 if p_revision=0 or p_key like 'read:%' then
  insert into public.workdesk_user_state(workspace_id,user_id,state_key,value)
  values(p_workspace,auth.uid(),p_key,p_value)
  on conflict(workspace_id,user_id,state_key) do nothing returning * into saved;
 else
  update public.workdesk_user_state set value=p_value,revision=revision+1,updated_at=now()
  where workspace_id=p_workspace and user_id=auth.uid() and state_key=p_key and revision=p_revision returning * into saved;
 end if;
 if saved.state_key is not null then return jsonb_build_object('ok',true,'row',to_jsonb(saved));end if;
 select * into saved from public.workdesk_user_state where workspace_id=p_workspace and user_id=auth.uid() and state_key=p_key;
 return jsonb_build_object('ok',p_key like 'read:%' or saved.value=p_value,'row',to_jsonb(saved));
end $$;
revoke all on function public.save_workdesk_user_state(uuid,text,jsonb,bigint) from public,anon;
grant execute on function public.save_workdesk_user_state(uuid,text,jsonb,bigint) to authenticated;
alter publication supabase_realtime add table public.workdesk_user_state;
commit;
