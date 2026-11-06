-- Keep trigger-only SECURITY DEFINER functions out of the public RPC surface.
-- PostgreSQL does not require callers to hold EXECUTE on a trigger function
-- for an already-installed trigger to invoke it.
revoke execute on function public.audit_workspace_app_state_change() from public, anon, authenticated;
revoke execute on function public.guard_home_visit_assignment_update() from public, anon, authenticated;
revoke execute on function public.guard_home_visit_technician_update() from public, anon, authenticated;
revoke execute on function public.log_clinical_sample_created() from public, anon, authenticated;

-- Cancellation remains available to signed-in workspace staff only.
revoke execute on function public.cancel_home_visit(uuid, text) from public, anon;
grant execute on function public.cancel_home_visit(uuid, text) to authenticated;
