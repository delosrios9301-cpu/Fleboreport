-- FleboReport · Autoasignación voluntaria únicamente en la fecha programada.
-- El criterio temporal es fecha civil America/Panama, no UTC ni reloj del dispositivo.
-- La asignación manual anticipada de Agenda sigue sin restricciones adicionales.

CREATE OR REPLACE FUNCTION private.notify_open_home_visit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.status='pending_assignment' and new.archived_at is null
    and (new.scheduled_at at time zone 'America/Panama')::date =
        (clock_timestamp() at time zone 'America/Panama')::date then
  insert into public.workflow_sla_alerts
   (workspace_id,entity,record_id,recipient_user_id,alert_code,severity,due_at,metadata)
  select new.workspace_id,'home_visit',new.id,m.user_id,'volunteer_available','warning',clock_timestamp(),
   jsonb_build_object('priority',new.priority,'scheduled_at',new.scheduled_at,'source','unassigned_domicile')
  from public.workspace_members m
  where m.workspace_id=new.workspace_id and m.active
   -- Solo se informa a cuentas habilitadas para este módulo.
   and private.can_member_view_home_visit(new.workspace_id,m.user_id)
  on conflict(workspace_id,entity,record_id,recipient_user_id,alert_code)
  do update set resolved_at=null,generated_at=excluded.generated_at,
    acknowledged_at=null,acknowledged_by=null,metadata=excluded.metadata
  where public.workflow_sla_alerts.resolved_at is not null;
 end if;
 return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.publish_today_unassigned_home_visit_alerts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_count integer:=0;
begin
  -- Las ofertas antiguas para visitas de otros días no deben permanecer en la campana.
  update public.workflow_sla_alerts a
  set resolved_at=clock_timestamp()
  from public.home_visits v
  where a.workspace_id=v.workspace_id and a.record_id=v.id
    and a.entity='home_visit' and a.alert_code='volunteer_available'
    and a.resolved_at is null
    and (
      (v.scheduled_at at time zone 'America/Panama')::date
        is distinct from (clock_timestamp() at time zone 'America/Panama')::date
      or v.archived_at is not null
      or v.status not in ('pending_assignment','pending_acceptance')
      or exists (
        select 1 from public.home_visit_assignments a2
        where a2.workspace_id=v.workspace_id and a2.home_visit_id=v.id
          and a2.status in ('invited','accepted')
      )
    );

  -- Se activa en el día correcto, aunque la visita se haya creado días antes.
  -- En cada ejecución solo se emite el primer aviso (o se reabre uno archivado).
  insert into public.workflow_sla_alerts
    (workspace_id,entity,record_id,recipient_user_id,alert_code,severity,due_at,metadata)
  select v.workspace_id,'home_visit',v.id,m.user_id,'volunteer_available','warning',
     clock_timestamp(),
     jsonb_build_object('priority',v.priority,'scheduled_at',v.scheduled_at,
       'source','unassigned_domicile_today')
  from public.home_visits v
  join public.workspace_members m on m.workspace_id=v.workspace_id and m.active
  where v.archived_at is null
    and v.status in ('pending_assignment','pending_acceptance')
    and (v.scheduled_at at time zone 'America/Panama')::date =
      (clock_timestamp() at time zone 'America/Panama')::date
    and not exists (
      select 1 from public.home_visit_assignments a2
      where a2.workspace_id=v.workspace_id and a2.home_visit_id=v.id
        and a2.status in ('invited','accepted')
    )
    and private.can_member_view_home_visit(v.workspace_id,m.user_id)
  on conflict(workspace_id,entity,record_id,recipient_user_id,alert_code)
  do update set
    resolved_at=null,
    acknowledged_at=null,acknowledged_by=null,
    generated_at=excluded.generated_at,
    metadata=excluded.metadata
  where public.workflow_sla_alerts.resolved_at is not null;
  get diagnostics v_count=row_count;
  return v_count;
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
   and (v.scheduled_at at time zone 'America/Panama')::date =
       (clock_timestamp() at time zone 'America/Panama')::date
   and not exists (
     select 1 from public.home_visit_assignments a
     where a.workspace_id=v.workspace_id and a.home_visit_id=v.id
       and a.status in ('invited','accepted')
   )
 order by v.scheduled_at asc,v.id asc limit 150;
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
  -- "Mismo día" siempre se interpreta en la zona horaria del laboratorio (Panamá).
  if (v_visit.scheduled_at at time zone 'America/Panama')::date
       is distinct from (clock_timestamp() at time zone 'America/Panama')::date then
    raise exception 'La asignación voluntaria se habilita únicamente el día programado (hora de Panamá)'
      using errcode='22023';
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
  and private.can_member_view_home_visit(v_visit.workspace_id,m.user_id)
 on conflict(workspace_id,entity,record_id,recipient_user_id,alert_code)
 do update set generated_at=excluded.generated_at,resolved_at=null,metadata=excluded.metadata;
 return jsonb_build_object('ok',true,'visit_id',v_visit.id,'assignment_id',v_assignment,'assigned_user_id',v_uid);
end;
$function$;

revoke all on function private.publish_today_unassigned_home_visit_alerts() from public,anon,authenticated;
revoke all on function public.list_available_home_visits(uuid) from public,anon,authenticated;
revoke all on function public.volunteer_home_visit(uuid) from public,anon,authenticated;
grant execute on function public.list_available_home_visits(uuid) to authenticated;
grant execute on function public.volunteer_home_visit(uuid) to authenticated;

-- Un trabajo periódico abre las ofertas al llegar el día. La RPC es idempotente:
-- solo crea avisos nuevos o reabre avisos resueltos, evitando mensajes repetidos.
select cron.schedule(
 'fleboreport-volunteer-domicilios-today',
 '*/5 * * * *',
 'select private.publish_today_unassigned_home_visit_alerts();'
);
select private.publish_today_unassigned_home_visit_alerts();
