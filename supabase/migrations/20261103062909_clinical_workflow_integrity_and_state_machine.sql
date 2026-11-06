
begin;

-- Patient master relationship, scoped to the same workspace.
create unique index if not exists patients_workspace_id_id_uidx
  on public.patients(workspace_id, id);

alter table public.clinical_samples
  add column if not exists patient_id uuid,
  add column if not exists workflow_status text not null default 'REGISTRADO',
  add column if not exists tube_barcode text,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists processing_started_by uuid,
  add column if not exists processing_started_at timestamptz,
  add column if not exists temporary_box_id uuid,
  add column if not exists definitive_box_id uuid,
  add column if not exists stored_by uuid,
  add column if not exists stored_at timestamptz;

alter table public.clinical_samples
  add constraint clinical_samples_workflow_status_check
  check (workflow_status in ('REGISTRADO','EN_REVISION','PENDIENTE_PROCESO','PROCESANDO','ALMACENAMIENTO_TEMPORAL','CONGELADOR_DEFINITIVO'));

alter table public.clinical_samples
  add constraint clinical_samples_workspace_patient_fk
  foreign key (workspace_id, patient_id)
  references public.patients(workspace_id, id);

alter table public.clinical_samples
  add constraint clinical_samples_reviewed_by_fk
  foreign key (reviewed_by) references auth.users(id);

alter table public.clinical_samples
  add constraint clinical_samples_processing_started_by_fk
  foreign key (processing_started_by) references auth.users(id);

alter table public.clinical_samples
  add constraint clinical_samples_stored_by_fk
  foreign key (stored_by) references auth.users(id);

alter table public.clinical_samples
  add constraint clinical_samples_workspace_temporary_box_fk
  foreign key (workspace_id, temporary_box_id)
  references public.clinical_boxes(workspace_id, id);

alter table public.clinical_samples
  add constraint clinical_samples_workspace_definitive_box_fk
  foreign key (workspace_id, definitive_box_id)
  references public.clinical_boxes(workspace_id, id);

alter table public.clinical_samples
  add constraint clinical_samples_aliquot_counts_nonnegative
  check (primary_aliquots >= 0 and backup_aliquots >= 0);

alter table public.clinical_boxes
  add column if not exists study_id uuid,
  add column if not exists box_type text,
  add column if not exists created_by uuid,
  add column if not exists updated_at timestamptz not null default now();

alter table public.clinical_boxes
  add constraint clinical_boxes_workspace_study_fk
  foreign key (workspace_id, study_id)
  references public.clinical_studies(workspace_id, id);

alter table public.clinical_boxes
  add constraint clinical_boxes_created_by_fk
  foreign key (created_by) references auth.users(id);

alter table public.clinical_boxes
  add constraint clinical_boxes_type_check
  check (box_type is null or box_type in ('gradilla','caja_temporal','caja_definitiva'));

create unique index if not exists clinical_boxes_study_stage_code_uidx
  on public.clinical_boxes(workspace_id, study_id, storage_stage, lower(box_code))
  where study_id is not null;

create index if not exists clinical_samples_workflow_queue_idx
  on public.clinical_samples(workspace_id, workflow_status, received_at desc);

create index if not exists clinical_samples_study_status_idx
  on public.clinical_samples(workspace_id, study_id, workflow_status);

create index if not exists clinical_boxes_study_stage_active_idx
  on public.clinical_boxes(workspace_id, study_id, storage_stage, active);

create table if not exists public.clinical_sample_containers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sample_id uuid not null,
  barcode text not null,
  container_type text not null default 'tubo',
  tube_color text,
  marking text,
  collected_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint clinical_sample_containers_sample_fk
    foreign key (workspace_id, sample_id)
    references public.clinical_samples(workspace_id, id) on delete cascade,
  constraint clinical_sample_containers_type_check
    check (container_type in ('tubo','recipiente','otro')),
  constraint clinical_sample_containers_barcode_nonempty
    check (length(trim(barcode)) > 0),
  constraint clinical_sample_containers_workspace_barcode_uidx
    unique (workspace_id, barcode)
);

create index if not exists clinical_sample_containers_sample_idx
  on public.clinical_sample_containers(workspace_id, sample_id);

alter table public.clinical_sample_containers enable row level security;

drop policy if exists clinical_sample_containers_read on public.clinical_sample_containers;
create policy clinical_sample_containers_read on public.clinical_sample_containers
for select to authenticated
using (public.has_workspace_role(workspace_id, array['admin','clinician','technician','reception']));

