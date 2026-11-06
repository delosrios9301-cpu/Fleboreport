
-- Domicilios: el técnico aceptante es el único operador después de aceptar.
-- Agenda puede crear visitas y nuevas asignaciones; no puede editar una visita
-- después de que alguna invitación haya sido aceptada o rechazada.
drop policy if exists home_visits_update_staff_assignee on public.home_visits;
create policy home_visits_update_staff_assignee
on public.home_visits for update
using (
  (
    public.has_workspace_role(workspace_id, array['admin','clinician','reception'])
    and not exists (
      select 1 from public.home_visit_assignments a
      where a.workspace_id=home_visits.workspace_id
        and a.home_visit_id=home_visits.id
        and a.status in ('accepted','rejected')
    )
  )
  or exists (
    select 1 from public.home_visit_assignments a
    where a.workspace_id=home_visits.workspace_id
      and a.home_visit_id=home_visits.id
      and a.assigned_user_id=(select auth.uid())
      and a.status='accepted'
      and a.assigned_at=(select max(a2.assigned_at) from public.home_visit_assignments a2 where a2.workspace_id=a.workspace_id and a2.home_visit_id=a.home_visit_id)
  )
)
with check (public.is_workspace_member(workspace_id));

create or replace function public.guard_home_visit_technician_update()
returns trigger
language plpgsql
set search_path=''
as $function$
declare is_staff boolean;
begin
  is_staff := public.has_workspace_role(old.workspace_id, array['admin','clinician','reception']);
  if is_staff then
    if exists (
      select 1 from public.home_visit_assignments a
      where a.workspace_id=old.workspace_id
        and a.home_visit_id=old.id
        and a.status in ('accepted','rejected')
    ) then
      raise exception 'Este domicilio ya fue respondido. Solo el flebotomista que lo aceptó puede actualizar su progreso; agenda debe crear una nueva asignación si fue rechazado.';
    end if;
    return new;
  end if;

  if not exists (
    select 1 from public.home_visit_assignments a
    where a.workspace_id=old.workspace_id
      and a.home_visit_id=old.id
      and a.assigned_user_id=(select auth.uid())
      and a.status='accepted'
      and a.assigned_at=(
        select max(a2.assigned_at) from public.home_visit_assignments a2
        where a2.workspace_id=a.workspace_id and a2.home_visit_id=a.home_visit_id
      )
  ) then
    raise exception 'Solo el flebotomista que aceptó la asignación vigente puede modificar este domicilio';
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
  if new.status not in ('en_route','at_home','samples_taken','completed','patient_absent','patient_refused','rescheduled','not_performed') then
    raise exception 'Estado no permitido para el flebotomista';
  end if;
  return new;
end;
$function$;

-- Una asignación aceptada/rechazada nunca se edita; se crea una fila nueva
-- únicamente cuando la última asignación fue rechazada.
drop policy if exists home_visit_assignments_update_staff_self on public.home_visit_assignments;
create policy home_visit_assignments_update_assignee_only
on public.home_visit_assignments for update
using (assigned_user_id=(select auth.uid()) and public.is_workspace_member(workspace_id))
with check (assigned_user_id=(select auth.uid()) and public.is_workspace_member(workspace_id));

create or replace function public.guard_home_visit_assignment_update()
returns trigger
language plpgsql
set search_path=''
as $function$
begin
  if old.assigned_user_id is distinct from (select auth.uid()) then
    raise exception 'Solo el usuario asignado puede responder a esta invitación';
  end if;
  if old.workspace_id is distinct from new.workspace_id
    or old.home_visit_id is distinct from new.home_visit_id
    or old.professional_id is distinct from new.professional_id
    or old.assigned_user_id is distinct from new.assigned_user_id
    or old.created_by is distinct from new.created_by
    or old.assigned_at is distinct from new.assigned_at then
    raise exception 'No puedes modificar los datos de asignación';
  end if;
  if old.status <> 'invited' or new.status not in ('accepted','rejected') then
    raise exception 'La invitación solo puede aceptarse o rechazarse una vez';
  end if;
  return new;
end;
$function$;

create or replace function public.guard_home_visit_assignment_insert()
returns trigger
language plpgsql
set search_path=''
as $function$
declare last_status text;
begin
  if not public.has_workspace_role(new.workspace_id, array['admin','clinician','reception']) then
    raise exception 'Solo agenda puede asignar domicilios';
  end if;
  select a.status into last_status
  from public.home_visit_assignments a
  where a.workspace_id=new.workspace_id and a.home_visit_id=new.home_visit_id
  order by a.assigned_at desc limit 1;
  if last_status is not null and last_status <> 'rejected' then
    raise exception 'Solo se puede reasignar un domicilio cuando la asignación anterior fue rechazada';
  end if;
  if new.status <> 'invited' then
    raise exception 'Toda nueva asignación debe comenzar como invitación pendiente';
  end if;
  return new;
