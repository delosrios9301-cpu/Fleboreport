-- Permite al flebotomista asignado añadir una prueba adicional del catálogo
-- a su domicilio aceptado, sin concederle permisos generales de creación.
drop policy if exists home_visit_tests_permission_insert_scope on public.home_visit_tests;
create policy home_visit_tests_permission_insert_scope on public.home_visit_tests
as restrictive for insert to authenticated
with check (
  (
    private.has_workspace_permission(workspace_id,'domicilios','create',null)
    and private.has_workspace_permission(workspace_id,'domicilios','manage',null)
  )
  or (
    source = 'additional'
    and public.is_current_home_visit_assignee(
      workspace_id,
      home_visit_id,
      (select auth.uid()),
      array['accepted'::text]
    )
  )
);