drop policy if exists clinical_sample_containers_insert on public.clinical_sample_containers;
create policy clinical_sample_containers_insert on public.clinical_sample_containers
for insert to authenticated
with check (public.has_workspace_role(workspace_id, array['admin','clinician','reception']));

drop policy if exists clinical_sample_containers_update on public.clinical_sample_containers;
create policy clinical_sample_containers_update on public.clinical_sample_containers
for update to authenticated
using (public.has_workspace_role(workspace_id, array['admin','clinician','reception']))
with check (public.has_workspace_role(workspace_id, array['admin','clinician','reception']));

drop policy if exists clinical_sample_containers_delete on public.clinical_sample_containers;
create policy clinical_sample_containers_delete on public.clinical_sample_containers
for delete to authenticated
using (public.has_workspace_role(workspace_id, array['admin']));

-- Operational staff need read-only access to the study configuration and sample queue.
drop policy if exists workspace_read on public.clinical_studies;
create policy workspace_read on public.clinical_studies
for select to authenticated
using (public.has_workspace_role(workspace_id, array['admin','clinician','technician','reception']));

drop policy if exists workspace_read on public.clinical_visits;
create policy workspace_read on public.clinical_visits
for select to authenticated
using (public.has_workspace_role(workspace_id, array['admin','clinician','technician','reception']));

drop policy if exists workspace_read on public.clinical_sample_types;
create policy workspace_read on public.clinical_sample_types
for select to authenticated
using (public.has_workspace_role(workspace_id, array['admin','clinician','technician','reception']));

drop policy if exists workspace_read on public.clinical_boxes;
create policy workspace_read on public.clinical_boxes
for select to authenticated
using (public.has_workspace_role(workspace_id, array['admin','clinician','technician','reception']));

drop policy if exists workspace_read on public.clinical_samples;
create policy workspace_read on public.clinical_samples
for select to authenticated
using (public.has_workspace_role(workspace_id, array['admin','clinician','technician','reception']));

drop policy if exists workspace_read on public.clinical_sample_events;
create policy workspace_read on public.clinical_sample_events
for select to authenticated
using (public.has_workspace_role(workspace_id, array['admin','clinician','technician','reception']));

drop policy if exists workspace_read on public.clinical_cryovials;
create policy workspace_read on public.clinical_cryovials
for select to authenticated
using (public.has_workspace_role(workspace_id, array['admin','clinician','technician','reception']));

drop policy if exists workspace_read on public.clinical_cryovial_events;
create policy workspace_read on public.clinical_cryovial_events
for select to authenticated
using (public.has_workspace_role(workspace_id, array['admin','clinician','technician','reception']));

create or replace function public.guard_clinical_sample_workflow()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.workflow_status <> 'REGISTRADO' then
      raise exception 'Una muestra nueva debe iniciar en REGISTRADO';
    end if;
  elsif new.workflow_status is distinct from old.workflow_status then
    if coalesce(current_setting('app.clinical_transition', true), '') <> 'on' then
      raise exception 'El estado de la muestra solo puede cambiar mediante la transición autorizada';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_clinical_sample_workflow on public.clinical_samples;
create trigger trg_guard_clinical_sample_workflow
before insert or update of workflow_status on public.clinical_samples
for each row execute function public.guard_clinical_sample_workflow();

create or replace function public.log_clinical_sample_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.clinical_sample_events
    (workspace_id, sample_id, previous_status, next_status, notes, actor_id, occurred_at)
  values
    (new.workspace_id, new.id, null, 'REGISTRADO', 'Registro inicial de la muestra', coalesce(auth.uid(), new.created_by), now());
  return new;
end;
$$;

drop trigger if exists trg_log_clinical_sample_created on public.clinical_samples;
create trigger trg_log_clinical_sample_created
after insert on public.clinical_samples
for each row execute function public.log_clinical_sample_created();

create or replace function public.prevent_clinical_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'El historial de trazabilidad es inmutable; registre un nuevo evento en lugar de modificarlo o eliminarlo';
end;
$$;

drop trigger if exists trg_clinical_sample_events_immutable on public.clinical_sample_events;
create trigger trg_clinical_sample_events_immutable
before update or delete on public.clinical_sample_events
for each row execute function public.prevent_clinical_event_mutation();

drop trigger if exists trg_clinical_cryovial_events_immutable on public.clinical_cryovial_events;
create trigger trg_clinical_cryovial_events_immutable
before update or delete on public.clinical_cryovial_events
for each row execute function public.prevent_clinical_event_mutation();

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
  v_actor uuid := auth.uid();
  v_allowed text[];
  v_old_status text;
  v_legacy_status text;
  v_required_capacity integer;
  v_used_capacity integer;
  v_box public.clinical_boxes%rowtype;
  v_actor_name text;
