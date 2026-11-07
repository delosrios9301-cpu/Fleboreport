-- Preserve admin write access while removing overlapping SELECT paths.
drop policy if exists role_permissions_admin_manage on public.role_permissions;
drop policy if exists role_permissions_admin_read on public.role_permissions;

create policy role_permissions_admin_insert
on public.role_permissions for insert to authenticated
with check (public.has_workspace_role(workspace_id, array['admin']::text[]));

create policy role_permissions_admin_update
on public.role_permissions for update to authenticated
using (public.has_workspace_role(workspace_id, array['admin']::text[]))
with check (public.has_workspace_role(workspace_id, array['admin']::text[]));

create policy role_permissions_admin_delete
on public.role_permissions for delete to authenticated
using (public.has_workspace_role(workspace_id, array['admin']::text[]));

-- The wider role set already includes every role in workspace_read.
-- The restrictive catalog/view permission guard remains in force.
drop policy if exists workspace_read on public.services;
