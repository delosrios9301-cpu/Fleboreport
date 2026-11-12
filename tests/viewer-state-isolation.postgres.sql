-- Synthetic security regression tests for the production shared-state read RPC.
-- Runs after tests/shared-workspace-state.postgres.sql in isolated PostgreSQL.
\set ON_ERROR_STOP on
create or replace function private.has_workspace_permission(p_workspace_id uuid,p_module_key text,p_action_key text,p_site_id uuid default null)
returns boolean language sql stable security definer set search_path=''
as $allowed$
 select p_module_key='reports' and p_action_key='view'
   and exists(select 1 from public.workspace_members wm
    where wm.workspace_id=p_workspace_id and wm.user_id=auth.uid() and wm.active
      and wm.role in ('viewer','admin','reception'));
$allowed$;
-- Add synthetic confidential fields to confirm the server projection redacts them.
update public.workspace_shared_app_state
set state = state || '{"patients":[{"document":"synthetic-secret"}],"clinicalSamples":[{"id":"synthetic-secret"}],"reportHistory":[{"id":"safe-report"}],"reportHistoryLogos":{}}'::jsonb
where workspace_id='10000000-0000-0000-0000-000000000001';
\i supabase/migrations/20261112171000_viewer_state_projection.sql
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
do $viewer$
declare x jsonb;
begin
 select state into x from public.get_workspace_shared_app_state('10000000-0000-0000-0000-000000000001');
 if x ? 'patients' or x ? 'clinicalSamples' or x ? 'billingSettings' then
  raise exception 'Viewer received unauthorized modules';
 end if;
 if not (x ? 'reportHistory') then raise exception 'Viewer cannot access reports'; end if;
 if (select count(*) from jsonb_object_keys(x))<>2 then raise exception 'Unexpected viewer state keys'; end if;
end $viewer$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $reception$
declare x jsonb;
begin
 select state into x from public.get_workspace_shared_app_state('10000000-0000-0000-0000-000000000001');
 if not (x ? 'patients') then raise exception 'Reception lost existing patient data'; end if;
end $reception$;
reset role;
\echo 'OK: report-only viewer isolation, existing reception scope retained'
