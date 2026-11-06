create or replace function public.guard_home_visit_technician_update()
returns trigger language plpgsql security definer set search_path=public as $$
declare is_staff boolean;
begin
  is_staff:=public.has_workspace_role(old.workspace_id,array['admin','clinician','reception']);
  if is_staff then
    if new.status='cancelled' then
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
    if exists(select 1 from public.home_visit_assignments a where a.workspace_id=old.workspace_id and a.home_visit_id=old.id and a.status in ('accepted','rejected')) then
      raise exception 'Solo el flebotomista asignado puede actualizar el progreso de este domicilio';
    end if;
    if new.status in ('accepted','rejected','en_route','at_home','samples_taken','completed') then
      raise exception 'Agenda no puede aceptar ni actualizar el progreso del domicilio';
    end if;
    return new;
  end if;
  if not exists(select 1 from public.home_visit_assignments a where a.workspace_id=old.workspace_id and a.home_visit_id=old.id and a.assigned_user_id=(select auth.uid()) and a.status='accepted' and a.assigned_at=(select max(a2.assigned_at) from public.home_visit_assignments a2 where a2.workspace_id=a.workspace_id and a2.home_visit_id=a.home_visit_id)) then
    raise exception 'Solo el flebotomista que aceptó la asignación vigente puede modificar este domicilio';
  end if;
  if new.workspace_id is distinct from old.workspace_id or new.patient_id is distinct from old.patient_id
    or new.scheduled_at is distinct from old.scheduled_at or new.address is distinct from old.address
    or new.latitude is distinct from old.latitude or new.longitude is distinct from old.longitude
    or new.patient_phone is distinct from old.patient_phone or new.priority is distinct from old.priority
    or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'Solo agenda puede modificar los datos principales del domicilio';
  end if;
  if new.status not in ('en_route','at_home','samples_taken','completed','patient_absent','patient_refused','rescheduled','not_performed') then
    raise exception 'Estado no permitido para el flebotomista';
  end if;
  return new;
end;
$$;

create or replace function public.guard_home_visit_assignment_update()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.assigned_user_id is distinct from (select auth.uid()) then
    if public.has_workspace_role(old.workspace_id,array['admin','clinician','reception'])
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
  if old.workspace_id is distinct from new.workspace_id or old.home_visit_id is distinct from new.home_visit_id
    or old.professional_id is distinct from new.professional_id or old.assigned_user_id is distinct from new.assigned_user_id
    or old.created_by is distinct from new.created_by or old.assigned_at is distinct from new.assigned_at then
    raise exception 'No puedes modificar los datos de asignación';
  end if;
  if old.status<>'invited' or new.status not in ('accepted','rejected') then
    raise exception 'La invitación solo puede aceptarse o rechazarse una vez';
  end if;
  return new;
end;
$$;

create or replace function public.cancel_home_visit(p_home_visit_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_visit public.home_visits%rowtype; v_user uuid:=auth.uid(); v_reason text:=btrim(coalesce(p_reason,''));
begin
  if v_user is null then raise exception 'Se requiere una sesión autenticada'; end if;
  if v_reason='' then raise exception 'Indica que el paciente solicitó cancelar el domicilio'; end if;
  select * into v_visit from public.home_visits where id=p_home_visit_id for update;
  if not found then raise exception 'Domicilio no encontrado'; end if;
  if not public.has_workspace_role(v_visit.workspace_id,array['admin','clinician','reception']) then
    raise exception 'Solo Agenda puede cancelar un domicilio';
  end if;
  if v_visit.status in ('cancelled','completed','samples_taken','en_route','at_home') then
    raise exception 'El domicilio ya inició su ejecución o está cerrado; no se puede cancelar desde Agenda';
  end if;
  update public.home_visits set status='cancelled',cancellation_reason=v_reason
    where id=p_home_visit_id and workspace_id=v_visit.workspace_id;
  update public.home_visit_assignments set status='withdrawn',responded_at=now(),
    response_note='Cancelado por solicitud del paciente: '||v_reason
    where workspace_id=v_visit.workspace_id and home_visit_id=p_home_visit_id and status='invited';
  insert into public.home_visit_events(workspace_id,home_visit_id,event_type,from_status,to_status,description,actor_user_id,metadata)
    values(v_visit.workspace_id,p_home_visit_id,'Domicilio cancelado por solicitud del paciente',v_visit.status,'cancelled',v_reason,v_user,
      jsonb_build_object('source','agenda','reason_type','patient_request'));
  return jsonb_build_object('ok',true,'visit_id',p_home_visit_id,'status','cancelled');
end;
$$;
grant execute on function public.cancel_home_visit(uuid,text) to authenticated;
