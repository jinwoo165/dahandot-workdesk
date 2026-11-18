-- Run as the migration role. Entire fixture transaction is rolled back.
begin;
do $$
declare w uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); ids uuid[];
 item public.workspace_links; stamp timestamptz; rejected boolean;
begin
 insert into public.workspaces(id,name) values(w,'rollback-only pin verification');
 insert into workdesk_private.access(workspace_id,allowed_email) values(w,'pins-test@example.invalid');
 insert into public.workspace_links(workspace_id,label,url)
 select w,'rollback-only '||n,'https://example.invalid/pin/'||n from generate_series(1,8) n;
 select array_agg(id order by label) into ids from public.workspace_links where workspace_id=w;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'email','pins-test@example.invalid','is_anonymous',false)::text,true);
 for n in 1..7 loop
  item:=public.set_workdesk_link_pinned(ids[n],true);
  assert item.pinned_at is not null and item.added_at is not null,'pin/default timestamp missing';
 end loop;
 stamp:=item.pinned_at;
 item:=public.set_workdesk_link_pinned(ids[7],true);
 assert item.pinned_at=stamp,'repeated pin changed timestamp';
 rejected:=false;
 begin perform public.set_workdesk_link_pinned(ids[8],true);
 exception when check_violation then rejected:=true; end;
 assert rejected,'eighth pin accepted';
 -- Trigger also guards writes from privileged ingestion/admin callers.
 rejected:=false;
 begin update public.workspace_links set pinned_at=now() where id=ids[8];
 exception when check_violation then rejected:=true; end;
 assert rejected,'direct eighth pin accepted';
 item:=public.set_workdesk_link_removed(ids[1],true);
 assert item.pinned_at is null and item.removed_at is not null,'removal retained pin';
 item:=public.set_workdesk_link_pinned(ids[8],true);
 item:=public.set_workdesk_link_removed(ids[1],false);
 assert item.pinned_at is null and item.removed_at is null,'restore bypassed limit';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'email','other@example.invalid')::text,true);
 rejected:=false;
 begin perform public.set_workdesk_link_pinned(ids[2],false);
 exception when raise_exception then rejected:=SQLERRM='Link not available'; end;
 assert rejected,'nonowner allowed';
 perform set_config('request.jwt.claims','{}',true);
 rejected:=false;
 begin perform public.set_workdesk_link_pinned(ids[2],false);
 exception when raise_exception then rejected:=SQLERRM='Link not available'; end;
 assert rejected,'unauthenticated caller allowed';
 assert not has_function_privilege('anon','public.set_workdesk_link_pinned(uuid,boolean)','EXECUTE'),'anonymous execute granted';
 assert has_function_privilege('authenticated','public.set_workdesk_link_pinned(uuid,boolean)','EXECUTE'),'owner RPC grant missing';
 assert not has_table_privilege('authenticated','public.workspace_links','UPDATE'),'direct write granted';
end $$;
rollback;
select 'link pin checks passed; all fixtures rolled back' as verification;
