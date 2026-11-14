-- Destinatarios de avisos de domicilios: solo miembros autorizados.
CREATE OR REPLACE FUNCTION private.can_member_view_home_visit(p_workspace_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(
  select 1 from public.workspace_members wm
  where wm.workspace_id=p_workspace_id and wm.user_id=p_user_id and wm.active
   and (
     private.member_has_workspace_role(p_workspace_id,p_user_id,array['admin']::text[])
     or coalesce(
       (select mp.allowed from public.member_permissions mp
        where mp.workspace_id=p_workspace_id and mp.user_id=p_user_id
         and mp.module_key='domicilios' and mp.action_key='view' and mp.site_id is null
        limit 1),
       (select bool_or(rp.allowed)
        from public.workspace_member_roles wmr
        join public.workspace_roles wr
         on wr.workspace_id=wmr.workspace_id and wr.role_key=wmr.role_key and wr.active
        join public.role_permissions rp
         on rp.workspace_id=wmr.workspace_id and rp.role_key=wmr.role_key
        where wmr.workspace_id=p_workspace_id and wmr.user_id=p_user_id
         and rp.module_key='domicilios' and rp.action_key='view'),
       (select rp.allowed from public.role_permissions rp
        join public.workspace_roles wr
         on wr.workspace_id=rp.workspace_id and wr.role_key=rp.role_key and wr.active
        where rp.workspace_id=p_workspace_id and rp.role_key=wm.role
         and rp.module_key='domicilios' and rp.action_key='view' limit 1),
       false
     )
   )
 );
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
   and private.can_member_view_home_visit(new.workspace_id,m.user_id)
  on conflict(workspace_id,entity,record_id,recipient_user_id,alert_code) do nothing;
 end if;
 return new;
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
  and private.can_member_view_home_visit(v_visit.workspace_id,m.user_id)
 on conflict(workspace_id,entity,record_id,recipient_user_id,alert_code)
 do update set generated_at=excluded.generated_at,resolved_at=null,metadata=excluded.metadata;
 return jsonb_build_object('ok',true,'visit_id',v_visit.id,'assignment_id',v_assignment,'assigned_user_id',v_uid);
end;
$function$;

revoke all on function private.can_member_view_home_visit(uuid,uuid) from public,anon,authenticated;
