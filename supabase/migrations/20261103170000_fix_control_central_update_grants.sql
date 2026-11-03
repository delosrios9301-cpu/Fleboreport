-- Restore UPDATE table privileges required by the Control Central workflows.
-- Existing RLS policies continue to enforce workspace membership and admin/approval permissions.
grant update on table
  public.workspace_security_settings,
  public.sedes,
  public.approval_requests,
  public.sync_devices
to authenticated;
