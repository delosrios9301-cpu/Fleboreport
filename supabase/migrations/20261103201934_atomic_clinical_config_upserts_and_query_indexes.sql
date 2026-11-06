
create or replace function public.upsert_clinical_visit_config(
  p_workspace_id uuid,
  p_study_id uuid,
  p_code text,
  p_name text,
  p_sort_order integer,
  p_scheduled_day integer,
  p_active boolean
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  if auth.uid() is null
     or not public.has_workspace_role(p_workspace_id, array['admin']::text[]) then
    raise exception 'No tienes permiso para modificar la configuración clínica';
  end if;
  if p_study_id is null or nullif(btrim(p_code), '') is null or nullif(btrim(p_name), '') is null then
    raise exception 'El estudio, código y nombre de la visita son obligatorios';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'clinical_visits:' || p_workspace_id::text || ':' || p_study_id::text || ':' || lower(btrim(p_code)), 0
  ));

  select v.id into v_id
  from public.clinical_visits v
  where v.workspace_id = p_workspace_id
    and v.study_id = p_study_id
    and lower(btrim(v.code)) = lower(btrim(p_code))
  order by v.id
  limit 1
  for update;

  if v_id is null then
    insert into public.clinical_visits(workspace_id, study_id, code, name, sort_order, scheduled_day, active)
    values (p_workspace_id, p_study_id, btrim(p_code), btrim(p_name), coalesce(p_sort_order, 0), p_scheduled_day, coalesce(p_active, true))
    returning id into v_id;
  else
    update public.clinical_visits
    set code = btrim(p_code),
        name = btrim(p_name),
        sort_order = coalesce(p_sort_order, 0),
        scheduled_day = p_scheduled_day,
        active = coalesce(p_active, true)
    where id = v_id and workspace_id = p_workspace_id;
  end if;
  return v_id;
end;
$function$;

create or replace function public.upsert_clinical_sample_type_config(
  p_workspace_id uuid,
  p_study_id uuid,
  p_code text,
  p_name text,
  p_tube text,
  p_volume text,
  p_processing_protocol text,
  p_color text,
  p_marking text,
  p_expected_containers integer,
  p_expected_primary_aliquots integer,
  p_expected_backup_aliquots integer,
  p_description text,
  p_active boolean
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  if auth.uid() is null
     or not public.has_workspace_role(p_workspace_id, array['admin']::text[]) then
    raise exception 'No tienes permiso para modificar la configuración clínica';
  end if;
  if p_study_id is null or nullif(btrim(p_code), '') is null or nullif(btrim(p_name), '') is null then
    raise exception 'El estudio, código y nombre del tipo de muestra son obligatorios';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'clinical_sample_types:' || p_workspace_id::text || ':' || p_study_id::text || ':' || lower(btrim(p_code)), 0
  ));

  select t.id into v_id
  from public.clinical_sample_types t
  where t.workspace_id = p_workspace_id
    and t.study_id = p_study_id
    and lower(btrim(t.code)) = lower(btrim(p_code))
  order by t.id
  limit 1
  for update;

  if v_id is null then
    insert into public.clinical_sample_types(
      workspace_id, study_id, code, name, tube, volume, processing_protocol, color, marking,
      expected_containers, expected_primary_aliquots, expected_backup_aliquots, description, active
    )
    values (
      p_workspace_id, p_study_id, btrim(p_code), btrim(p_name), p_tube, p_volume, p_processing_protocol, p_color, p_marking,
      p_expected_containers, p_expected_primary_aliquots, p_expected_backup_aliquots, p_description, coalesce(p_active, true)
    )
    returning id into v_id;
  else
    update public.clinical_sample_types
    set code = btrim(p_code),
        name = btrim(p_name),
        tube = p_tube,
        volume = p_volume,
        processing_protocol = p_processing_protocol,
        color = p_color,
        marking = p_marking,
        expected_containers = p_expected_containers,
        expected_primary_aliquots = p_expected_primary_aliquots,
        expected_backup_aliquots = p_expected_backup_aliquots,
        description = p_description,
        active = coalesce(p_active, true)
    where id = v_id and workspace_id = p_workspace_id;
  end if;
  return v_id;
end;
$function$;

revoke all on function public.upsert_clinical_visit_config(uuid, uuid, text, text, integer, integer, boolean) from public;
revoke all on function public.upsert_clinical_sample_type_config(uuid, uuid, text, text, text, text, text, text, text, integer, integer, integer, text, boolean) from public;
grant execute on function public.upsert_clinical_visit_config(uuid, uuid, text, text, integer, integer, boolean) to authenticated;
grant execute on function public.upsert_clinical_sample_type_config(uuid, uuid, text, text, text, text, text, text, text, integer, integer, integer, text, boolean) to authenticated;

create index if not exists clinical_visits_workspace_study_code_idx
  on public.clinical_visits(workspace_id, study_id, code);
create index if not exists clinical_sample_types_workspace_study_code_idx
  on public.clinical_sample_types(workspace_id, study_id, code);
create index if not exists clinical_racks_workspace_drawer_name_idx
  on public.clinical_racks(workspace_id, drawer_id, name);
create index if not exists clinical_rack_trays_workspace_rack_tray_idx
  on public.clinical_rack_trays(workspace_id, rack_id, tray_no);
create index if not exists clinical_sample_containers_workspace_sample_idx
  on public.clinical_sample_containers(workspace_id, sample_id);
create index if not exists clinical_sample_events_workspace_sample_time_idx
  on public.clinical_sample_events(workspace_id, sample_id, occurred_at desc);
create index if not exists clinical_cryovial_events_workspace_cryovial_time_idx
  on public.clinical_cryovial_events(workspace_id, cryovial_id, occurred_at desc);
