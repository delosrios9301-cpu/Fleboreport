-- Record sample reception as an immutable event attributed to the authenticated user.
begin;
create or replace function public.register_clinical_sample(
 p_workspace_id uuid,p_legacy_id text,p_study_id uuid,p_patient_id uuid,p_subject_code text,
 p_visit_id uuid,p_sample_type_id uuid,p_collection_at timestamptz,p_received_at timestamptz,
 p_container_count integer,p_tube_barcodes text[],p_notes text default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid:=auth.uid();
 v_sample public.clinical_samples%rowtype;
 v_type public.clinical_sample_types%rowtype;
 v_now timestamptz:=now();
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
 select * into v_sample from public.clinical_samples where workspace_id=p_workspace_id and legacy_id=p_legacy_id and deleted_at is null;
 if found then return jsonb_build_object('ok',true,'duplicate',true,'sample_id',v_sample.id,'workflow_status',v_sample.workflow_status); end if;
 insert into public.clinical_samples(workspace_id,legacy_id,study_id,patient_id,subject_code,visit_id,sample_type_id,collection_at,received_at,received_by,container_count,status,workflow_status,tube_barcode,notes,created_by)
 values(p_workspace_id,p_legacy_id,p_study_id,null,trim(p_subject_code),p_visit_id,p_sample_type_id,p_collection_at,p_received_at,v_actor,p_container_count,'Recibida','REGISTRADO',null,p_notes,v_actor)
 returning * into v_sample;
 insert into public.clinical_sample_events(workspace_id,sample_id,previous_status,next_status,notes,actor_id,occurred_at)
 values(p_workspace_id,v_sample.id,null,'REGISTRADO','Recepción registrada',v_actor,v_now);
 insert into public.audit_logs(workspace_id,actor_id,actor_name,entity_table,entity_id,action,changed_fields,occurred_at,details)
 select p_workspace_id,v_actor,coalesce(pr.display_name,''),'clinical_samples',v_sample.id,'sample_registered',array['study_id','subject_code','visit_id','sample_type_id','collection_at','received_at','received_by','container_count'],v_now,jsonb_build_object('legacy_id',p_legacy_id,'container_count',p_container_count,'received_by',v_actor)
 from public.profiles pr where pr.user_id=v_actor;
 return jsonb_build_object('ok',true,'duplicate',false,'sample_id',v_sample.id,'workflow_status',v_sample.workflow_status,'received_by',v_actor);
end;
$$;
commit;
