-- Persist protocol requirements and enforce them during reception and aliquoting.
begin;
alter table public.clinical_sample_types add column if not exists expected_containers integer, add column if not exists marking text, add column if not exists expected_primary_aliquots integer, add column if not exists expected_backup_aliquots integer;
alter table public.clinical_sample_types add constraint clinical_sample_types_expected_containers_check check(expected_containers is null or expected_containers>=1);
alter table public.clinical_sample_types add constraint clinical_sample_types_expected_primary_check check(expected_primary_aliquots is null or expected_primary_aliquots>=0);
alter table public.clinical_sample_types add constraint clinical_sample_types_expected_backup_check check(expected_backup_aliquots is null or expected_backup_aliquots>=0);

create or replace function public.guard_clinical_sample_workflow() returns trigger language plpgsql set search_path='' as $$
declare v_expected integer; v_total integer; v_valid integer; v_type public.clinical_sample_types%rowtype;
begin
 if tg_op='INSERT' then
  if new.workflow_status<>'REGISTRADO' then raise exception 'Una muestra nueva debe iniciar en REGISTRADO'; end if;
 elsif new.workflow_status is distinct from old.workflow_status then
  if coalesce(current_setting('app.clinical_transition',true),'')<>'on' then raise exception 'El estado de la muestra solo puede cambiar mediante la transición autorizada'; end if;
  if new.workflow_status='ALMACENAMIENTO_TEMPORAL' then
   select * into v_type from public.clinical_sample_types where workspace_id=new.workspace_id and id=new.sample_type_id;
   if v_type.expected_primary_aliquots is not null and new.primary_aliquots<>v_type.expected_primary_aliquots then raise exception 'La cantidad de crioviales principales no coincide con el protocolo. Esperados: %',v_type.expected_primary_aliquots; end if;
   if v_type.expected_backup_aliquots is not null and new.backup_aliquots<>v_type.expected_backup_aliquots then raise exception 'La cantidad de crioviales backup no coincide con el protocolo. Esperados: %',v_type.expected_backup_aliquots; end if;
  end if;
  if new.workflow_status='CONGELADOR_DEFINITIVO' then
   v_expected:=coalesce(new.primary_aliquots,0)+coalesce(new.backup_aliquots,0);
   select count(*),count(*) filter(where status='Almacenamiento definitivo' and box_id=new.definitive_box_id) into v_total,v_valid from public.clinical_cryovials where workspace_id=new.workspace_id and sample_id=new.id;
   if new.definitive_box_id is null or v_total<>v_expected or v_valid<>v_expected then raise exception 'No se puede cerrar el almacenamiento definitivo: todos los crioviales deben estar registrados y ubicados en la misma caja definitiva'; end if;
  end if;
 end if;
 return new;
end; $$;

create or replace function public.register_clinical_sample(
 p_workspace_id uuid,p_legacy_id text,p_study_id uuid,p_patient_id uuid,p_subject_code text,p_visit_id uuid,p_sample_type_id uuid,p_collection_at timestamptz,p_received_at timestamptz,p_container_count integer,p_tube_barcodes text[],p_notes text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_sample public.clinical_samples%rowtype; v_barcode text; v_type public.clinical_sample_types%rowtype;
begin
 if v_actor is null then raise exception 'Se requiere una sesión autenticada'; end if;
 if not public.has_workspace_role(p_workspace_id,array['admin','clinician','reception']) then raise exception 'No tiene permisos para registrar muestras'; end if;
 if p_legacy_id is null or length(trim(p_legacy_id))=0 or p_subject_code is null or length(trim(p_subject_code))=0 then raise exception 'Falta el identificador o código de sujeto'; end if;
 if p_collection_at is null or p_received_at is null or p_received_at<p_collection_at then raise exception 'La fecha/hora de recepción no puede ser anterior a la toma'; end if;
 if p_container_count is null or p_container_count<1 or p_tube_barcodes is null or cardinality(p_tube_barcodes)<>p_container_count then raise exception 'Debe proporcionar un código único por cada tubo o recipiente'; end if;
 if exists(select 1 from unnest(p_tube_barcodes) b where b is null or length(trim(b))=0) or (select count(distinct lower(trim(b))) from unnest(p_tube_barcodes) b)<>p_container_count then raise exception 'Los códigos de barras deben estar completos y ser únicos'; end if;
 if not exists(select 1 from public.patients p where p.id=p_patient_id and p.workspace_id=p_workspace_id) then raise exception 'El paciente no pertenece al espacio de trabajo'; end if;
 if not exists(select 1 from public.clinical_studies s where s.id=p_study_id and s.workspace_id=p_workspace_id and s.status='Activo') then raise exception 'El estudio no existe o no está activo'; end if;
 if not exists(select 1 from public.clinical_visits v where v.id=p_visit_id and v.workspace_id=p_workspace_id and v.study_id=p_study_id and v.active) then raise exception 'La visita no pertenece al estudio o está inactiva'; end if;
 select * into v_type from public.clinical_sample_types t where t.id=p_sample_type_id and t.workspace_id=p_workspace_id and t.study_id=p_study_id and t.active;
 if not found then raise exception 'El tipo de muestra no pertenece al estudio o está inactivo'; end if;
 if v_type.expected_containers is not null and p_container_count<>v_type.expected_containers then raise exception 'La cantidad de tubos no coincide con el protocolo. Esperados: %',v_type.expected_containers; end if;
 select * into v_sample from public.clinical_samples where workspace_id=p_workspace_id and legacy_id=p_legacy_id;
 if found then return jsonb_build_object('ok',true,'duplicate',true,'sample_id',v_sample.id,'workflow_status',v_sample.workflow_status); end if;
 insert into public.clinical_samples(workspace_id,legacy_id,study_id,patient_id,subject_code,visit_id,sample_type_id,collection_at,received_at,received_by,container_count,status,workflow_status,tube_barcode,notes,created_by)
 values(p_workspace_id,p_legacy_id,p_study_id,p_patient_id,trim(p_subject_code),p_visit_id,p_sample_type_id,p_collection_at,p_received_at,v_actor,p_container_count,'Recibida','REGISTRADO',trim(p_tube_barcodes[1]),p_notes,v_actor) returning * into v_sample;
 foreach v_barcode in array p_tube_barcodes loop
  insert into public.clinical_sample_containers(workspace_id,sample_id,barcode,container_type,tube_color,marking,collected_at,created_by)
  values(p_workspace_id,v_sample.id,trim(v_barcode),'tubo',v_type.color,coalesce(v_type.marking,v_type.tube),p_collection_at,v_actor);
 end loop;
 insert into public.audit_logs(workspace_id,actor_id,actor_name,entity_table,entity_id,action,changed_fields,occurred_at,details)
 select p_workspace_id,v_actor,coalesce(pr.display_name,''),'clinical_samples',v_sample.id,'sample_registered',array['study_id','patient_id','subject_code','visit_id','sample_type_id','collection_at','received_at','container_count'],now(),jsonb_build_object('legacy_id',p_legacy_id,'tube_barcodes',p_tube_barcodes) from public.profiles pr where pr.user_id=v_actor;
 return jsonb_build_object('ok',true,'duplicate',false,'sample_id',v_sample.id,'workflow_status',v_sample.workflow_status);
end; $$;
revoke all on function public.register_clinical_sample(uuid,text,uuid,uuid,text,uuid,uuid,timestamptz,timestamptz,integer,text[],text) from public;
grant execute on function public.register_clinical_sample(uuid,text,uuid,uuid,text,uuid,uuid,timestamptz,timestamptz,integer,text[],text) to authenticated;
commit;
