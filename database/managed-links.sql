-- Private bookmarks with owner removal and collector suppression of removed URLs.
begin;
alter table public.workspace_links add column removed_at timestamptz,
 add column source_checked_at timestamptz;
create unique index links_workspace_url on public.workspace_links(workspace_id,url);

create function public.set_workdesk_link_removed(p_link uuid,p_removed boolean)
returns public.workspace_links language plpgsql security definer set search_path='' as $$
declare item public.workspace_links;
begin
 if p_removed is null then raise exception 'Removal state required'; end if;
 select * into item from public.workspace_links where id=p_link and workdesk_private.can_access(workspace_id) for update;
 if not found then raise exception 'Link not available'; end if;
 update public.workspace_links set removed_at=case when p_removed then coalesce(removed_at,now()) else null end
 where id=p_link returning * into item;
 return item;
end $$;
revoke all on function public.set_workdesk_link_removed(uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_workdesk_link_removed(uuid,boolean) to authenticated;

create function public.ingest_workdesk_links(p_workspace uuid,p_feed jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare x jsonb; stamp timestamptz; item public.workspace_links; address text;
 added integer:=0; changed integer:=0; suppressed integer:=0; position integer;
begin
 if p_feed->>'type' is distinct from 'dahandot.links' or p_feed->>'schema_version' is distinct from '1'
 or jsonb_typeof(p_feed->'links') is distinct from 'array' or jsonb_array_length(p_feed->'links')>30
 or coalesce(p_feed->>'checked_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'Invalid link feed'; end if;
 stamp:=(p_feed->>'checked_at')::timestamptz;
 if stamp>now()+interval '5 minutes' then raise exception 'Future source time'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace::text,4));
 select coalesce(max(sort_order),-1)+1 into position from public.workspace_links where workspace_id=p_workspace;
 for x in select value from pg_catalog.jsonb_array_elements(p_feed->'links') loop
  address:=trim(x->>'url');
  if coalesce(length(address),0) not between 1 and 4000
   or address !~ '^https?://[^/?#@[:space:]]+([/?#][^[:space:]]*)?$'
   or coalesce(length(trim(x->>'label')),0) not between 1 and 200
   or length(coalesce(x->>'description',''))>1000 then raise exception 'Invalid link'; end if;
  select * into item from public.workspace_links where workspace_id=p_workspace and url=address for update;
  if found then
   if item.removed_at is not null then suppressed:=suppressed+1;continue;end if;
   if item.source_checked_at is not null and stamp<=item.source_checked_at then continue;end if;
   update public.workspace_links set label=trim(x->>'label'),description=coalesce(x->>'description',''),source_checked_at=stamp where id=item.id;
   changed:=changed+1;
  else
   insert into public.workspace_links(workspace_id,label,url,description,sort_order,source_checked_at)
   values(p_workspace,trim(x->>'label'),address,coalesce(x->>'description',''),position,stamp);
   position:=position+1;added:=added+1;
  end if;
 end loop;
 return pg_catalog.jsonb_build_object('added',added,'updated',changed,'suppressed',suppressed);
end $$;
revoke all on function public.ingest_workdesk_links(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_workdesk_links(uuid,jsonb) to service_role;
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='workspace_links')
 then alter publication supabase_realtime add table public.workspace_links;end if;
end $$;
commit;
