begin;

-- Acceso de corrección durante la revisión: se exige pertenencia y permiso real.
create or replace function public.clinical_review_edit_permission(p_workspace_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $fn$
declare v_ok boolean:=false;
begin
 if auth.uid() is null then raise exception 'Se requiere sesión autenticada'; end if;
 v_ok:=public.has_workspace_role(p_workspace_id,array['admin','clinician','reception']::text[])
  and (private.has_workspace_permission(p_workspace_id,'studies','edit',null)
       or private.has_workspace_permission(p_workspace_id,'studies','create',null)
       or private.has_workspace_permission(p_workspace_id,'studies','approve',null));
 return jsonb_build_object('can_edit',v_ok);
end;
$fn$;

-- Modifica solo metadatos previos a la aprobación; no cambia estados.
create or replace function public.correct_clinical_sample_in_review(
 p_workspace_id uuid,p_sample_id uuid,p_subject_code text,
 p_visit_id uuid,p_sample_type_id uuid,p_collection_at timestamptz,
 p_received_at timestamptz,p_container_count integer,p_notes text,
 p_reason text,p_expected_updated_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path=''
as $fn$
declare
 v_actor uuid:=auth.uid();
 v_sample public.clinical_samples%rowtype;
 v_type public.clinical_sample_types%rowtype;
 v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
 v_subject text:=btrim(coalesce(p_subject_code,''));
 v_notes text:=nullif(btrim(coalesce(p_notes,'')),'');
 v_actor_name text:='Usuario autorizado';
 v_updated_at timestamptz;
 v_has_changes boolean;
begin
 if v_actor is null then raise exception 'Se requiere sesión autenticada'; end if;
 if not public.has_workspace_role(p_workspace_id,array['admin','clinician','reception']::text[])
   or not (
     private.has_workspace_permission(p_workspace_id,'studies','edit',null)
     or private.has_workspace_permission(p_workspace_id,'studies','create',null)
     or private.has_workspace_permission(p_workspace_id,'studies','approve',null)
   ) then raise exception 'No tiene autorización para corregir muestras en revisión'; end if;
 if v_reason is null or char_length(v_reason)<5 then
  raise exception 'Indique el motivo de corrección (mínimo cinco caracteres)';
 end if;
 if v_subject='' or char_length(v_subject)>128 then
  raise exception 'El número de sujeto es obligatorio y no puede exceder 128 caracteres';
 end if;
 if p_visit_id is null or p_sample_type_id is null then
  raise exception 'Seleccione una visita y un tipo de muestra válidos';
 end if;
 if p_collection_at is null or p_received_at is null
   or p_received_at < p_collection_at then
  raise exception 'La recepción no puede ser anterior a la toma';
 end if;
 if p_collection_at>now()+interval '5 minutes'
   or p_received_at>now()+interval '5 minutes' then
  raise exception 'No se permiten fechas futuras de toma o recepción';
 end if;
 if p_container_count is null or p_container_count<1 or p_container_count>10000 then
  raise exception 'La cantidad de recipientes debe ser un entero entre 1 y 10000';
 end if;
 if length(coalesce(p_notes,''))>4000 then raise exception 'Observaciones demasiado extensas'; end if;
 select * into v_sample from public.clinical_samples
  where id=p_sample_id and workspace_id=p_workspace_id for update;
 if not found then raise exception 'No existe la muestra en el espacio de trabajo'; end if;
 if v_sample.deleted_at is not null then raise exception 'Esta muestra ya fue eliminada'; end if;
 if v_sample.workflow_status not in ('REGISTRADO','EN_REVISION') then
  raise exception 'La muestra ya fue aprobada o procesada. No puede modificarse desde revisión';
 end if;
 if p_expected_updated_at is not null and v_sample.updated_at is distinct from p_expected_updated_at then
  raise exception 'La muestra fue modificada en otro dispositivo. Actualiza la ficha antes de guardar';
 end if;
 if not exists(
  select 1 from public.clinical_visits v
  where v.id=p_visit_id and v.workspace_id=p_workspace_id
    and v.study_id=v_sample.study_id and v.active
 ) then raise exception 'La visita no está activa o no pertenece al estudio'; end if;
 select * into v_type from public.clinical_sample_types t
 where t.id=p_sample_type_id and t.workspace_id=p_workspace_id
   and t.study_id=v_sample.study_id and t.active;
 if not found then raise exception 'El tipo de muestra no está activo o no pertenece al estudio'; end if;
 if v_type.expected_containers is not null and p_container_count<>v_type.expected_containers then
  raise exception 'Cantidad de recipientes incorrecta para el protocolo. Esperados: %',v_type.expected_containers;
 end if;
 if p_container_count<>v_sample.container_count and exists(
  select 1 from public.clinical_sample_containers c
  where c.workspace_id=p_workspace_id and c.sample_id=p_sample_id
 ) then raise exception 'No es posible cambiar recipientes después de registrar tubos individuales'; end if;
 if exists(
  select 1 from public.clinical_samples s
  where s.workspace_id=p_workspace_id and s.id<>p_sample_id
    and s.deleted_at is null and s.study_id=v_sample.study_id
    and lower(btrim(s.subject_code))=lower(v_subject)
    and s.visit_id=p_visit_id and s.sample_type_id=p_sample_type_id
    and s.collection_at=p_collection_at
 ) then raise exception 'Ya existe otra muestra con el mismo sujeto, estudio, visita, tipo y hora de toma'; end if;
 v_has_changes:=
   v_sample.subject_code is distinct from v_subject
   or v_sample.visit_id is distinct from p_visit_id
   or v_sample.sample_type_id is distinct from p_sample_type_id
   or v_sample.collection_at is distinct from p_collection_at
   or v_sample.received_at is distinct from p_received_at
   or v_sample.container_count is distinct from p_container_count
   or v_sample.notes is distinct from v_notes;
 if not v_has_changes then raise exception 'No hay cambios que guardar'; end if;
 select coalesce(p.display_name,'Usuario autorizado') into v_actor_name
 from public.profiles p where p.user_id=v_actor;
 update public.clinical_samples
 set subject_code=v_subject,visit_id=p_visit_id,sample_type_id=p_sample_type_id,
  collection_at=p_collection_at,received_at=p_received_at,
  container_count=p_container_count,notes=v_notes,
  coagulation_enabled=case when v_sample.sample_type_id is distinct from p_sample_type_id then v_type.coagulation_enabled else coagulation_enabled end,
  coagulation_min_minutes=case when v_sample.sample_type_id is distinct from p_sample_type_id then v_type.coagulation_min_minutes else coagulation_min_minutes end,
  coagulation_max_minutes=case when v_sample.sample_type_id is distinct from p_sample_type_id then v_type.coagulation_max_minutes else coagulation_max_minutes end,
  coagulation_alert_before_minutes=case when v_sample.sample_type_id is distinct from p_sample_type_id then v_type.coagulation_alert_before_minutes else coagulation_alert_before_minutes end,
  updated_at=now()
 where id=p_sample_id and workspace_id=p_workspace_id
 returning updated_at into v_updated_at;
 insert into public.clinical_sample_events
  (workspace_id,sample_id,previous_status,next_status,notes,actor_id,occurred_at)
 values(p_workspace_id,p_sample_id,v_sample.workflow_status,v_sample.workflow_status,
  'Corrección antes de aprobación: '||v_reason,v_actor,now());
 insert into public.audit_logs
  (workspace_id,actor_id,actor_name,entity_table,entity_id,action,changed_fields,occurred_at,details)
 values(p_workspace_id,v_actor,coalesce(v_actor_name,'Usuario autorizado'),'clinical_samples',p_sample_id,
  'sample_review_corrected',
  array['subject_code','visit_id','sample_type_id','collection_at','received_at','container_count','notes','updated_at'],
  now(),jsonb_build_object(
   'reason',v_reason,'workflow_status_preserved',v_sample.workflow_status,
   'before',jsonb_build_object('subject_code',v_sample.subject_code,'visit_id',v_sample.visit_id,
    'sample_type_id',v_sample.sample_type_id,'collection_at',v_sample.collection_at,
    'received_at',v_sample.received_at,'container_count',v_sample.container_count,'notes',v_sample.notes),
   'after',jsonb_build_object('subject_code',v_subject,'visit_id',p_visit_id,
    'sample_type_id',p_sample_type_id,'collection_at',p_collection_at,
    'received_at',p_received_at,'container_count',p_container_count,'notes',v_notes)));
 return jsonb_build_object('ok',true,'sample_id',p_sample_id,
  'status',v_sample.workflow_status,'updated_at',v_updated_at);
end;
$fn$;

revoke all on function public.clinical_review_edit_permission(uuid) from public,anon;
grant execute on function public.clinical_review_edit_permission(uuid) to authenticated;
revoke all on function public.correct_clinical_sample_in_review(uuid,uuid,text,uuid,uuid,timestamptz,timestamptz,integer,text,text,timestamptz) from public,anon;
grant execute on function public.correct_clinical_sample_in_review(uuid,uuid,text,uuid,uuid,timestamptz,timestamptz,integer,text,text,timestamptz) to authenticated;
commit;
