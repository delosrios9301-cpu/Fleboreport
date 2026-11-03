-- Individual boxes can belong directly to a freezer; racks and trays remain optional.
-- Cryovials are stored and transferred independently, including across multiple final boxes/freezers.
begin;
alter table public.clinical_boxes alter column tray_id drop not null;
alter table public.clinical_boxes alter column slot_no drop not null;
alter table public.clinical_boxes add column if not exists freezer_id uuid;
alter table public.clinical_boxes add column if not exists drawer_id uuid;
do $$
begin
 if not exists(select 1 from pg_constraint where conname='clinical_boxes_freezer_scope_fk') then
  alter table public.clinical_boxes add constraint clinical_boxes_freezer_scope_fk foreign key(workspace_id,freezer_id) references public.clinical_freezers(workspace_id,id) on delete restrict;
 end if;
 if not exists(select 1 from pg_constraint where conname='clinical_boxes_drawer_scope_fk') then
  alter table public.clinical_boxes add constraint clinical_boxes_drawer_scope_fk foreign key(workspace_id,drawer_id) references public.clinical_freezer_drawers(workspace_id,id) on delete restrict;
 end if;
end $$;
create index if not exists clinical_boxes_freezer_stage_idx on public.clinical_boxes(workspace_id,freezer_id,storage_stage,active);

create or replace function public.guard_clinical_sample_workflow()
returns trigger language plpgsql set search_path = '' as $$
declare v_expected integer; v_total integer; v_valid integer;
begin
 if tg_op='INSERT' then
  if new.workflow_status<>'REGISTRADO' then raise exception 'Una muestra nueva debe iniciar en REGISTRADO'; end if;
 elsif new.workflow_status is distinct from old.workflow_status then
  if coalesce(current_setting('app.clinical_transition',true),'')<>'on' then raise exception 'El estado de la muestra solo puede cambiar mediante la transición autorizada'; end if;
  if new.workflow_status='CONGELADOR_DEFINITIVO' then
   v_expected:=coalesce(new.primary_aliquots,0)+coalesce(new.backup_aliquots,0);
   select count(*),count(*) filter(where status='Almacenamiento definitivo') into v_total,v_valid
   from public.clinical_cryovials where workspace_id=new.workspace_id and sample_id=new.id;
   if v_expected<1 or v_total<>v_expected or v_valid<>v_expected then raise exception 'No se puede cerrar el almacenamiento: todos los crioviales deben estar ubicados definitivamente'; end if;
  end if;
 end if;
 return new;
end;
$$;