begin
  if v_actor is null then
    raise exception 'Se requiere una sesión autenticada';
  end if;

  select * into v_sample
  from public.clinical_samples
  where id = p_sample_id
  for update;

  if not found then
    raise exception 'Muestra no encontrada';
  end if;

  v_old_status := v_sample.workflow_status;

  if p_next_status not in ('EN_REVISION','PENDIENTE_PROCESO','PROCESANDO','ALMACENAMIENTO_TEMPORAL','CONGELADOR_DEFINITIVO') then
    raise exception 'Estado de destino no permitido';
  end if;

  if p_next_status = 'EN_REVISION' and v_old_status = 'REGISTRADO' then
    v_allowed := array['admin','clinician','reception'];
  elsif p_next_status = 'PENDIENTE_PROCESO' and v_old_status = 'EN_REVISION' then
    v_allowed := array['admin','clinician','reception'];
    if v_sample.patient_id is null then raise exception 'La muestra debe estar vinculada al paciente maestro'; end if;
    if v_sample.tube_barcode is null or length(trim(v_sample.tube_barcode)) = 0 then
      if not exists (select 1 from public.clinical_sample_containers c where c.workspace_id=v_sample.workspace_id and c.sample_id=v_sample.id) then
        raise exception 'Debe registrar al menos un código de tubo o recipiente';
      end if;
    end if;
    if v_sample.study_id is null or v_sample.visit_id is null or v_sample.sample_type_id is null or v_sample.collection_at is null or v_sample.received_at is null then
      raise exception 'Faltan datos obligatorios de estudio, visita, tipo de muestra o fechas';
    end if;
    if not exists (select 1 from public.clinical_visits v where v.workspace_id=v_sample.workspace_id and v.id=v_sample.visit_id and v.study_id=v_sample.study_id and v.active) then
      raise exception 'La visita no pertenece al estudio o está inactiva';
    end if;
    if not exists (select 1 from public.clinical_sample_types t where t.workspace_id=v_sample.workspace_id and t.id=v_sample.sample_type_id and t.study_id=v_sample.study_id and t.active) then
      raise exception 'El tipo de muestra no pertenece al estudio o está inactivo';
    end if;
  elsif p_next_status = 'PROCESANDO' and v_old_status = 'PENDIENTE_PROCESO' then
    v_allowed := array['admin','technician'];
  elsif p_next_status = 'ALMACENAMIENTO_TEMPORAL' and v_old_status = 'PROCESANDO' then
    v_allowed := array['admin','technician'];
    if p_primary_aliquots is null or p_backup_aliquots is null or p_primary_aliquots < 0 or p_backup_aliquots < 0 or (p_primary_aliquots + p_backup_aliquots) < 1 then
      raise exception 'Indique cantidades válidas de crioviales principal y backup; el total debe ser mayor que cero';
    end if;
    if p_temporary_box_id is null then raise exception 'Debe seleccionar una caja temporal'; end if;
    select * into v_box from public.clinical_boxes b
    where b.workspace_id=v_sample.workspace_id and b.id=p_temporary_box_id
      and b.study_id=v_sample.study_id and b.storage_stage='temporal'
      and b.active and (b.box_type is null or b.box_type in ('gradilla','caja_temporal'))
    for update;
    if not found then raise exception 'La caja temporal no está habilitada para el estudio de esta muestra'; end if;
    v_required_capacity := p_primary_aliquots + p_backup_aliquots;
    select coalesce(sum(s.primary_aliquots+s.backup_aliquots),0) into v_used_capacity
    from public.clinical_samples s
    where s.workspace_id=v_sample.workspace_id and s.temporary_box_id=p_temporary_box_id
      and s.workflow_status='ALMACENAMIENTO_TEMPORAL' and s.id<>v_sample.id;
    if v_used_capacity + v_required_capacity > v_box.aliquot_capacity then
      raise exception 'Capacidad insuficiente en la caja temporal. Disponible: %', v_box.aliquot_capacity-v_used_capacity;
    end if;
  elsif p_next_status = 'CONGELADOR_DEFINITIVO' and v_old_status = 'ALMACENAMIENTO_TEMPORAL' then
    v_allowed := array['admin','technician'];
    if p_definitive_box_id is null then raise exception 'Debe seleccionar una caja definitiva'; end if;
    select * into v_box from public.clinical_boxes b
    where b.workspace_id=v_sample.workspace_id and b.id=p_definitive_box_id
      and b.study_id=v_sample.study_id and b.storage_stage='definitivo'
      and b.active and (b.box_type is null or b.box_type='caja_definitiva')
    for update;
    if not found then raise exception 'La caja definitiva no está habilitada para el estudio de esta muestra'; end if;
    v_required_capacity := v_sample.primary_aliquots + v_sample.backup_aliquots;
    select coalesce(sum(s.primary_aliquots+s.backup_aliquots),0) into v_used_capacity
    from public.clinical_samples s
    where s.workspace_id=v_sample.workspace_id and s.definitive_box_id=p_definitive_box_id
      and s.workflow_status='CONGELADOR_DEFINITIVO' and s.id<>v_sample.id;
    if v_used_capacity + v_required_capacity > v_box.aliquot_capacity then
      raise exception 'Capacidad insuficiente en la caja definitiva. Disponible: %', v_box.aliquot_capacity-v_used_capacity;
    end if;
  else
    raise exception 'Transición inválida: % -> %', v_old_status, p_next_status;
  end if;

  if not public.has_workspace_role(v_sample.workspace_id, v_allowed) then
    raise exception 'No tiene permisos para ejecutar esta transición';
  end if;

  perform pg_catalog.set_config('app.clinical_transition','on',true);

  v_legacy_status := case p_next_status
    when 'EN_REVISION' then 'En revisión'
    when 'PENDIENTE_PROCESO' then 'Pendiente de procesamiento'
    when 'PROCESANDO' then 'Pendiente de procesamiento'
    when 'ALMACENAMIENTO_TEMPORAL' then 'Procesada'
    when 'CONGELADOR_DEFINITIVO' then 'Almacenada'
  end;

  update public.clinical_samples
  set workflow_status=p_next_status,
      status=v_legacy_status,
      reviewed_by=case when p_next_status='PENDIENTE_PROCESO' then v_actor else reviewed_by end,
      reviewed_at=case when p_next_status='PENDIENTE_PROCESO' then now() else reviewed_at end,
      processing_started_by=case when p_next_status='PROCESANDO' then v_actor else processing_started_by end,
      processing_started_at=case when p_next_status='PROCESANDO' then now() else processing_started_at end,
      primary_aliquots=case when p_next_status='ALMACENAMIENTO_TEMPORAL' then p_primary_aliquots else primary_aliquots end,
      backup_aliquots=case when p_next_status='ALMACENAMIENTO_TEMPORAL' then p_backup_aliquots else backup_aliquots end,
      processed_by=case when p_next_status='ALMACENAMIENTO_TEMPORAL' then v_actor else processed_by end,
      processed_at=case when p_next_status='ALMACENAMIENTO_TEMPORAL' then now() else processed_at end,
      temporary_box_id=case when p_next_status='ALMACENAMIENTO_TEMPORAL' then p_temporary_box_id else temporary_box_id end,
      definitive_box_id=case when p_next_status='CONGELADOR_DEFINITIVO' then p_definitive_box_id else definitive_box_id end,
      stored_by=case when p_next_status='CONGELADOR_DEFINITIVO' then v_actor else stored_by end,
      stored_at=case when p_next_status='CONGELADOR_DEFINITIVO' then now() else stored_at end,
      updated_at=now(),
      notes=case when p_notes is not null and length(trim(p_notes))>0 then concat_ws(E'\n',nullif(notes,''),p_notes) else notes end
  where id=p_sample_id;

  insert into public.clinical_sample_events
    (workspace_id,sample_id,previous_status,next_status,notes,actor_id,occurred_at)
  values
    (v_sample.workspace_id,v_sample.id,v_old_status,p_next_status,p_notes,v_actor,now());

  select coalesce(p.display_name,'') into v_actor_name
  from public.profiles p where p.user_id=v_actor;

  insert into public.audit_logs
    (workspace_id,actor_id,actor_name,entity_table,entity_id,action,changed_fields,occurred_at,details)
  values
    (v_sample.workspace_id,v_actor,coalesce(v_actor_name,''),'clinical_samples',v_sample.id,
     'workflow_transition',array['workflow_status','status','updated_at'],
     now(),jsonb_build_object('from',v_old_status,'to',p_next_status,'notes',p_notes));

  return jsonb_build_object('ok',true,'sample_id',v_sample.id,'previous_status',v_old_status,'status',p_next_status);
end;
$$;

revoke all on function public.transition_clinical_sample(uuid,text,text,integer,integer,uuid,uuid) from public;
grant execute on function public.transition_clinical_sample(uuid,text,text,integer,integer,uuid,uuid) to authenticated;

commit;
