
-- El asignado puede leer únicamente sus invitaciones/visitas, sin necesitar
-- permiso de lectura general de la agenda. Pruebas y eventos quedan ocultos
-- hasta que la asignación haya sido aceptada.
drop policy if exists home_visit_assignments_permission_scope on public.home_visit_assignments;
create policy home_visit_assignments_permission_scope
on public.home_visit_assignments as restrictive for select to authenticated
using (
  (private.has_workspace_permission(workspace_id,'domicilios','view',null)
   and private.has_workspace_permission(workspace_id,'domicilios','manage',null))
  or public.is_current_home_visit_assignee(workspace_id,home_visit_id,(select auth.uid()),array['invited'::text,'accepted'::text])
);

drop policy if exists home_visits_permission_scope on public.home_visits;
create policy home_visits_permission_scope
on public.home_visits as restrictive for select to authenticated
using (
  (private.has_workspace_permission(workspace_id,'domicilios','view',null)
   and private.has_workspace_permission(workspace_id,'domicilios','manage',null))
  or public.is_current_home_visit_assignee(workspace_id,id,(select auth.uid()),array['invited'::text,'accepted'::text])
);

drop policy if exists home_visit_tests_permission_scope on public.home_visit_tests;
create policy home_visit_tests_permission_scope
on public.home_visit_tests as restrictive for select to authenticated
using (
  (private.has_workspace_permission(workspace_id,'domicilios','view',null)
   and private.has_workspace_permission(workspace_id,'domicilios','manage',null))
  or public.is_current_home_visit_assignee(workspace_id,home_visit_id,(select auth.uid()),array['accepted'::text])
);

drop policy if exists home_visit_events_permission_scope on public.home_visit_events;
create policy home_visit_events_permission_scope
on public.home_visit_events as restrictive for select to authenticated
using (
  (private.has_workspace_permission(workspace_id,'domicilios','view',null)
   and private.has_workspace_permission(workspace_id,'domicilios','manage',null))
  or public.is_current_home_visit_assignee(workspace_id,home_visit_id,(select auth.uid()),array['accepted'::text])
);

-- La edición de la visita y sus pruebas durante el trabajo de campo pertenece
-- exclusivamente al flebotomista de la asignación aceptada o al administrador
-- con los permisos de edición/gestión.
drop policy if exists home_visits_permission_update_scope on public.home_visits;
create policy home_visits_permission_update_scope
on public.home_visits as restrictive for update to authenticated
using (
  (private.has_workspace_permission(workspace_id,'domicilios','edit',null)
   and private.has_workspace_permission(workspace_id,'domicilios','manage',null))
  or public.is_current_home_visit_assignee(workspace_id,id,(select auth.uid()),array['accepted'::text])
)
with check (
  private.has_workspace_permission(workspace_id,'domicilios','edit',null)
  or public.is_current_home_visit_assignee(workspace_id,id,(select auth.uid()),array['accepted'::text])
);

drop policy if exists home_visit_tests_permission_update_scope on public.home_visit_tests;
create policy home_visit_tests_permission_update_scope
on public.home_visit_tests as restrictive for update to authenticated
using (
  (private.has_workspace_permission(workspace_id,'domicilios','edit',null)
   and private.has_workspace_permission(workspace_id,'domicilios','manage',null))
  or public.is_current_home_visit_assignee(workspace_id,home_visit_id,(select auth.uid()),array['accepted'::text])
)
with check (
  (private.has_workspace_permission(workspace_id,'domicilios','edit',null)
   and private.has_workspace_permission(workspace_id,'domicilios','manage',null))
  or public.is_current_home_visit_assignee(workspace_id,home_visit_id,(select auth.uid()),array['accepted'::text])
);

drop policy if exists home_visit_events_permission_insert_scope on public.home_visit_events;
create policy home_visit_events_permission_insert_scope
on public.home_visit_events as restrictive for insert to authenticated
with check (
  (private.has_workspace_permission(workspace_id,'domicilios','create',null)
   and private.has_workspace_permission(workspace_id,'domicilios','manage',null))
  or public.is_current_home_visit_assignee(workspace_id,home_visit_id,(select auth.uid()),array['accepted'::text])
);
