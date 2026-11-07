-- Keep the private Push-secret table inaccessible to client roles.
-- The table grants remain restricted to postgres/service_role.
create policy workflow_sla_push_secrets_block_client_roles
on public.workflow_sla_push_secrets
for all
to anon, authenticated
using (false)
with check (false);

-- Consolidate the two existing audit-log read paths without changing
-- their effective OR semantics.
drop policy if exists audit_admin_read on public.audit_logs;
drop policy if exists audit_logs_granular_read on public.audit_logs;

create policy audit_logs_read_authorized
on public.audit_logs
for select
to authenticated
using (
  public.has_workspace_role(workspace_id, array['admin']::text[])
  or private.has_workspace_permission(workspace_id, 'audit', 'view')
);