end;
$function$;

drop trigger if exists home_visit_assignments_guard_insert on public.home_visit_assignments;
create trigger home_visit_assignments_guard_insert
before insert on public.home_visit_assignments
for each row execute function public.guard_home_visit_assignment_insert();

-- Pruebas: después de aceptar, agenda no puede insertar ni editar pruebas.
drop policy if exists home_visit_tests_insert_staff_or_assignee on public.home_visit_tests;
create policy home_visit_tests_insert_staff_or_assignee
on public.home_visit_tests for insert
with check (
  (
    public.has_workspace_role(workspace_id, array['admin','clinician','reception'])
    and not exists (
      select 1 from public.home_visit_assignments a
      where a.workspace_id=home_visit_tests.workspace_id
        and a.home_visit_id=home_visit_tests.home_visit_id
        and a.status in ('accepted','rejected')
    )
  )
  or (
    source='additional' and service_id is not null
    and exists (
      select 1 from public.home_visit_assignments a
      where a.workspace_id=home_visit_tests.workspace_id
        and a.home_visit_id=home_visit_tests.home_visit_id
        and a.assigned_user_id=(select auth.uid())
        and a.status='accepted'
        and a.assigned_at=(select max(a2.assigned_at) from public.home_visit_assignments a2 where a2.workspace_id=a.workspace_id and a2.home_visit_id=a.home_visit_id)
    )
  )
);

drop policy if exists home_visit_tests_update_staff_or_assignee on public.home_visit_tests;
create policy home_visit_tests_update_assignee_only
on public.home_visit_tests for update
using (exists (
  select 1 from public.home_visit_assignments a
  where a.workspace_id=home_visit_tests.workspace_id
    and a.home_visit_id=home_visit_tests.home_visit_id
    and a.assigned_user_id=(select auth.uid())
    and a.status='accepted'
    and a.assigned_at=(select max(a2.assigned_at) from public.home_visit_assignments a2 where a2.workspace_id=a.workspace_id and a2.home_visit_id=a.home_visit_id)
))
with check (exists (
  select 1 from public.home_visit_assignments a
  where a.workspace_id=home_visit_tests.workspace_id
    and a.home_visit_id=home_visit_tests.home_visit_id
    and a.assigned_user_id=(select auth.uid())
    and a.status='accepted'
    and a.assigned_at=(select max(a2.assigned_at) from public.home_visit_assignments a2 where a2.workspace_id=a.workspace_id and a2.home_visit_id=a.home_visit_id)
));

-- Las notificaciones de asignación se entregan solo al usuario asignado.
create or replace function public.flebo_notify_assignment_changes()
returns trigger
language plpgsql
security definer
set search_path='public'
as $function$
declare v record; t text; msg text; ev text;
begin
  if tg_op='INSERT' then
    select scheduled_at into v from public.home_visits
    where id=new.home_visit_id and workspace_id=new.workspace_id;
    t := 'Nuevo domicilio asignado';
    msg := 'Tienes un domicilio pendiente de aceptar. Fecha: ' ||
      coalesce(to_char(v.scheduled_at at time zone 'America/Panama','DD/MM/YYYY HH24:MI'),'por confirmar') || '.';
    ev := 'assignment_created';
    perform public.flebo_notify_user(new.workspace_id,new.home_visit_id,new.assigned_user_id,t,msg,ev,
      jsonb_build_object('assignment_id',new.id,'status',new.status));
  end if;
  return new;
end;
$function$;

-- Cambios de estado no generan avisos a terceros. La persona asignada ve
-- el progreso en el domicilio; nunca se notifica a usuarios no asignados.
create or replace function public.flebo_notify_visit_status()
returns trigger
language plpgsql
security definer
set search_path='public'
as $function$
begin
  return new;
end;
$function$;

-- El historial solo lo puede añadir agenda antes de la respuesta o el
-- flebotomista que aceptó. Mantenerlo inmutable después de insertado.
drop policy if exists home_visit_events_insert_staff_or_assignee on public.home_visit_events;
create policy home_visit_events_insert_staff_or_assignee
on public.home_visit_events for insert
with check (
  (
    public.has_workspace_role(workspace_id, array['admin','clinician','reception'])
    and not exists (
      select 1 from public.home_visit_assignments a
      where a.workspace_id=home_visit_events.workspace_id
        and a.home_visit_id=home_visit_events.home_visit_id
        and a.status in ('accepted','rejected')
    )
  )
  or exists (
    select 1 from public.home_visit_assignments a
    where a.workspace_id=home_visit_events.workspace_id
      and a.home_visit_id=home_visit_events.home_visit_id
      and a.assigned_user_id=(select auth.uid())
      and a.status='accepted'
      and a.assigned_at=(select max(a2.assigned_at) from public.home_visit_assignments a2 where a2.workspace_id=a.workspace_id and a2.home_visit_id=a.home_visit_id)
  )
);
