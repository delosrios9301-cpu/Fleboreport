
revoke execute on function public.audit_workspace_app_state_change() from public, anon, authenticated;
revoke execute on function public.guard_home_visit_assignment_update() from public, anon, authenticated;
revoke execute on function public.guard_home_visit_technician_update() from public, anon, authenticated;
revoke execute on function public.log_clinical_sample_created() from public, anon, authenticated;
revoke execute on function public.cancel_home_visit(uuid, text) from public, anon;
grant execute on function public.cancel_home_visit(uuid, text) to authenticated;
