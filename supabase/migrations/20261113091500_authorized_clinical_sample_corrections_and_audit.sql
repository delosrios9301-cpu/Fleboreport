-- Replica exacta de las RPC aplicadas en Supabase. Corregir y retirar una muestra sin borrar el historial.
begin;

CREATE OR REPLACE FUNCTION public.clinical_sample_management_permissions(p_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_can_manage boolean := false;
begin
 if auth.uid() is null then raise exception 'Se requiere sesión autenticada'; end if;
 v_can_manage := public.has_workspace_role(p_workspace_id,array['admin','clinician']::text[]);
 return jsonb_build_object(
   'can_edit', v_can_manage and private.has_workspace_permission(p_workspace_id,'processing','edit'),
   'can_delete', v_can_manage and private.has_workspace_permission(p_workspace_id,'processing','delete')
 );
end;
$function$;

CREATE OR REPLACE FUNCTION public.correct_clinical_sample(p_workspace_id uuid, p_sample_id uuid, p_visit_id uuid, p_collection_at timestamp with time zone, p_received_at timestamp with time zone, p_reason text, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_sample public.clinical_samples%rowtype;
 v_actor uuid := auth.uid();
 v_reason text := nullif(btrim(coalesce(p_reason,'')),'');
 v_actor_name text;
begin
 if v_actor is null then raise exception 'Se requiere sesión autenticada'; end if;
 if not public.has_workspace_role(p_workspace_id,array['admin','clinician']::text[])
   or not private.has_workspace_permission(p_workspace_id,'processing','edit') then
   raise exception 'Solo el administrador o coordinador autorizado puede corregir muestras procesadas';
 end if;
 if v_reason is null or char_length(v_reason)<5 then
   raise exception 'Indique el motivo de corrección (mínimo 5 caracteres)';
 end if;
 if p_visit_id is null or p_collection_at is null or p_received_at is null then
   raise exception 'Complete visita, fecha y hora de toma y fecha y hora de recepción';
 end if;
 if p_received_at < p_collection_at then
   raise exception 'La recepción no puede ser anterior a la toma';
 end if;
 if p_received_at > now()+interval '5 minutes' or p_collection_at>now()+interval '5 minutes' then
   raise exception 'Las fechas no pueden quedar en el futuro';
 end if;
 select * into v_sample from public.clinical_samples
 where id=p_sample_id and workspace_id=p_workspace_id for update;
 if not found then raise exception 'Muestra no encontrada en el espacio de trabajo'; end if;
 if v_sample.deleted_at is not null then raise exception 'No se puede corregir una muestra eliminada'; end if;
 if v_sample.workflow_status not in ('ALMACENAMIENTO_TEMPORAL','CONGELADOR_DEFINITIVO') then
   raise exception 'La corrección desde una tarjeta almacenada solo se permite en almacenamiento temporal o definitivo';
 end if;
 if p_expected_updated_at is not null and v_sample.updated_at is distinct from p_expected_updated_at then
   raise exception 'Esta muestra cambió en otro dispositivo; actualice la bandeja antes de corregir';
 end if;
 if not exists (
   select 1 from public.clinical_visits cv
    where cv.id=p_visit_id and cv.workspace_id=p_workspace_id
      and cv.study_id=v_sample.study_id and cv.active
 ) then
   raise exception 'Seleccione una visita activa asociada al estudio de la muestra';
 end if;
 if v_sample.visit_id = p_visit_id and v_sample.collection_at = p_collection_at
  and v_sample.received_at = p_received_at then
   raise exception 'No hay cambios que guardar';
 end if;
 select coalesce(p.display_name,'Usuario autorizado') into v_actor_name
 from public.profiles p where p.user_id=v_actor;
 update public.clinical_samples
 set visit_id=p_visit_id,collection_at=p_collection_at,received_at=p_received_at,updated_at=now()
 where id=p_sample_id and workspace_id=p_workspace_id;
 insert into public.clinical_sample_events
 (workspace_id,sample_id,previous_status,next_status,notes,actor_id,occurred_at)
 values(p_workspace_id,p_sample_id,v_sample.workflow_status,v_sample.workflow_status,
        'Corrección administrativa de datos: '||v_reason,v_actor,now());
 insert into public.audit_logs
 (workspace_id,actor_id,actor_name,entity_table,entity_id,action,changed_fields,occurred_at,details)
 values(p_workspace_id,v_actor,coalesce(v_actor_name,'Usuario autorizado'),'clinical_samples',p_sample_id,
 'sample_metadata_corrected',array['visit_id','collection_at','received_at','updated_at'],now(),
 jsonb_build_object(
  'reason',v_reason,'workflow_status_unchanged',v_sample.workflow_status,
  'before',jsonb_build_object('visit_id',v_sample.visit_id,'collection_at',v_sample.collection_at,'received_at',v_sample.received_at),
  'after',jsonb_build_object('visit_id',p_visit_id,'collection_at',p_collection_at,'received_at',p_received_at)
 ));
 return jsonb_build_object('ok',true,'sample_id',p_sample_id,
  'status',v_sample.workflow_status,'updated_at',(select updated_at from public.clinical_samples where id=p_sample_id));
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_clinical_sample(p_workspace_id uuid, p_sample_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid := auth.uid();
 v_sample public.clinical_samples%rowtype;
 v_actor_name text;
 v_reason text := nullif(btrim(coalesce(p_reason,'')),'');
begin
 if v_actor is null then raise exception 'Se requiere sesión autenticada'; end if;
 if not public.has_workspace_role(p_workspace_id,array['admin','clinician']::text[])
  or not private.has_workspace_permission(p_workspace_id,'processing','delete') then
   raise exception 'Solo el administrador o coordinador con permiso de eliminación puede retirar la muestra';
 end if;
 if v_reason is null or char_length(v_reason)<5 then
   raise exception 'Indique el motivo de eliminación (mínimo 5 caracteres)';
 end if;
 select * into v_sample from public.clinical_samples
 where workspace_id=p_workspace_id and id=p_sample_id for update;
 if not found then raise exception 'La muestra no existe en este espacio de trabajo'; end if;
 if v_sample.deleted_at is not null then
   return jsonb_build_object('ok',true,'already_deleted',true,'sample_id',v_sample.id);
 end if;
 select coalesce(p.display_name,'Usuario autorizado') into v_actor_name
 from public.profiles p where p.user_id=v_actor;
 update public.clinical_samples
 set deleted_at=now(),deleted_by=v_actor,deletion_reason=v_reason,updated_at=now()
 where id=p_sample_id and workspace_id=p_workspace_id;
 insert into public.clinical_sample_events
 (workspace_id,sample_id,previous_status,next_status,notes,actor_id,occurred_at)
 values(p_workspace_id,p_sample_id,v_sample.workflow_status,'ELIMINADA',v_reason,v_actor,now());
 insert into public.audit_logs
 (workspace_id,actor_id,actor_name,entity_table,entity_id,action,changed_fields,occurred_at,details)
 values(p_workspace_id,v_actor,coalesce(v_actor_name,'Usuario autorizado'),'clinical_samples',p_sample_id,
 'sample_deleted',array['deleted_at','deleted_by','deletion_reason'],now(),
 jsonb_build_object('legacy_id',v_sample.legacy_id,'subject_code',v_sample.subject_code,
 'workflow_status',v_sample.workflow_status,'reason',v_reason,'sample_id',v_sample.id));
 return jsonb_build_object('ok',true,'sample_id',p_sample_id,'deleted_at',now());
end;
$function$;

revoke all on function public.clinical_sample_management_permissions(uuid) from public, anon;
grant execute on function public.clinical_sample_management_permissions(uuid) to authenticated;
revoke all on function public.correct_clinical_sample(uuid,uuid,uuid,timestamptz,timestamptz,text,timestamptz) from public, anon;
grant execute on function public.correct_clinical_sample(uuid,uuid,uuid,timestamptz,timestamptz,text,timestamptz) to authenticated;
revoke all on function public.delete_clinical_sample(uuid,uuid,text) from public, anon;
grant execute on function public.delete_clinical_sample(uuid,uuid,text) to authenticated;
commit;
