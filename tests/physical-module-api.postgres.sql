-- User simulation only; no production patient records.
\set ON_ERROR_STOP on
\i supabase/migrations/20261112202124_modular_api.sql
reset role;
create or replace function private.has_workspace_permission(
 p_workspace_id uuid,p_module_key text,p_action_key text,p_site_id uuid default null)
returns boolean language sql stable security definer set search_path=''
as $allow$
 select (p_module_key='patients' and p_action_key='delete'
  and exists(select 1 from public.workspace_members m
    where m.workspace_id=p_workspace_id and m.user_id=auth.uid()
      and m.role='admin' and m.active))
  or (p_module_key in ('reports','journeys') and p_action_key in ('view','edit'))
$allow$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $verify$
declare ws uuid:='10000000-0000-0000-0000-000000000001';
  jrev integer; rrev integer; done boolean; grev int; newrev int;
  modular jsonb; legacy jsonb; vers jsonb;
begin
 select state into legacy from public.get_workspace_shared_app_state(ws);
 select state,module_revisions into modular,vers from public.get_workspace_modular_snapshot(ws);
 if modular is distinct from legacy then raise exception 'Initial modular read mismatch';end if;
 if (select count(*) from jsonb_object_keys(vers))<>9 then raise exception 'Module version missing';end if;
 select module_revision into jrev from public.get_workspace_module_state(ws,'journeys');
 select module_revision into rrev from public.get_workspace_module_state(ws,'reports');
 select saved,revision,module_revision into done,grev,newrev
 from public.save_workspace_module_state(ws,'journeys',
  '{"journey":{"id":"synthetic-jornada"}}'::jsonb,jrev);
 if not done or newrev<=jrev then raise exception 'Journey write failed';end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
 select saved,revision,module_revision into done,grev,newrev
 from public.save_workspace_module_state(ws,'reports',
  '{"reportHistory":[{"id":"synthetic-report"}]}'::jsonb,rrev);
 if not done or newrev<=rrev then raise exception 'Cross-module concurrent edit failed';end if;
 select saved,revision,module_revision into done,grev,newrev
 from public.save_workspace_module_state(ws,'reports','{"reportHistory":[]}'::jsonb,rrev);
 if done then raise exception 'Stale same-module edit accepted';end if;
 select state into modular from public.get_workspace_modular_snapshot(ws);
 select state into legacy from public.get_workspace_shared_app_state(ws);
 if modular is distinct from legacy then raise exception 'Modular data drift after concurrent writes';end if;
 if modular->'journey'->>'id'<>'synthetic-jornada'
 or modular->'reportHistory'->0->>'id'<>'synthetic-report' then
  raise exception 'Cross-module update lost';end if;
end $verify$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
do $viewer$
declare data jsonb;
begin
 select state into data from public.get_workspace_modular_snapshot(
 '10000000-0000-0000-0000-000000000001');
 if data ? 'patients' or data ? 'journey' or data ? 'company' then
  raise exception 'Viewer received sensitive module state';end if;
 if not data ? 'reportHistory' then raise exception 'Viewer report missing';end if;
 begin
  perform * from public.get_workspace_module_state(
   '10000000-0000-0000-0000-000000000001','patients');
  raise exception 'Viewer accessed patients';
 exception when others then
  if sqlerrm='Viewer accessed patients' then raise;end if;
  if sqlerrm not like '%Módulo no autorizado%' then raise;end if;
 end;
end $viewer$;
reset role;
do $security$
begin
 if has_function_privilege('anon','public.get_workspace_modular_snapshot(uuid)','execute')
 or has_function_privilege('anon','public.save_workspace_module_state(uuid,text,jsonb,integer)','execute')
 then raise exception 'Anonymous modular RPC exposed';end if;
end $security$;
\echo 'OK: modular client RPC read parity, independent module CAS, role access'
