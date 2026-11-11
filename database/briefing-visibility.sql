-- Per-workspace presentation preferences. Does not modify tasks or source summaries.
begin;
create table public.briefing_dismissals (
 workspace_id uuid not null references public.workspaces(id),
 line_text text not null check (char_length(line_text) between 1 and 8000 and line_text=btrim(line_text)),
 line_key text generated always as (md5(line_text)) stored,
 hidden_at timestamptz,
 updated_at timestamptz not null default now(),
 primary key(workspace_id,line_key)
);
alter table public.briefing_dismissals enable row level security;
revoke all on public.briefing_dismissals from public,anon,authenticated;
grant select,insert,update on public.briefing_dismissals to authenticated;
grant all on public.briefing_dismissals to service_role;
create policy owner_read on public.briefing_dismissals for select to authenticated
 using (workdesk_private.can_access(workspace_id));
create policy owner_insert on public.briefing_dismissals for insert to authenticated
 with check (workdesk_private.can_access(workspace_id));
create policy owner_update on public.briefing_dismissals for update to authenticated
 using (workdesk_private.can_access(workspace_id)) with check (workdesk_private.can_access(workspace_id));

create function public.set_workdesk_briefing_hidden(p_workspace uuid,p_line text,p_hidden boolean)
returns public.briefing_dismissals language plpgsql security invoker set search_path='' as $$
declare item public.briefing_dismissals; clean text:=btrim(p_line);
begin
 if not workdesk_private.can_access(p_workspace) then raise exception 'Workspace not available'; end if;
 if p_hidden is null or clean is null or char_length(clean) not between 1 and 8000
 then raise exception 'Valid briefing text and visibility required'; end if;
 if p_hidden then
  insert into public.briefing_dismissals as existing(workspace_id,line_text,hidden_at,updated_at)
  values(p_workspace,clean,now(),now())
  on conflict(workspace_id,line_key) do update
   set hidden_at=coalesce(existing.hidden_at,excluded.hidden_at),updated_at=excluded.updated_at
   where existing.line_text=excluded.line_text
  returning * into item;
 else
  update public.briefing_dismissals set hidden_at=null,updated_at=now()
   where workspace_id=p_workspace and line_key=md5(clean) and line_text=clean
   returning * into item;
 end if;
 if not found then raise exception 'Briefing preference not available'; end if;
 return item;
end $$;
revoke all on function public.set_workdesk_briefing_hidden(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.set_workdesk_briefing_hidden(uuid,text,boolean) to authenticated;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(
  select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='briefing_dismissals')
 then alter publication supabase_realtime add table public.briefing_dismissals;end if;
end $$;
commit;
