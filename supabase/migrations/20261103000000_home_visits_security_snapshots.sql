-- Refuerzo de aislamiento de domicilios y snapshot del catálogo.
-- Los roles de agenda pueden consultar el espacio completo; los técnicos solo sus asignaciones.

alter table public.home_visit_tests
  add column if not exists catalog_snapshot jsonb not null default '{}'::jsonb;

comment on column public.home_visit_tests.catalog_snapshot is
  'Copia inmutable de los requisitos del catálogo al añadir la prueba al domicilio (muestra, recipiente, color, ayuno, condiciones e instrucciones).';

-- Sustituir las políticas amplias creadas en la migración inicial de domicilios.
drop policy if exists home_visits_read_member on public.home_visits;
create policy home_visits_read_scoped on public.home_visits
for select to authenticated
using (
  public.is_workspace_member(workspace_id)
  and (
    public.has_workspace_role(workspace_id, array['admin','clinician','reception','viewer'])
    or exists (
      select 1
      from public.home_visit_assignments a
      where a.workspace_id = home_visits.workspace_id
        and a.home_visit_id = home_visits.id
        and a.assigned_user_id = (select auth.uid())
    )
  )
);

drop policy if exists home_visit_assignments_read on public.home_visit_assignments;
create policy home_visit_assignments_read_scoped on public.home_visit_assignments
for select to authenticated
using (
  public.is_workspace_member(workspace_id)
  and (
    public.has_workspace_role(workspace_id, array['admin','clinician','reception','viewer'])
    or assigned_user_id = (select auth.uid())
  )
);

drop policy if exists home_visit_tests_read on public.home_visit_tests;
create policy home_visit_tests_read_scoped on public.home_visit_tests
for select to authenticated
using (
  public.is_workspace_member(workspace_id)
  and (
    public.has_workspace_role(workspace_id, array['admin','clinician','reception','viewer'])
    or exists (
      select 1
      from public.home_visit_assignments a
      where a.workspace_id = home_visit_tests.workspace_id
        and a.home_visit_id = home_visit_tests.home_visit_id
        and a.assigned_user_id = (select auth.uid())
    )
  )
);

drop policy if exists home_visit_tests_insert_staff on public.home_visit_tests;
create policy home_visit_tests_insert_staff_or_assignee on public.home_visit_tests
for insert to authenticated
with check (
  public.has_workspace_role(workspace_id, array['admin','clinician','reception'])
  or exists (
    select 1
    from public.home_visit_assignments a
    where a.workspace_id = home_visit_tests.workspace_id
      and a.home_visit_id = home_visit_tests.home_visit_id
      and a.assigned_user_id = (select auth.uid())
      and a.status = 'accepted'
  )
);

drop policy if exists home_visit_tests_update_staff on public.home_visit_tests;
create policy home_visit_tests_update_staff_or_assignee on public.home_visit_tests
for update to authenticated
using (
  public.has_workspace_role(workspace_id, array['admin','clinician','reception'])
  or exists (
    select 1
    from public.home_visit_assignments a
    where a.workspace_id = home_visit_tests.workspace_id
      and a.home_visit_id = home_visit_tests.home_visit_id
      and a.assigned_user_id = (select auth.uid())
      and a.status = 'accepted'
  )
)
with check (
  public.has_workspace_role(workspace_id, array['admin','clinician','reception'])
  or exists (
    select 1
    from public.home_visit_assignments a
    where a.workspace_id = home_visit_tests.workspace_id
      and a.home_visit_id = home_visit_tests.home_visit_id
      and a.assigned_user_id = (select auth.uid())
      and a.status = 'accepted'
  )
);

drop policy if exists home_visit_events_read on public.home_visit_events;
create policy home_visit_events_read_scoped on public.home_visit_events
for select to authenticated
using (
  public.is_workspace_member(workspace_id)
  and (
    public.has_workspace_role(workspace_id, array['admin','clinician','reception','viewer'])
    or exists (
      select 1
      from public.home_visit_assignments a
      where a.workspace_id = home_visit_events.workspace_id
        and a.home_visit_id = home_visit_events.home_visit_id
        and a.assigned_user_id = (select auth.uid())
    )
  )
);

drop policy if exists home_visit_events_insert_member on public.home_visit_events;
create policy home_visit_events_insert_staff_or_assignee on public.home_visit_events
for insert to authenticated
with check (
  public.has_workspace_role(workspace_id, array['admin','clinician','reception'])
  or exists (
    select 1
    from public.home_visit_assignments a
    where a.workspace_id = home_visit_events.workspace_id
      and a.home_visit_id = home_visit_events.home_visit_id
      and a.assigned_user_id = (select auth.uid())
      and a.status = 'accepted'
  )
);

drop policy if exists home_visit_notifications_read on public.home_visit_notifications;
create policy home_visit_notifications_read_scoped on public.home_visit_notifications
for select to authenticated
using (
  public.is_workspace_member(workspace_id)
  and (
    public.has_workspace_role(workspace_id, array['admin','clinician','reception','viewer'])
    or recipient_user_id = (select auth.uid())
  )
);