create or replace function public.register_clinical_cryovial(p_workspace_id uuid,p_sample_id uuid,p_barcode text,p_kind text,p_box_id uuid,p_position_no integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_sample public.clinical_samples%rowtype; v_box public.clinical_boxes%rowtype; v_expected integer; v_registered integer; v_id uuid;
begin
 if v_actor is null then raise exception 'Se requiere una sesión autenticada'; end if;
 if not public.has_workspace_role(p_workspace_id,array['admin','technician']) then raise exception 'No tiene permisos para registrar crioviales'; end if;
 if p_barcode is null or length(trim(p_barcode))=0 then raise exception 'El código del criovial es obligatorio'; end if;
 if p_kind not in ('principal','backup') then raise exception 'Tipo de alícuota no válido'; end if;
 select * into v_sample from public.clinical_samples where workspace_id=p_workspace_id and id=p_sample_id for update;
 if not found or v_sample.workflow_status<>'ALMACENAMIENTO_TEMPORAL' then raise exception 'La muestra debe estar en almacenamiento temporal'; end if;
 select * into v_box from public.clinical_boxes where workspace_id=p_workspace_id and id=p_box_id and study_id=v_sample.study_id and storage_stage='temporal' and active for update;
 if not found then raise exception 'La caja temporal no está habilitada para el estudio de esta muestra'; end if;
 v_expected:=case when p_kind='principal' then v_sample.primary_aliquots else v_sample.backup_aliquots end;
 select count(*) into v_registered from public.clinical_cryovials where workspace_id=p_workspace_id and sample_id=p_sample_id and kind=p_kind;
 if v_expected<1 or v_registered>=v_expected then raise exception 'Ya se alcanzó la cantidad prevista de crioviales para esta categoría'; end if;
 if p_position_no is null or p_position_no<1 or p_position_no>v_box.aliquot_capacity then raise exception 'Posición de criovial fuera de capacidad'; end if;
 if exists(select 1 from public.clinical_cryovials where workspace_id=p_workspace_id and lower(barcode)=lower(trim(p_barcode))) then raise exception 'El código del criovial ya existe'; end if;
 if exists(select 1 from public.clinical_cryovials where workspace_id=p_workspace_id and box_id=p_box_id and position_no=p_position_no and status<>'Descartado') then raise exception 'La posición seleccionada ya está ocupada'; end if;
 insert into public.clinical_cryovials(workspace_id,sample_id,barcode,kind,status,box_id,position_no,created_by)
 values(p_workspace_id,p_sample_id,trim(p_barcode),p_kind,'Almacenamiento temporal',p_box_id,p_position_no,v_actor) returning id into v_id;
 insert into public.clinical_cryovial_events(workspace_id,cryovial_id,action,from_box_id,from_position,to_box_id,to_position,actor_id,notes)
 values(p_workspace_id,v_id,'Registro en almacenamiento temporal',null,null,p_box_id,p_position_no,v_actor,'Registro de criovial');
 return jsonb_build_object('ok',true,'cryovial_id',v_id);
end;
$$;

create or replace function public.move_clinical_cryovial_to_definitive(p_workspace_id uuid,p_cryovial_id uuid,p_box_id uuid,p_position_no integer,p_notes text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_vial public.clinical_cryovials%rowtype; v_sample public.clinical_samples%rowtype; v_box public.clinical_boxes%rowtype; v_expected integer; v_total integer; v_final_count integer;
begin
 if v_actor is null then raise exception 'Se requiere una sesión autenticada'; end if;
 if not public.has_workspace_role(p_workspace_id,array['admin','technician']) then raise exception 'No tiene permisos para trasladar crioviales'; end if;
 select * into v_vial from public.clinical_cryovials where workspace_id=p_workspace_id and id=p_cryovial_id for update;
 if not found or v_vial.status<>'Almacenamiento temporal' then raise exception 'El criovial no está en almacenamiento temporal'; end if;
 select * into v_sample from public.clinical_samples where workspace_id=p_workspace_id and id=v_vial.sample_id for update;
 if not found or v_sample.workflow_status<>'ALMACENAMIENTO_TEMPORAL' then raise exception 'La muestra no está habilitada para traslado definitivo'; end if;
 select * into v_box from public.clinical_boxes where workspace_id=p_workspace_id and id=p_box_id and study_id=v_sample.study_id and storage_stage='definitivo' and active for update;
 if not found then raise exception 'La caja definitiva no pertenece al estudio o está inactiva'; end if;
 if p_position_no is null or p_position_no<1 or p_position_no>v_box.aliquot_capacity then raise exception 'Posición de criovial fuera de capacidad'; end if;
 if exists(select 1 from public.clinical_cryovials where workspace_id=p_workspace_id and box_id=p_box_id and position_no=p_position_no and status<>'Descartado') then raise exception 'La posición seleccionada ya está ocupada'; end if;
 update public.clinical_cryovials set status='Almacenamiento definitivo',box_id=p_box_id,position_no=p_position_no,updated_at=now() where workspace_id=p_workspace_id and id=p_cryovial_id;
 insert into public.clinical_cryovial_events(workspace_id,cryovial_id,action,from_box_id,from_position,to_box_id,to_position,actor_id,notes)
 values(p_workspace_id,p_cryovial_id,'Traslado a almacenamiento definitivo',v_vial.box_id,v_vial.position_no,p_box_id,p_position_no,v_actor,p_notes);
 v_expected:=coalesce(v_sample.primary_aliquots,0)+coalesce(v_sample.backup_aliquots,0);
 select count(*),count(*) filter(where status='Almacenamiento definitivo') into v_total,v_final_count from public.clinical_cryovials where workspace_id=p_workspace_id and sample_id=v_sample.id;
 if v_total=v_expected and v_final_count=v_expected then perform public.transition_clinical_sample(v_sample.id,'CONGELADOR_DEFINITIVO','Todos los crioviales trasladados a sus ubicaciones definitivas',null,null,null,null); end if;
 return jsonb_build_object('ok',true,'cryovial_id',p_cryovial_id,'sample_completed',(v_total=v_expected and v_final_count=v_expected));
end;
$$;

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
  if v_sample.patient_id is null then raise exception 'La muestra debe estar vinculada al paciente maestro'; end if;
  if (v_sample.tube_barcode is null or length(trim(v_sample.tube_barcode))=0) and not exists(select 1 from public.clinical_sample_containers c where c.workspace_id=v_sample.workspace_id and c.sample_id=v_sample.id) then raise exception 'Debe registrar al menos un código de tubo o recipiente'; end if;
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
 update public.clinical_samples set workflow_status=p_next_status,status=v_legacy_status,
 reviewed_by=case when p_next_status='PENDIENTE_PROCESO' then v_actor else reviewed_by end,reviewed_at=case when p_next_status='PENDIENTE_PROCESO' then now() else reviewed_at end,
 processing_started_by=case when p_next_status='PROCESANDO' then v_actor else processing_started_by end,processing_started_at=case when p_next_status='PROCESANDO' then now() else processing_started_at end,
 primary_aliquots=case when p_next_status='ALMACENAMIENTO_TEMPORAL' then p_primary_aliquots else primary_aliquots end,backup_aliquots=case when p_next_status='ALMACENAMIENTO_TEMPORAL' then p_backup_aliquots else backup_aliquots end,
 processed_by=case when p_next_status='ALMACENAMIENTO_TEMPORAL' then v_actor else processed_by end,processed_at=case when p_next_status='ALMACENAMIENTO_TEMPORAL' then now() else processed_at end,
 temporary_box_id=case when p_next_status='ALMACENAMIENTO_TEMPORAL' then null else temporary_box_id end,definitive_box_id=case when p_next_status='CONGELADOR_DEFINITIVO' then null else definitive_box_id end,
 stored_by=case when p_next_status='CONGELADOR_DEFINITIVO' then v_actor else stored_by end,stored_at=case when p_next_status='CONGELADOR_DEFINITIVO' then now() else stored_at end,updated_at=now(),
 notes=case when p_notes is not null and length(trim(p_notes))>0 then concat_ws(E'\n',nullif(notes,''),p_notes) else notes end where id=p_sample_id;
 insert into public.clinical_sample_events(workspace_id,sample_id,previous_status,next_status,notes,actor_id,occurred_at) values(v_sample.workspace_id,v_sample.id,v_old_status,p_next_status,p_notes,v_actor,now());
 select coalesce(p.display_name,'') into v_actor_name from public.profiles p where p.user_id=v_actor;
 insert into public.audit_logs(workspace_id,actor_id,actor_name,entity_table,entity_id,action,changed_fields,occurred_at,details) values(v_sample.workspace_id,v_actor,coalesce(v_actor_name,''),'clinical_samples',v_sample.id,'workflow_transition',array['workflow_status','status','updated_at'],now(),jsonb_build_object('from',v_old_status,'to',p_next_status,'notes',p_notes));
 return jsonb_build_object('ok',true,'sample_id',v_sample.id,'previous_status',v_old_status,'status',p_next_status);
end;
$$;
revoke all on function public.register_clinical_cryovial(uuid,uuid,text,text,uuid,integer) from public;
grant execute on function public.register_clinical_cryovial(uuid,uuid,text,text,uuid,integer) to authenticated;
revoke all on function public.move_clinical_cryovial_to_definitive(uuid,uuid,uuid,integer,text) from public;
grant execute on function public.move_clinical_cryovial_to_definitive(uuid,uuid,uuid,integer,text) to authenticated;
commit;
