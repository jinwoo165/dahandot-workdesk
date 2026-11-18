-- Apply after managed-links.sql. Existing links deliberately retain unknown added_at.
begin;
alter table public.workspace_links add column added_at timestamptz;
alter table public.workspace_links alter column added_at set default now();
alter table public.workspace_links add column pinned_at timestamptz;

-- Share the ingestion lock. Never grant browser roles direct writes to links.
create function workdesk_private.guard_workdesk_link_pins()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.removed_at is not null then new.pinned_at:=null; end if;
 if new.pinned_at is not null then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.workspace_id::text,4));
  if (select count(*) from public.workspace_links
      where workspace_id=new.workspace_id and removed_at is null
      and pinned_at is not null and id<>new.id)>=7 then
   raise exception '상위 고정은 최대 7개까지 가능합니다.' using errcode='23514';
  end if;
 end if;
 return new;
end $$;
revoke all on function workdesk_private.guard_workdesk_link_pins() from public,anon,authenticated;
create trigger guard_workdesk_link_pins before insert or update of pinned_at,removed_at,workspace_id
on public.workspace_links for each row execute function workdesk_private.guard_workdesk_link_pins();

create function public.set_workdesk_link_pinned(p_link uuid,p_pinned boolean)
returns public.workspace_links language plpgsql security definer set search_path='' as $$
declare item public.workspace_links; workspace uuid;
begin
 if p_pinned is null then raise exception 'Pin state required'; end if;
 select workspace_id into workspace from public.workspace_links
 where id=p_link and workdesk_private.can_access(workspace_id);
 if not found then raise exception 'Link not available'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(workspace::text,4));
 select * into item from public.workspace_links
 where id=p_link and workspace_id=workspace and workdesk_private.can_access(workspace_id) for update;
 if not found then raise exception 'Link not available'; end if;
 if p_pinned and item.removed_at is not null then raise exception 'Removed links cannot be pinned'; end if;
 update public.workspace_links
 set pinned_at=case when p_pinned then coalesce(pinned_at,now()) else null end
 where id=p_link returning * into item;
 return item;
end $$;
revoke all on function public.set_workdesk_link_pinned(uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_workdesk_link_pinned(uuid,boolean) to authenticated;

create or replace function public.set_workdesk_link_removed(p_link uuid,p_removed boolean)
returns public.workspace_links language plpgsql security definer set search_path='' as $$
declare item public.workspace_links; workspace uuid;
begin
 if p_removed is null then raise exception 'Removal state required'; end if;
 select workspace_id into workspace from public.workspace_links
 where id=p_link and workdesk_private.can_access(workspace_id);
 if not found then raise exception 'Link not available'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(workspace::text,4));
 select * into item from public.workspace_links
 where id=p_link and workspace_id=workspace and workdesk_private.can_access(workspace_id) for update;
 if not found then raise exception 'Link not available'; end if;
 update public.workspace_links
 set removed_at=case when p_removed then coalesce(removed_at,now()) else null end,
 pinned_at=case when p_removed or item.removed_at is not null then null else pinned_at end
 where id=p_link returning * into item;
 return item;
end $$;
revoke all on function public.set_workdesk_link_removed(uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_workdesk_link_removed(uuid,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
