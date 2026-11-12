-- Verify that internal SECURITY DEFINER trigger/scheduled functions cannot
-- be invoked directly by ordinary clients while shared-state triggers work.
\set ON_ERROR_STOP on
\i supabase/migrations/20261112210506_restrict_private_function_execution.sql
\i supabase/migrations/20261112210509_targeted_assignment_indexes.sql
do $privileges$
declare func text; p regprocedure;
begin
 foreach func in array array[
  'private.notify_clinical_sample_pending()',
  'private.notify_clinical_sample_registered()',
  'private.track_workspace_shared_state_keys()',
  'private.generate_coagulation_alerts()',
  'private.reset_workspace_operational_data(uuid,text)'
 ] loop
  p:=to_regprocedure(func);
  if p is not null then
   if has_function_privilege('authenticated',p,'execute')
    or has_function_privilege('anon',p,'execute') then
    raise exception 'Private function still callable: %',func;
   end if;
  end if;
 end loop;
 if to_regclass('public.home_visit_assignments_invited_preview_idx') is null
  or to_regclass('public.home_visit_assignments_recent_status_idx') is null then
  raise exception 'Expected focused assignment indexes missing';
 end if;
end $privileges$;
-- The track_workspace_shared_state_keys trigger continues to execute during
-- a legitimate authenticated write despite direct invocation being revoked.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $write$
declare r record; old_revision int;
begin
 select revision into old_revision
 from public.get_workspace_shared_app_state('10000000-0000-0000-0000-000000000001');
 select * into r from public.save_workspace_shared_app_state_patch(
 '10000000-0000-0000-0000-000000000001',
 '{"journey":{"id":"trigger-revoked-safe"}}'::jsonb,old_revision);
 if not r.saved then raise exception 'Authenticated trigger-backed write failed';end if;
end $write$;
reset role;
\echo 'OK: private helper calls restricted; trigger-backed workflows remain functional'
