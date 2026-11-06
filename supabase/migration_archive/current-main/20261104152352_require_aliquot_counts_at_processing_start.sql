-- Require the technician to record aliquot counts before starting sample processing.
begin;
create or replace function public.transition_clinical_sample(
 p_sample_id uuid,
 p_next_status text,
 p_notes text default null,
 p_primary_aliquots integer default null,
 p_backup_aliquots integer default null,
 p_temporary_box_id uuid default null,
 p_definitive_box_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
 v_sample public.clinical_samples%rowtype;
 v_actor uuid:=auth.uid();
 v_allowed text[];
 v_old_status text;
 v_legacy_status text;
 v_actor_name text;
 v_type public.clinical_sample_types%rowtype;
begin
 if v_actor is null then raise exception 'Se requiere una sesión autenticada'; end if;
 select * into v_sample from public.clinical_samples where id=p_sample_id for update;
 if not found then raise exception 'Muestra no encontrada'; end if;
 v_old_status:=v_sample.workflow_status;
 if p_next_status not in ('EN_REVISION','PENDIENTE_PROCESO','PROCESANDO','ALMACENAMIENTO_TEMPORAL','CONGELADOR_DEFINITIVO') then raise exception 'Estado de destino no permitido'; end if;

 if p_next_status='EN_REVISION' and v_old_status='REGISTRADO' then
  v_allowed:=array['admin','clinician','reception'];
 elsif p_next_status='PENDIENTE_PROCESO' and v_old_status='EN_REVISION' then
  v_allowed:=array['admin','clinician','reception'];
  if v_sample.study_id is null or v_sample.visit_id is null or v_sample.sample_type_id is null or v_sample.collection_at is null or v_sample.received_at is null then raise exception 'Faltan datos obligatorios de estudio, visita, tipo de muestra o fechas'; end if;
  if not exists(select 1 from public.clinical_visits v where v.workspace_id=v_sample.workspace_id and v.id=v_sample.visit_id and v.study_id=v_sample.study_id and v.active) then raise exception 'La visita no pertenece al estudio o está inactiva'; end if;
  if not exists(select 1 from public.clinical_sample_types t where t.workspace_id=v_sample.workspace_id and t.id=v_sample.sample_type_id and t.study_id=v_sample.study_id and t.active) then raise exception 'El tipo de muestra no pertenece al estudio o está inactivo'; end if;
 elsif p_next_status='PROCESANDO' and v_old_status='PENDIENTE_PROCESO' then
  v_allowed:=array['admin','technician'];
  if p_primary_aliquots is null or p_backup_aliquots is null or p_primary_aliquots<0 or p_backup_aliquots<0 or p_primary_aliquots+p_backup_aliquots<1 then
   raise exception 'Antes de iniciar el procesamiento indique cantidades enteras válidas de alícuotas principales y de respaldo';
  end if;
  select * into v_type from public.clinical_sample_types where workspace_id=v_sample.workspace_id and id=v_sample.sample_type_id;
  if not found then raise exception 'No se encontró el protocolo del tipo de muestra'; end if;
  if v_type.expected_primary_aliquots is not null and p_primary_aliquots<>v_type.expected_primary_aliquots then
   raise exception 'El protocolo exige % alícuotas principales',v_type.expected_primary_aliquots;
  end if;
  if v_type.expected_backup_aliquots is not null and p_backup_aliquots<>v_type.expected_backup_aliquots then
   raise exception 'El protocolo exige % alícuotas de respaldo',v_type.expected_backup_aliquots;
  end if;
 elsif p_next_status='ALMACENAMIENTO_TEMPORAL' and v_old_status='PROCESANDO' then
  v_allowed:=array['admin','technician'];
  if coalesce(v_sample.primary_aliquots,0)+coalesce(v_sample.backup_aliquots,0)<1 then raise exception 'Registre la cantidad de alícuotas al iniciar el procesamiento antes de pasar a almacenamiento temporal'; end if;
 elsif p_next_status='CONGELADOR_DEFINITIVO' and v_old_status='ALMACENAMIENTO_TEMPORAL' then
  v_allowed:=array['admin','technician'];
 else
  raise exception 'Transición inválida: % -> %',v_old_status,p_next_status;
 end if;

 if not public.has_workspace_role(v_sample.workspace_id,v_allowed) then raise exception 'No tiene permisos para ejecutar esta transición'; end if;
 perform pg_catalog.set_config('app.clinical_transition','on',true);
 v_legacy_status:=case p_next_status when 'EN_REVISION' then 'En revisión' when 'PENDIENTE_PROCESO' then 'Pendiente de procesamiento' when 'PROCESANDO' then 'Pendiente de procesamiento' when 'ALMACENAMIENTO_TEMPORAL' then 'Procesada' when 'CONGELADOR_DEFINITIVO' then 'Almacenada' end;

 update public.clinical_samples
 set workflow_status=p_next_status,status=v_legacy_status,
 reviewed_by=case when p_next_status='PENDIENTE_PROCESO' then v_actor else reviewed_by end,
 reviewed_at=case when p_next_status='PENDIENTE_PROCESO' then now() else reviewed_at end,
 processing_started_by=case when p_next_status='PROCESANDO' then v_actor else processing_started_by end,
 processing_started_at=case when p_next_status='PROCESANDO' then now() else processing_started_at end,
 primary_aliquots=case when p_next_status='PROCESANDO' then p_primary_aliquots else primary_aliquots end,
 backup_aliquots=case when p_next_status='PROCESANDO' then p_backup_aliquots else backup_aliquots end,
 processed_by=case when p_next_status='ALMACENAMIENTO_TEMPORAL' then v_actor else processed_by end,
 processed_at=case when p_next_status='ALMACENAMIENTO_TEMPORAL' then now() else processed_at end,
 stored_by=case when p_next_status='CONGELADOR_DEFINITIVO' then v_actor else stored_by end,
 stored_at=case when p_next_status='CONGELADOR_DEFINITIVO' then now() else stored_at end,
 updated_at=now(),
 notes=case when p_notes is not null and length(trim(p_notes))>0 then concat_ws(E'\n',nullif(notes,''),p_notes) else notes end
 where id=p_sample_id;

 insert into public.clinical_sample_events(workspace_id,sample_id,previous_status,next_status,notes,actor_id,occurred_at)
 values(v_sample.workspace_id,v_sample.id,v_old_status,p_next_status,p_notes,v_actor,now());
 select coalesce(p.display_name,'') into v_actor_name from public.profiles p where p.user_id=v_actor;
 insert into public.audit_logs(workspace_id,actor_id,actor_name,entity_table,entity_id,action,changed_fields,occurred_at,details)
 values(v_sample.workspace_id,v_actor,coalesce(v_actor_name,''),'clinical_samples',v_sample.id,'workflow_transition',case when p_next_status='PROCESANDO' then array['workflow_status','status','primary_aliquots','backup_aliquots','updated_at'] else array['workflow_status','status','updated_at'] end,now(),jsonb_build_object('from',v_old_status,'to',p_next_status,'notes',p_notes));
 return jsonb_build_object('ok',true,'sample_id',v_sample.id,'previous_status',v_old_status,'status',p_next_status);
end;
$$;

revoke all on function public.transition_clinical_sample(uuid,text,text,integer,integer,uuid,uuid) from public,anon;
grant execute on function public.transition_clinical_sample(uuid,text,text,integer,integer,uuid,uuid) to authenticated;
commit;
