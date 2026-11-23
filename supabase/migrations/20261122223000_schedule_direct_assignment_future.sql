-- TALCSYS Lab: agenda futura directa; asignaciones del mismo día requieren respuesta.
-- Solo futuras asignaciones, sin alteraciones retroactivas de registros o pacientes.
CREATE OR REPLACE FUNCTION public.guard_home_visit_assignment_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin


  -- Únicamente agenda autorizada puede confirmar una asignación FUTURA sin aceptación manual.
  if old.status='invited' and new.status='accepted'
    and new.response_note='assigned_schedule_future' and new.responded_at is not null
    and (select auth.uid()) is not null
    and current_setting('flebo.planned_assignment_visit',true)=old.home_visit_id::text
    and current_setting('flebo.planned_assignment_user',true)=old.assigned_user_id::text
    and (private.has_workspace_permission(old.workspace_id,'domicilios','assign')
      or private.member_has_workspace_role(old.workspace_id,(select auth.uid()),array['admin']::text[]))
    and exists(select 1 from public.home_visits v
      where v.workspace_id=old.workspace_id and v.id=old.home_visit_id
        and v.archived_at is null
        and (v.scheduled_at at time zone 'America/Panama')::date >
            (clock_timestamp() at time zone 'America/Panama')::date)
    and (to_jsonb(new)-'status'-'responded_at'-'response_note')
        is not distinct from (to_jsonb(old)-'status'-'responded_at'-'response_note')
  then return new; end if;
  -- Agenda puede retirar una invitación pendiente únicamente como consecuencia de cancelar la visita.
  if old.assigned_user_id is distinct from (select auth.uid()) then
    if public.has_workspace_role(old.workspace_id, array['admin','clinician','reception'])
      and old.status='invited' and new.status='withdrawn'
      and old.id is not distinct from new.id
      and old.workspace_id is not distinct from new.workspace_id
      and old.home_visit_id is not distinct from new.home_visit_id
      and old.professional_id is not distinct from new.professional_id
      and old.assigned_user_id is not distinct from new.assigned_user_id
      and old.created_by is not distinct from new.created_by
      and old.assigned_at is not distinct from new.assigned_at then
      return new;
    end if;
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
CREATE OR REPLACE FUNCTION public.guard_home_visit_technician_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  is_staff boolean;
begin


  -- Solo se permite el cambio de estado de una visita futura al confirmar
  -- una asignación directa vigente mediante el RPC autorizado.
  if old.status in ('pending_assignment','pending_acceptance')
    and new.status='accepted' and old.archived_at is null
    and (select auth.uid()) is not null
    and current_setting('flebo.planned_assignment_visit',true)=old.id::text
    and (private.has_workspace_permission(old.workspace_id,'domicilios','assign')
      or private.member_has_workspace_role(old.workspace_id,(select auth.uid()),array['admin']::text[]))
    and (old.scheduled_at at time zone 'America/Panama')::date >
        (clock_timestamp() at time zone 'America/Panama')::date
    and exists(select 1 from public.home_visit_assignments a
      where a.workspace_id=old.workspace_id and a.home_visit_id=old.id
        and a.assigned_user_id::text=current_setting('flebo.planned_assignment_user',true)
        and a.status='accepted' and a.response_note='assigned_schedule_future'
        and a.id=(select a2.id from public.home_visit_assignments a2
          where a2.workspace_id=a.workspace_id and a2.home_visit_id=a.home_visit_id
          order by a2.assigned_at desc,a2.id desc limit 1))
    and (to_jsonb(new)-'status'-'updated_at')
        is not distinct from (to_jsonb(old)-'status'-'updated_at')
  then return new; end if;
  -- El backend confirma la reclamación y cambia de pendiente a aceptado;
  -- nadie más puede escribir este estado (flag local solo desde el RPC).
  if old.status in ('pending_assignment','pending_acceptance')
    and new.status='accepted' and old.archived_at is null
    and current_setting('flebo.volunteer_claim_user',true)=coalesce((select auth.uid())::text,'')
    and exists (select 1 from public.home_visit_assignments a
       where a.workspace_id=old.workspace_id and a.home_visit_id=old.id
         and a.assigned_user_id=(select auth.uid()) and a.status='accepted')
    and (to_jsonb(new)-'status'-'updated_at')
      is not distinct from (to_jsonb(old)-'status'-'updated_at')
  then return new; end if;
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
    if old.status not in ('pending_assignment','pending_acceptance','cancelled','rejected','not_performed','patient_absent','patient_refused','samples_taken','completed') then
      raise exception 'Solo pueden retirarse visitas pendientes, cerradas, canceladas o con muestras tomadas' using errcode='22023';
    end if;
    if new.archived_at is null or new.archived_by is distinct from auth.uid() then
      raise exception 'El archivado requiere responsable y fecha' using errcode='22023';
    end if;
    if (to_jsonb(new) - 'archived_at' - 'archived_by' - 'updated_at')
       is distinct from (to_jsonb(old) - 'archived_at' - 'archived_by' - 'updated_at') then
      raise exception 'No se pueden cambiar otros datos al retirar un domicilio' using errcode='42501';
    end if;
    if old.status not in ('samples_taken','completed') and exists (
      select 1 from public.home_visit_tests t
      where t.workspace_id=old.workspace_id and t.home_visit_id=old.id and t.status='collected'
    ) then
      raise exception 'Una visita no realizada con muestras tomadas requiere revisión' using errcode='22023';
    end if;
    new.archived_at=now();new.archived_by=auth.uid();
    return new;
  end if;
  -- El administrador asignado actúa como responsable de campo, no como Agenda.
  -- La excepción solo aplica a la asignación aceptada más reciente de su usuario.
  -- Corrección de agenda sobre domicilio aceptado. Solo edit + manage.
  -- Nunca altera muestras, estados, asignaciones ni datos de otros domicilios.
  -- Reprogramacion autorizada: nunca modificar progreso o asignaciones.
  -- Aceptar reenvios identicos para que no se confundan con progreso de flebotomia.
  if old.status in ('accepted','pending_acceptance')
     and old.archived_at is null
     and (old.status = 'accepted' or exists (
       select 1 from public.home_visit_assignments a
       where a.workspace_id=old.workspace_id and a.home_visit_id=old.id
         and a.status='accepted'
         and a.id=(select a2.id from public.home_visit_assignments a2
           where a2.workspace_id=a.workspace_id and a2.home_visit_id=a.home_visit_id
           order by a2.assigned_at desc,a2.id desc limit 1)
     ))
     and (
       public.has_workspace_role(old.workspace_id, array['admin']::text[])
       or (
         private.has_workspace_permission(old.workspace_id, 'domicilios', 'edit')
         and private.has_workspace_permission(old.workspace_id, 'domicilios', 'manage')
       )
     )
     and new.status is not distinct from old.status
     and new.scheduled_at is not null
     and nullif(btrim(new.address), '') is not null
     and (to_jsonb(new) - 'scheduled_at' - 'address' - 'updated_at')
         is not distinct from (to_jsonb(old) - 'scheduled_at' - 'address' - 'updated_at')
  then
    return new;
  end if;
  is_staff := public.has_workspace_role(old.workspace_id,array['admin','clinician','reception'])
     and not exists (
       select 1 from public.home_visit_assignments a
       where a.workspace_id=old.workspace_id and a.home_visit_id=old.id
         and a.assigned_user_id=(select auth.uid()) and a.status='accepted'
         and a.id=(select a2.id from public.home_visit_assignments a2
                   where a2.workspace_id=a.workspace_id and a2.home_visit_id=a.home_visit_id
                   order by a2.assigned_at desc,a2.id desc limit 1)
     );
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
CREATE OR REPLACE FUNCTION public.assign_home_visit_member(p_home_visit_id uuid,p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_uid uuid:=(select auth.uid());
 v_visit public.home_visits%rowtype;
 v_latest text;
 v_professional uuid;
 v_assignment uuid;
 v_future boolean;
begin
 if v_uid is null then raise exception 'Inicia sesión' using errcode='42501'; end if;
 select * into v_visit from public.home_visits where id=p_home_visit_id for update;
 if not found or v_visit.archived_at is not null then
  raise exception 'Domicilio no disponible' using errcode='P0002'; end if;
 if not(private.has_workspace_permission(v_visit.workspace_id,'domicilios','assign')
   or private.member_has_workspace_role(v_visit.workspace_id,v_uid,array['admin']::text[])) then
  raise exception 'No tienes permiso de asignación' using errcode='42501'; end if;
 if not exists(select 1 from public.workspace_members m
   where m.workspace_id=v_visit.workspace_id and m.user_id=p_user_id and m.active) then
  raise exception 'El usuario no está activo en este laboratorio' using errcode='22023'; end if;
 if v_visit.status not in ('pending_assignment','pending_acceptance') then
  raise exception 'El domicilio ya comenzó o no admite asignación' using errcode='P0001'; end if;
 select a.status into v_latest from public.home_visit_assignments a
  where a.workspace_id=v_visit.workspace_id and a.home_visit_id=v_visit.id
  order by a.assigned_at desc,a.id desc limit 1;
 if v_latest is not null and v_latest not in ('rejected','withdrawn') then
  raise exception 'Este domicilio ya tiene un responsable. Actualiza la agenda.' using errcode='23505'; end if;
 v_professional:=private.ensure_home_visit_professional(v_visit.workspace_id,p_user_id);
 insert into public.home_visit_assignments
  (workspace_id,home_visit_id,professional_id,assigned_user_id,status,created_by)
 values(v_visit.workspace_id,v_visit.id,v_professional,p_user_id,'invited',v_uid)
 returning id into v_assignment;
 v_future:=(v_visit.scheduled_at at time zone 'America/Panama')::date >
           (clock_timestamp() at time zone 'America/Panama')::date;
 if v_future then
  perform pg_catalog.set_config('flebo.planned_assignment_visit',v_visit.id::text,true);
  perform pg_catalog.set_config('flebo.planned_assignment_user',p_user_id::text,true);
  update public.home_visit_assignments
   set status='accepted',responded_at=clock_timestamp(),response_note='assigned_schedule_future'
   where id=v_assignment and workspace_id=v_visit.workspace_id and status='invited';
  if not found then raise exception 'No se confirmó la asignación anticipada'; end if;
  update public.home_visits set status='accepted'
   where id=v_visit.id and workspace_id=v_visit.workspace_id;
  if not found then raise exception 'No se confirmó la visita anticipada'; end if;
  perform pg_catalog.set_config('flebo.planned_assignment_visit','',true);
  perform pg_catalog.set_config('flebo.planned_assignment_user','',true);
 elsif v_visit.status='pending_assignment' then
  update public.home_visits set status='pending_acceptance'
   where id=v_visit.id and workspace_id=v_visit.workspace_id;
 end if;
 return v_assignment;
end;
$function$;
CREATE OR REPLACE FUNCTION public.flebo_notify_assignment_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v public.home_visits%rowtype;
 t text; msg text; ev text; planned boolean;
begin
 if tg_op='INSERT' and new.status='invited' then
  select * into v from public.home_visits
   where id=new.home_visit_id and workspace_id=new.workspace_id;
  planned:=v.scheduled_at is not null and
    (v.scheduled_at at time zone 'America/Panama')::date >
    (clock_timestamp() at time zone 'America/Panama')::date;
  t:=case when planned then 'Domicilio incorporado a tu agenda'
       else 'Nuevo domicilio asignado' end;
  msg:=case when planned then 'Tienes un domicilio programado sin aceptación manual. Fecha: '
       else 'Tienes un domicilio pendiente de aceptar. Fecha: ' end ||
       coalesce(to_char(v.scheduled_at at time zone 'America/Panama','DD/MM/YYYY HH24:MI'),'por confirmar') || '.';
  ev:='assignment_created';
  perform public.flebo_notify_user(new.workspace_id,new.home_visit_id,new.assigned_user_id,t,msg,ev,
    jsonb_build_object('assignment_id',new.id,'status',
      case when planned then 'accepted' else 'invited' end,
      'assignment_mode',case when planned then 'scheduled' else 'same_day_extra' end));
 end if;
 return new;
end;
$function$;
REVOKE ALL ON FUNCTION public.assign_home_visit_member(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assign_home_visit_member(uuid,uuid) TO authenticated;
