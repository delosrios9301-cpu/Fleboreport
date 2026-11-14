-- FleboReport: archivado lógico de domicilios cancelados / no realizados.
-- Se aplicó a Supabase; SQL reproducible, sin borrar atenciones, muestras ni auditoría.
alter table public.home_visits
 add column if not exists archived_at timestamptz,
 add column if not exists archived_by uuid references auth.users(id);
create index if not exists home_visits_archived_per_workspace_idx
 on public.home_visits(workspace_id,archived_at) where archived_at is not null;

CREATE OR REPLACE FUNCTION public.guard_home_visit_technician_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  is_staff boolean;
begin
  -- Archive-only operation: no se permite alterar datos del domicilio.
  if old.archived_at is not null then
    raise exception 'Un domicilio archivado es de solo lectura' using errcode='42501';
  end if;
  if new.archived_at is distinct from old.archived_at
     or new.archived_by is distinct from old.archived_by then
    if auth.uid() is null
       or not private.has_workspace_permission(old.workspace_id,'domicilios','delete') then
      raise exception 'No tienes permiso para eliminar domicilios' using errcode='42501';
    end if;
    if old.status not in ('cancelled','rejected','not_performed','patient_absent','patient_refused') then
      raise exception 'Solo pueden retirarse domicilios cancelados o no realizados' using errcode='22023';
    end if;
    if new.archived_at is null or new.archived_by is distinct from auth.uid() then
      raise exception 'El archivado requiere responsable y fecha' using errcode='22023';
    end if;
    if (to_jsonb(new) - 'archived_at' - 'archived_by' - 'updated_at')
       is distinct from (to_jsonb(old) - 'archived_at' - 'archived_by' - 'updated_at') then
      raise exception 'No se pueden cambiar otros datos al retirar un domicilio' using errcode='42501';
    end if;
    if exists (
      select 1 from public.home_visit_tests t
      where t.workspace_id=old.workspace_id and t.home_visit_id=old.id and t.status='collected'
    ) then
      raise exception 'Este domicilio tiene muestras tomadas y no se puede eliminar' using errcode='22023';
    end if;
    new.archived_at=now();new.archived_by=auth.uid();
    return new;
  end if;
  is_staff := public.has_workspace_role(old.workspace_id, array['admin','clinician','reception']);
  if is_staff then
    -- Agenda no puede aceptar/rechazar invitaciones ni avanzar el trabajo de campo.
    -- Su única transición operativa sobre una visita existente es cancelarla por solicitud del paciente.
    if new.status = 'cancelled' then
      if old.status in ('cancelled','completed','samples_taken','en_route','at_home') then
        raise exception 'Este domicilio ya inició su ejecución o está cerrado; no puede cancelarse desde Agenda';
      end if;
      if nullif(btrim(coalesce(new.cancellation_reason,'')),'') is null then
        raise exception 'Indica que el paciente solicitó cancelar el domicilio';
      end if;
      if new.workspace_id is distinct from old.workspace_id
        or new.patient_id is distinct from old.patient_id
        or new.scheduled_at is distinct from old.scheduled_at
        or new.address is distinct from old.address
        or new.latitude is distinct from old.latitude
        or new.longitude is distinct from old.longitude
        or new.patient_phone is distinct from old.patient_phone
        or new.priority is distinct from old.priority
        or new.notes is distinct from old.notes
        or new.created_by is distinct from old.created_by
        or new.created_at is distinct from old.created_at
        or new.completed_at is distinct from old.completed_at then
        raise exception 'Agenda solo puede cancelar el domicilio; los datos de la visita no se pueden alterar durante la cancelación';
      end if;
      return new;
    end if;
    if exists (
      select 1 from public.home_visit_assignments a
      where a.workspace_id=old.workspace_id and a.home_visit_id=old.id
        and a.status in ('accepted','rejected')
    ) then
      raise exception 'Solo el flebotomista asignado puede actualizar el progreso de este domicilio';
    end if;
    if new.status in ('accepted','rejected','en_route','at_home','samples_taken','completed') then
      raise exception 'Agenda no puede aceptar ni actualizar el progreso del domicilio';
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

CREATE OR REPLACE FUNCTION public.archive_home_visit(p_home_visit_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_visit public.home_visits%rowtype;
begin
  if v_uid is null then
    raise exception 'Inicia sesión para retirar un domicilio' using errcode='42501';
  end if;
  if p_home_visit_id is null then
    raise exception 'Identificador de domicilio obligatorio' using errcode='22023';
  end if;
  select * into v_visit from public.home_visits v
   where v.id=p_home_visit_id for update;
  if not found or v_visit.archived_at is not null then
    raise exception 'El domicilio ya no está disponible; actualiza la agenda' using errcode='P0002';
  end if;
  if not private.has_workspace_permission(v_visit.workspace_id,'domicilios','delete') then
    raise exception 'Solo administradores o usuarios con permiso pueden eliminar domicilios'
      using errcode='42501';
  end if;
  if v_visit.status not in ('cancelled','rejected','not_performed','patient_absent','patient_refused') then
    raise exception 'Cancela primero el domicilio o marca que no se realizará'
      using errcode='22023';
  end if;
  if exists (
    select 1 from public.home_visit_tests t
    where t.workspace_id=v_visit.workspace_id and t.home_visit_id=v_visit.id
       and t.status='collected'
  ) then
    raise exception 'El domicilio tiene pruebas tomadas; debe conservarse como historial'
      using errcode='22023';
  end if;
  update public.home_visits
     set archived_at=now(),archived_by=v_uid
   where id=v_visit.id and workspace_id=v_visit.workspace_id and archived_at is null;
  if not found then raise exception 'No se pudo retirar el domicilio' using errcode='P0002';end if;
  return true;
end;
$function$;
revoke all on function public.archive_home_visit(uuid) from public,anon,authenticated;
grant execute on function public.archive_home_visit(uuid) to authenticated;
comment on function public.archive_home_visit(uuid) is
 'Archivado lógico con permiso domicilios.delete; sólo terminales sin muestras, auditado sin borrado de datos.';
