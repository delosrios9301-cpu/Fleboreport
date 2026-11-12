-- Restrict direct invocation of private internal SECURITY DEFINER functions.
-- Trigger invocation and cron jobs owned by postgres remain operational.
-- Do not revoke helpers that RLS or authenticated RPCs must execute.
do $permissions$
declare
  func_signature text;
  function_oid regprocedure;
begin
 foreach func_signature in array array[
  'private.notify_clinical_sample_pending()',
  'private.notify_clinical_sample_registered()',
  'private.track_workspace_shared_state_keys()',
  'private.generate_coagulation_alerts()',
  'private.reset_workspace_operational_data(uuid,text)'
 ] loop
  function_oid:=to_regprocedure(func_signature);
  if function_oid is not null then
   execute format('revoke all on function %s from public, anon, authenticated',function_oid);
   -- Internal privileged services still need to run scheduled jobs.
   execute format('grant execute on function %s to service_role',function_oid);
  end if;
 end loop;
end;
$permissions$;
