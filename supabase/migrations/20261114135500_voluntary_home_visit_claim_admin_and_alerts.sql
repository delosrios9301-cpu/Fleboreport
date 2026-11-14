-- Voluntariado seguro y administrador asignable. Reproducción de lo desplegado en Supabase
-- Todo miembro requiere workspace activo; la lista de disponibles no contiene datos privados.
-- Los cambios de estado, invitaciones y eventos permanecen auditados.

CREATE OR REPLACE FUNCTION private.ensure_home_visit_professional(p_workspace uuid, p_user uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_professional uuid;v_name text;
begin
 select p.id into v_professional from public.professionals p
 where p.workspace_id=p_workspace and p.user_id=p_user and p.active=true;
 if v_professional is not null then return v_professional; end if;
 if exists(select 1 from public.professionals p
   where p.workspace_id=p_workspace and p.user_id=p_user and p.active=false) then
   raise exception 'El perfil del responsable está desactivado' using errcode='42501';
 end if;
 select nullif(btrim(p.display_name),'') into v_name
 from public.profiles p where p.user_id=p_user and p.active=true;
 v_name:=coalesce(v_name,'Usuario del laboratorio');
 insert into public.professionals(workspace_id,user_id,name,active)
 values(p_workspace,p_user,v_name,true)
 on conflict(workspace_id,user_id) where user_id is not null
 do update set name=public.professionals.name
 returning id into v_professional;
 return v_professional;
end;
$function$;

CREATE OR REPLACE FUNCTION private.notify_open_home_visit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.status='pending_assignment' and new.archived_at is null then
  insert into public.workflow_sla_alerts
   (workspace_id,entity,record_id,recipient_user_id,alert_code,severity,due_at,metadata)
  select new.workspace_id,'home_visit',new.id,m.user_id,'volunteer_available','warning',clock_timestamp(),
   jsonb_build_object('priority',new.priority,'scheduled_at',new.scheduled_at,'source','unassigned_domicile')
  from public.workspace_members m
  where m.workspace_id=new.workspace_id and m.active
   -- Solo se informa a cuentas habilitadas para este módulo.
   and (m.role in ('admin','technician','clinician','reception')
      or exists(select 1 from public.member_permissions mp
       where mp.workspace_id=m.workspace_id and mp.user_id=m.user_id
       and mp.module_key='domicilios' and mp.action_key='view' and mp.allowed))
  on conflict(workspace_id,entity,record_id,recipient_user_id,alert_code) do nothing;
 end if;
 return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.assign_home_visit_member(p_home_visit_id uuid, p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_uid uuid:=(select auth.uid());v_visit public.home_visits%rowtype;
 v_latest text;v_professional uuid;v_assignment uuid;
begin
 if v_uid is null then raise exception 'Inicia sesión' using errcode='42501';end if;
 select * into v_visit from public.home_visits where id=p_home_visit_id for update;
 if not found or v_visit.archived_at is not null then raise exception 'Domicilio no disponible' using errcode='P0002';end if;
 if not(private.has_workspace_permission(v_visit.workspace_id,'domicilios','assign')
   or private.member_has_workspace_role(v_visit.workspace_id,v_uid,array['admin']::text[])) then
  raise exception 'No tienes permiso de asignación' using errcode='42501';
 end if;
 if not exists(select 1 from public.workspace_members m where m.workspace_id=v_visit.workspace_id and m.user_id=p_user_id and m.active) then
  raise exception 'El usuario no está activo en este laboratorio' using errcode='22023';
 end if;
 if v_visit.status not in ('pending_assignment','pending_acceptance') then
  raise exception 'El domicilio ya comenzó o no admite asignación' using errcode='P0001';
 end if;
 select a.status into v_latest from public.home_visit_assignments a
 where a.workspace_id=v_visit.workspace_id and a.home_visit_id=v_visit.id
 order by a.assigned_at desc,a.id desc limit 1;
 if v_latest is not null and v_latest not in ('rejected','withdrawn') then
  raise exception 'Este domicilio ya tiene un responsable. Actualiza la agenda.' using errcode='23505';
 end if;
 v_professional:=private.ensure_home_visit_professional(v_visit.workspace_id,p_user_id);
 insert into public.home_visit_assignments
  (workspace_id,home_visit_id,professional_id,assigned_user_id,status,created_by)
 values(v_visit.workspace_id,v_visit.id,v_professional,p_user_id,'invited',v_uid)
 returning id into v_assignment;
 if v_visit.status='pending_assignment' then
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
declare v record; t text; msg text; ev text;
begin
  if tg_op='INSERT' and new.status='invited' then
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

CREATE OR REPLACE FUNCTION public.guard_home_visit_assignment_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare last_status text;
begin
  -- Invocación atómica de volunteer_home_visit: solo el usuario autenticado
  -- y el RPC autorizado pueden introducir una asignación ya aceptada.
  if new.status='accepted'
     and new.assigned_user_id=(select auth.uid())
     and new.created_by=(select auth.uid())
     and current_setting('flebo.volunteer_claim_user',true)=coalesce((select auth.uid())::text,'') then
    return new;
  end if;
  if not (private.has_workspace_permission(new.workspace_id,'domicilios','assign')
      or public.has_workspace_role(new.workspace_id, array['admin','clinician','reception'])) then
    raise exception 'Solo agenda puede asignar domicilios';
  end if;
  select a.status into last_status
  from public.home_visit_assignments a
  where a.workspace_id=new.workspace_id and a.home_visit_id=new.home_visit_id
  order by a.assigned_at desc limit 1;
  if last_status is not null and last_status not in ('rejected','withdrawn') then
    raise exception 'Solo se puede reasignar un domicilio cuando la asignación anterior fue rechazada';
  end if;
  if new.status <> 'invited' then
    raise exception 'Toda nueva asignación debe comenzar como invitación pendiente';
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
    if old.status not in ('cancelled','rejected','not_performed','patient_absent','patient_refused','samples_taken','completed') then
      raise exception 'Solo pueden retirarse visitas cerradas, canceladas o con muestras tomadas' using errcode='22023';
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

CREATE OR REPLACE FUNCTION public.list_available_home_visits(p_workspace_id uuid)
 RETURNS TABLE(visit_id uuid, scheduled_at timestamp with time zone, priority text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if (select auth.uid()) is null or not exists (
  select 1 from public.workspace_members m where m.workspace_id=p_workspace_id
  and m.user_id=(select auth.uid()) and m.active
 ) or not private.has_workspace_permission(p_workspace_id,'domicilios','view') then
  raise exception 'No tienes acceso a los domicilios disponibles' using errcode='42501';
 end if;
 return query select v.id,v.scheduled_at,v.priority
 from public.home_visits v
 where v.workspace_id=p_workspace_id
   and v.archived_at is null
   and v.status in ('pending_assignment','pending_acceptance')
   and not exists (
     select 1 from public.home_visit_assignments a
     where a.workspace_id=v.workspace_id and a.home_visit_id=v.id
       and a.status in ('invited','accepted')
   )
 order by v.scheduled_at asc,v.id asc limit 150;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_domicile_assignable_members(p_workspace_id uuid)
 RETURNS TABLE(user_id uuid, display_name text, member_role text, professional_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if (select auth.uid()) is null or not exists(
  select 1 from public.workspace_members m where m.workspace_id=p_workspace_id
    and m.user_id=(select auth.uid()) and m.active
 ) or not (private.has_workspace_permission(p_workspace_id,'domicilios','assign')
     or private.member_has_workspace_role(p_workspace_id,(select auth.uid()),array['admin']::text[])) then
  raise exception 'No tienes permiso para consultar responsables' using errcode='42501';
 end if;
 return query select m.user_id,
   coalesce(nullif(btrim(p.display_name),''),nullif(btrim(p.username),''),'Usuario del laboratorio')::text,
   m.role::text,pro.id
 from public.workspace_members m
 left join public.profiles p on p.user_id=m.user_id
 left join public.professionals pro on pro.workspace_id=m.workspace_id and pro.user_id=m.user_id and pro.active=true
 where m.workspace_id=p_workspace_id and m.active and coalesce(p.active,true)
 order by (m.role='admin') desc,coalesce(p.display_name,p.username,'Usuario') asc
 limit 400;
end;
$function$;

CREATE OR REPLACE FUNCTION public.volunteer_home_visit(p_home_visit_id uuid)
 RETURNS jsonb
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
 v_name text;
begin
 if v_uid is null then raise exception 'Inicia sesión para tomar un domicilio' using errcode='42501';end if;
 select * into v_visit from public.home_visits v where v.id=p_home_visit_id for update;
 if not found or v_visit.archived_at is not null then
  raise exception 'Domicilio no disponible' using errcode='P0002';
 end if;
 if not exists(select 1 from public.workspace_members m where m.workspace_id=v_visit.workspace_id and m.user_id=v_uid and m.active)
    or not private.has_workspace_permission(v_visit.workspace_id,'domicilios','view') then
  raise exception 'No tienes permiso para asumir domicilios' using errcode='42501';
 end if;
 if v_visit.status not in ('pending_assignment','pending_acceptance') then
  raise exception 'Este domicilio ya no está disponible' using errcode='P0001';
 end if;
 select a.status into v_latest from public.home_visit_assignments a
 where a.workspace_id=v_visit.workspace_id and a.home_visit_id=v_visit.id
 order by a.assigned_at desc,a.id desc limit 1;
 if v_latest is not null and v_latest not in ('rejected','withdrawn') then
  raise exception 'Otro usuario ya tiene este domicilio asignado' using errcode='23505';
 end if;
 v_professional:=private.ensure_home_visit_professional(v_visit.workspace_id,v_uid);
 perform set_config('flebo.volunteer_claim_user',v_uid::text,true);
 insert into public.home_visit_assignments
   (workspace_id,home_visit_id,professional_id,assigned_user_id,status,assigned_at,responded_at,created_by,response_note)
 values(v_visit.workspace_id,v_visit.id,v_professional,v_uid,'accepted',now(),now(),v_uid,'Asignación voluntaria')
 returning id into v_assignment;
 update public.home_visits set status='accepted' where id=v_visit.id and workspace_id=v_visit.workspace_id;
 insert into public.home_visit_events
   (workspace_id,home_visit_id,event_type,from_status,to_status,description,actor_user_id,metadata)
 values(v_visit.workspace_id,v_visit.id,'Asignación voluntaria',v_visit.status,'accepted',
   'El usuario asumió voluntariamente este domicilio disponible',v_uid,jsonb_build_object('assignment_id',v_assignment,'source','voluntary'));
 update public.workflow_sla_alerts
 set resolved_at=now()
 where workspace_id=v_visit.workspace_id and entity='home_visit' and record_id=v_visit.id
   and alert_code='volunteer_available' and resolved_at is null;
 select coalesce(nullif(btrim(p.display_name),''),nullif(btrim(p.username),''),'Un usuario')
 into v_name from public.profiles p where p.user_id=v_uid;
 v_name:=coalesce(v_name,'Un usuario');
 insert into public.workflow_sla_alerts
 (workspace_id,entity,record_id,recipient_user_id,alert_code,severity,due_at,metadata)
 select v_visit.workspace_id,'home_visit',v_visit.id,m.user_id,'volunteer_claimed','warning',now(),
 jsonb_build_object('assignment_id',v_assignment,'actor_user_id',v_uid,'actor_name',v_name,'priority',v_visit.priority,'scheduled_at',v_visit.scheduled_at)
 from public.workspace_members m
 where m.workspace_id=v_visit.workspace_id and m.active
  and (m.user_id=v_uid or m.role in ('admin','clinician','reception') or m.user_id=v_visit.created_by)
 on conflict(workspace_id,entity,record_id,recipient_user_id,alert_code)
 do update set generated_at=excluded.generated_at,resolved_at=null,metadata=excluded.metadata;
 return jsonb_build_object('ok',true,'visit_id',v_visit.id,'assignment_id',v_assignment,'assigned_user_id',v_uid);
end;
$function$;

drop trigger if exists notify_open_home_visit on public.home_visits;
create trigger notify_open_home_visit
after insert on public.home_visits
for each row execute function private.notify_open_home_visit();
revoke all on function private.ensure_home_visit_professional(uuid,uuid) from public,anon,authenticated;
revoke all on function private.notify_open_home_visit() from public,anon,authenticated;
revoke all on function public.volunteer_home_visit(uuid) from public,anon,authenticated;
revoke all on function public.list_available_home_visits(uuid) from public,anon,authenticated;
revoke all on function public.list_domicile_assignable_members(uuid) from public,anon,authenticated;
revoke all on function public.assign_home_visit_member(uuid,uuid) from public,anon,authenticated;
grant execute on function public.volunteer_home_visit(uuid) to authenticated;
grant execute on function public.list_available_home_visits(uuid) to authenticated;
grant execute on function public.list_domicile_assignable_members(uuid) to authenticated;
grant execute on function public.assign_home_visit_member(uuid,uuid) to authenticated;
