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


-- Estados explícitos para incidencias del paciente durante el domicilio.
alter table public.home_visits drop constraint if exists home_visits_status_check;
alter table public.home_visits
  add constraint home_visits_status_check
  check (status in (
    'pending_assignment','pending_acceptance','accepted','en_route','at_home',
    'samples_taken','completed','rejected','cancelled','rescheduled',
    'not_performed','patient_absent','patient_refused'
  ));

-- El flebotomista responde a su asignación, pero no puede transferirla ni editar su identidad.
create or replace function public.guard_home_visit_assignment_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.has_workspace_role(old.workspace_id, array['admin','clinician','reception']) then
    if old.assigned_user_id is distinct from (select auth.uid()) then
      raise exception 'Solo puedes responder a tu propia asignación';
    end if;
    if new.workspace_id is distinct from old.workspace_id
      or new.home_visit_id is distinct from old.home_visit_id
      or new.professional_id is distinct from old.professional_id
      or new.assigned_user_id is distinct from old.assigned_user_id
      or new.created_by is distinct from old.created_by
      or new.assigned_at is distinct from old.assigned_at then
      raise exception 'No puedes modificar los datos de asignación';
    end if;
    if old.status <> 'invited' or new.status not in ('accepted','rejected') then
      if new.status is distinct from old.status then
        raise exception 'La invitación solo puede aceptarse o rechazarse una vez';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists home_visit_assignments_guard_update on public.home_visit_assignments;
create trigger home_visit_assignments_guard_update
before update on public.home_visit_assignments
for each row execute function public.guard_home_visit_assignment_update();

-- El técnico puede actualizar el avance, pero no cambiar paciente, dirección, agenda ni pruebas.
create or replace function public.guard_home_visit_technician_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.has_workspace_role(old.workspace_id, array['admin','clinician','reception']) then
    if not exists (
      select 1 from public.home_visit_assignments a
      where a.workspace_id = old.workspace_id
        and a.home_visit_id = old.id
        and a.assigned_user_id = (select auth.uid())
        and a.status = 'accepted'
    ) then
      raise exception 'No tienes una asignación aceptada para este domicilio';
    end if;
    if new.workspace_id is distinct from old.workspace_id
      or new.patient_id is distinct from old.patient_id
      or new.scheduled_at is distinct from old.scheduled_at
      or new.address is distinct from old.address
      or new.latitude is distinct from old.latitude
      or new.longitude is distinct from old.longitude
      or new.patient_phone is distinct from old.patient_phone
      or new.priority is distinct from old.priority
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at then
      raise exception 'Solo agenda puede modificar los datos principales del domicilio';
    end if;
    if new.status not in (
      'en_route','at_home','samples_taken','completed',
      'patient_absent','patient_refused','rescheduled','not_performed'
    ) then
      raise exception 'Estado no permitido para el flebotomista';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists home_visits_guard_technician_update on public.home_visits;
create trigger home_visits_guard_technician_update
before update on public.home_visits
for each row execute function public.guard_home_visit_technician_update();

-- Las pruebas asignadas conservan su identidad y snapshot; el técnico solo registra resultado de toma.
create or replace function public.guard_home_visit_test_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.has_workspace_role(old.workspace_id, array['admin','clinician','reception']) then
    if new.workspace_id is distinct from old.workspace_id
      or new.home_visit_id is distinct from old.home_visit_id
      or new.service_id is distinct from old.service_id
      or new.test_name is distinct from old.test_name
      or new.vessel is distinct from old.vessel
      or new.quantity is distinct from old.quantity
      or new.source is distinct from old.source
      or new.catalog_snapshot is distinct from old.catalog_snapshot
      or new.added_by is distinct from old.added_by
      or new.added_at is distinct from old.added_at then
      raise exception 'No puedes alterar la prueba ni su snapshot del catálogo';
    end if;
    if not exists (
      select 1 from public.home_visit_assignments a
      where a.workspace_id = old.workspace_id
        and a.home_visit_id = old.home_visit_id
        and a.assigned_user_id = (select auth.uid())
        and a.status = 'accepted'
    ) then
      raise exception 'No tienes una asignación aceptada para este domicilio';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists home_visit_tests_guard_update on public.home_visit_tests;
create trigger home_visit_tests_guard_update
before update on public.home_visit_tests
for each row execute function public.guard_home_visit_test_update();

-- El actor y la fecha del evento siempre proceden del contexto autenticado.
create or replace function public.stamp_home_visit_event()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actor_user_id := (select auth.uid());
  new.occurred_at := now();
  return new;
end;
$$;

drop trigger if exists home_visit_events_stamp_actor on public.home_visit_events;
create trigger home_visit_events_stamp_actor
before insert on public.home_visit_events
for each row execute function public.stamp_home_visit_event();


-- Las pruebas nuevas las registra agenda; el técnico solo actualiza el resultado de las ya asignadas.
drop policy if exists home_visit_tests_insert_staff_or_assignee on public.home_visit_tests;
create policy home_visit_tests_insert_staff_only on public.home_visit_tests
for insert to authenticated
with check (public.has_workspace_role(workspace_id, array['admin','clinician','reception']));

create or replace function public.stamp_home_visit_test_creator()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.added_by := (select auth.uid());
  new.added_at := now();
  return new;
end;
$$;

drop trigger if exists home_visit_tests_stamp_creator on public.home_visit_tests;
create trigger home_visit_tests_stamp_creator
before insert on public.home_visit_tests
for each row execute function public.stamp_home_visit_test_creator();
