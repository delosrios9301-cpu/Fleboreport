-- Permitir que el flebotomista responda a su propia invitación sin exigir
-- el permiso general de edición de la agenda. El trigger existente sigue
-- limitando la respuesta a invited -> accepted/rejected y protege la identidad.
drop policy if exists home_visit_assignments_permission_update_scope
  on public.home_visit_assignments;

create policy home_visit_assignments_permission_update_scope
on public.home_visit_assignments
as restrictive
for update
to authenticated
using (
  (
    private.has_workspace_permission(workspace_id, 'domicilios', 'edit', null)
    and (
      private.has_workspace_permission(workspace_id, 'domicilios', 'manage', null)
      or assigned_user_id = (select auth.uid())
    )
  )
  or public.is_current_home_visit_assignee(
    workspace_id,
    home_visit_id,
    (select auth.uid()),
    array['invited'::text]
  )
)
with check (
  (
    private.has_workspace_permission(workspace_id, 'domicilios', 'edit', null)
    and (
      private.has_workspace_permission(workspace_id, 'domicilios', 'manage', null)
      or assigned_user_id = (select auth.uid())
    )
  )
  or (
    assigned_user_id = (select auth.uid())
    and status in ('accepted', 'rejected')
    and public.is_workspace_member(workspace_id)
  )
);
