-- Indexes and least-privilege execution for the new configuration layer.
create index if not exists sedes_created_by_idx on public.sedes(created_by);
create index if not exists user_sedes_workspace_site_idx on public.user_sedes(workspace_id,site_id);
create index if not exists user_sedes_created_by_idx on public.user_sedes(created_by);
create index if not exists role_permissions_updated_by_idx on public.role_permissions(updated_by);
create index if not exists member_permissions_updated_by_idx on public.member_permissions(updated_by);
create index if not exists workspace_security_primary_admin_idx on public.workspace_security_settings(primary_admin_user_id);
create index if not exists approval_requests_workspace_status_created_idx on public.approval_requests(workspace_id,status,created_at desc);
create index if not exists approval_requests_requested_by_idx on public.approval_requests(requested_by);
create index if not exists approval_requests_approved_by_idx on public.approval_requests(approved_by);
create index if not exists sync_devices_user_id_idx on public.sync_devices(user_id);
create index if not exists audit_logs_site_id_idx on public.audit_logs(site_id);
create index if not exists audit_logs_actor_id_idx on public.audit_logs(actor_id);

-- This function is called by RLS policies, but anonymous clients do not need it.
revoke execute on function public.is_current_home_visit_assignee(uuid,uuid,uuid,text[]) from anon;
-- This is a trigger-only function and must not be callable as a client RPC.
revoke execute on function public.sync_workspace_technician_professional() from anon,authenticated;
