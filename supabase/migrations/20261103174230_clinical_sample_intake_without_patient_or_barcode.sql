begin;
alter table public.clinical_samples alter column patient_id drop not null;
alter table public.clinical_samples alter column tube_barcode drop not null;
create or replace function public.register_clinical_sample(
 p_workspace_id uuid,p_legacy_id text,p_study_id uuid,p_patient_id uuid,p_subject_code text,p_visit_id uuid,p_sample_type_id uuid,p_collection_at timestamptz,p_received_at timestamptz,p_container_count integer,p_tube_barcodes text[],p_notes text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_sample public.clinical_samples%rowtype; v_type public.clinical_sample_types%rowtype;
begin
 if v_actor is null then raise exception 'Se requiere una sesión autenticada'; end if;
 if not public.has_workspace_role(p_workspace_id,array['admin','clinician','reception']) then raise exception 'No tiene permisos para registrar muestras'; end if;
 if p_legacy_id is null or length(trim(p_legacy_id))=0 or p_subject_code is null or length(trim(p_subject_code))=0 then raise exception 'Falta el identificador o código de sujeto'; end if;
 if p_collection_at is null or p_received_at is null or p_received_at<p_collection_at then raise exception 'La fecha/hora de recepción no puede ser anterior a la toma'; end if;
 if p_container_count is null or p_container_count<1 then raise exception 'La cantidad de recipientes debe ser mayor que cero'; end if;
 if p_tube_barcodes is not null and cardinality(p_tube_barcodes)>0 then raise exception 'El registro de muestra no requiere códigos de barras de tubos'; end if;
 if not exists(select 1 from public.clinical_studies s where s.id=p_study_id and s.workspace_id=p_workspace_id and s.status='Activo') then raise exception 'El estudio no existe o no está activo'; end if;
 if not exists(select 1 from public.clinical_visits v where v.id=p_visit_id and v.workspace_id=p_workspace_id and v.study_id=p_study_id and v.active) then raise exception 'La visita no pertenece al estudio o está inactiva'; end if;
 select * into v_type from public.clinical_sample_types t where t.id=p_sample_type_id and t.workspace_id=p_workspace_id and t.study_id=p_study_id and t.active;
 if not found then raise exception 'El tipo de muestra no pertenece al estudio o está inactivo'; end if;
 if v_type.expected_containers is not null and p_container_count<>v_type.expected_containers then raise exception 'La cantidad de recipientes no coincide con el protocolo. Esperados: %',v_type.expected_containers; end if;
 select * into v_sample from public.clinical_samples where workspace_id=p_workspace_id and legacy_id=p_legacy_id;
 if found then return jsonb_build_object('ok',true,'duplicate',true,'sample_id',v_sample.id,'workflow_status',v_sample.workflow_status); end if;
 insert into public.clinical_samples(workspace_id,legacy_id,study_id,patient_id,subject_code,visit_id,sample_type_id,collection_at,received_at,received_by,container_count,status,workflow_status,tube_barcode,notes,created_by)
 values(p_workspace_id,p_legacy_id,p_study_id,null,trim(p_subject_code),p_visit_id,p_sample_type_id,p_collection_at,p_received_at,v_actor,p_container_count,'Recibida','REGISTRADO',null,p_notes,v_actor) returning * into v_sample;
 insert into public.audit_logs(workspace_id,actor_id,actor_name,entity_table,entity_id,action,changed_fields,occurred_at,details)
 select p_workspace_id,v_actor,coalesce(pr.display_name,''),'clinical_samples',v_sample.id,'sample_registered',array['study_id','subject_code','visit_id','sample_type_id','collection_at','received_at','container_count'],now(),jsonb_build_object('legacy_id',p_legacy_id,'container_count',p_container_count) from public.profiles pr where pr.user_id=v_actor;
 return jsonb_build_object('ok',true,'duplicate',false,'sample_id',v_sample.id,'workflow_status',v_sample.workflow_status);
end; $$;
revoke all on function public.register_clinical_sample(uuid,text,uuid,uuid,text,uuid,uuid,timestamptz,timestamptz,integer,text[],text) from public,anon;
grant execute on function public.register_clinical_sample(uuid,text,uuid,uuid,text,uuid,uuid,timestamptz,timestamptz,integer,text[],text) to authenticated;
create or replace function public.transition_clinical_sample(p_sample_id uuid,p_next_status text,p_notes text default null,p_primary_aliquots integer default null,p_backup_aliquots integer default null,p_temporary_box_id uuid default null,p_definitive_box_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sample public.clinical_samples%rowtype; v_actor uuid:=auth.uid(); v_allowed text[]; v_old_status text; v_legacy_status text; v_actor_name text; v_expected integer; v_total integer; v_final integer;
begin
 if v_actor is null then raise exception 'Se requiere una sesión autenticada'; end if;
 select * into v_sample from public.clinical_samples where id=p_sample_id for update;
 if not found then raise exception 'Muestra no encontrada'; end if;
 v_old_status:=v_sample.workflow_status;
 if p_next_status not in ('EN_REVISION','PENDIENTE_PROCESO','PROCESANDO','ALMACENAMIENTO_TEMPORAL','CONGELADOR_DEFINITIVO') then raise exception 'Estado de destino no permitido'; end if;
 if p_next_status='EN_REVISION' and v_old_status='REGISTRADO' then v_allowed:=array['admin','clinician','reception'];
 elsif p_next_status='PENDIENTE_PROCESO' and v_old_status='EN_REVISION' then
  v_allowed:=array['admin','clinician','reception'];
  if v_sample.study_id is null or v_sample.visit_id is null or v_sample.sample_type_id is null or v_sample.collection_at is null or v_sample.received_at is null then raise exception 'Faltan datos obligatorios de estudio, visita, tipo de muestra o fechas'; end if;
  if not exists(select 1 from public.clinical_visits v where v.workspace_id=v_sample.workspace_id and v.id=v_sample.visit_id and v.study_id=v_sample.study_id and v.active) then raise exception 'La visita no pertenece al estudio o está inactiva'; end if;
  if not exists(select 1 from public.clinical_sample_types t where t.workspace_id=v_sample.workspace_id and t.id=v_sample.sample_type_id and t.study_id=v_sample.study_id and t.active) then raise exception 'El tipo de muestra no pertenece al estudio o está inactivo'; end if;
 elsif p_next_status='PROCESANDO' and v_old_status='PENDIENTE_PROCESO' then v_allowed:=array['admin','technician'];
 elsif p_next_status='ALMACENAMIENTO_TEMPORAL' and v_old_status='PROCESANDO' then
  v_allowed:=array['admin','technician'];
  if p_primary_aliquots is null or p_backup_aliquots is null or p_primary_aliquots<0 or p_backup_aliquots<0 or p_primary_aliquots+p_backup_aliquots<1 then raise exception 'Indique cantidades válidas de crioviales principal y backup'; end if;
 elsif p_next_status='CONGELADOR_DEFINITIVO' and v_old_status='ALMACENAMIENTO_TEMPORAL' then
  v_allowed:=array['admin','technician'];v_expected:=coalesce(v_sample.primary_aliquots,0)+coalesce(v_sample.backup_aliquots,0);
  select count(*),count(*) filter(where status='Almacenamiento definitivo') into v_total,v_final from public.clinical_cryovials where workspace_id=v_sample.workspace_id and sample_id=v_sample.id;
  if v_expected<1 or v_total<>v_expected or v_final<>v_expected then raise exception 'Todos los crioviales deben estar registrados y ubicados definitivamente antes de cerrar la muestra'; end if;
 else raise exception 'Transición inválida: % -> %',v_old_status,p_next_status;
 end if;
 if not public.has_workspace_role(v_sample.workspace_id,v_allowed) then raise exception 'No tiene permisos para ejecutar esta transición'; end if;
 perform pg_catalog.set_config('app.clinical_transition','on',true);
 v_legacy_status:=case p_next_status when 'EN_REVISION' then 'En revisión' when 'PENDIENTE_PROCESO' then 'Pendiente de procesamiento' when 'PROCESANDO' then 'Pendiente de procesamiento' when 'ALMACENAMIENTO_TEMPORAL' then 'Procesada' when 'CONGELADOR_DEFINITIVO' then 'Almacenada' end;
 update public.clinical_samples set workflow_status=p_next_status,status=v_legacy_status,reviewed_by=case when p_next_status='PENDIENTE_PROCESO' then v_actor else reviewed_by end,reviewed_at=case when p_next_status='PENDIENTE_PROCESO' then now() else reviewed_at end,processing_started_by=case when p_next_status='PROCESANDO' then v_actor else processing_started_by end,processing_started_at=case when p_next_status='PROCESANDO' then now() else processing_started_at end,primary_aliquots=case when p_next_status='ALMACENAMIENTO_TEMPORAL' then p_primary_aliquots else primary_aliquots end,backup_aliquots=case when p_next_status='ALMACENAMIENTO_TEMPORAL' then p_backup_aliquots else backup_aliquots end,processed_by=case when p_next_status='ALMACENAMIENTO_TEMPORAL' then v_actor else processed_by end,processed_at=case when p_next_status='ALMACENAMIENTO_TEMPORAL' then now() else processed_at end,temporary_box_id=case when p_next_status='ALMACENAMIENTO_TEMPORAL' then null else temporary_box_id end,definitive_box_id=case when p_next_status='CONGELADOR_DEFINITIVO' then null else definitive_box_id end,stored_by=case when p_next_status='CONGELADOR_DEFINITIVO' then v_actor else stored_by end,stored_at=case when p_next_status='CONGELADOR_DEFINITIVO' then now() else stored_at end,updated_at=now(),notes=case when p_notes is not null and length(trim(p_notes))>0 then concat_ws(E'\n',nullif(notes,''),p_notes) else notes end where id=p_sample_id;
 insert into public.clinical_sample_events(workspace_id,sample_id,previous_status,next_status,notes,actor_id,occurred_at) values(v_sample.workspace_id,v_sample.id,v_old_status,p_next_status,p_notes,v_actor,now());
 select coalesce(p.display_name,'') into v_actor_name from public.profiles p where p.user_id=v_actor;
 insert into public.audit_logs(workspace_id,actor_id,actor_name,entity_table,entity_id,action,changed_fields,occurred_at,details) values(v_sample.workspace_id,v_actor,coalesce(v_actor_name,''),'clinical_samples',v_sample.id,'workflow_transition',array['workflow_status','status','updated_at'],now(),jsonb_build_object('from',v_old_status,'to',p_next_status,'notes',p_notes));
 return jsonb_build_object('ok',true,'sample_id',v_sample.id,'previous_status',v_old_status,'status',p_next_status);
end; $$;
revoke all on function public.transition_clinical_sample(uuid,text,text,integer,integer,uuid,uuid) from public,anon;
grant execute on function public.transition_clinical_sample(uuid,text,text,integer,integer,uuid,uuid) to authenticated;
commit;