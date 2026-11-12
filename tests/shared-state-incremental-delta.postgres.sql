-- Delta tests use only synthetic data created in the preceding integration suite.
\set ON_ERROR_STOP on
\i supabase/migrations/20261112184000_shared_state_incremental_deltas.sql
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $test$
declare
 v_workspace uuid:='10000000-0000-0000-0000-000000000001';
 v_before integer;
 v_first integer;
 v_last integer;
 v_saved boolean;
 v_delta record;
 v_state jsonb;
begin
 select revision into v_before from public.get_workspace_shared_app_state(v_workspace);
 select saved,revision into v_saved,v_first from public.save_workspace_shared_app_state_patch(
  v_workspace,'{"journey":{"id":"latest-delta-journey"}}'::jsonb,v_before);
 if not v_saved or v_first<>v_before+1 then raise exception 'First delta source write failed';end if;
 select saved,revision into v_saved,v_last from public.save_workspace_shared_app_state_patch(
  v_workspace,'{"reportHistory":[{"id":"synthetic-report"}]}'::jsonb,v_first);
 if not v_saved or v_last<>v_first+1 then raise exception 'Second delta source write failed';end if;
 select * into v_delta from public.get_workspace_shared_app_state_delta(v_workspace,v_before);
 if v_delta.revision<>v_last or v_delta.full_required then raise exception 'Delta revision mismatch';end if;
 if v_delta.state->'journey'->>'id'<>'latest-delta-journey'
  or v_delta.state->'reportHistory'->0->>'id'<>'synthetic-report' then
  raise exception 'Missing changes across multiple revisions';end if;
 if v_delta.state ? 'patients' or v_delta.state ? 'company' then
  raise exception 'Unchanged private sections included in delta';end if;
 select * into v_delta from public.get_workspace_shared_app_state_delta(v_workspace,v_first);
 if v_delta.state ? 'journey' or not v_delta.state ? 'reportHistory' then
  raise exception 'Delta included already-seen keys';end if;

 -- A legacy full-state write removing one top-level key must be tracked.
 select state into v_state from public.get_workspace_shared_app_state(v_workspace);
 select saved,revision into v_saved,v_last from public.save_workspace_shared_app_state(
  v_workspace,v_state-'journey',v_last);
 if not v_saved then raise exception 'Legacy write of removed key failed';end if;
 select * into v_delta from public.get_workspace_shared_app_state_delta(v_workspace,v_last-1);
 if not 'journey'=any(v_delta.removed_keys) then
  raise exception 'Removed section did not reach client';end if;
end $test$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
do $viewer$
declare
 v_workspace uuid:='10000000-0000-0000-0000-000000000001';
 v_delta record;
begin
 select * into v_delta from public.get_workspace_shared_app_state_delta(v_workspace,0);
 if v_delta.state ? 'patients' or v_delta.state ? 'journey' or v_delta.state ? 'company' then
  raise exception 'Viewer received private sections';end if;
 if v_delta.state ? 'reportHistory' is false then raise exception 'Viewer report delta missing';end if;
end $viewer$;
reset role;
do $authz$
begin
 if has_function_privilege('anon','public.get_workspace_shared_app_state_delta(uuid,integer)','execute') then
  raise exception 'Anonymous user may read delta';end if;
end $authz$;
\echo 'OK: incremental reads, missed revisions, deletions, viewer isolation'
