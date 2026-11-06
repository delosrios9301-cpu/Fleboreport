-- Sequence values become commit-ordered per workspace.
-- The transaction-scoped advisory lock prevents a slow transaction from committing
-- a lower cursor after a later transaction has already advanced a client cursor.
create or replace function public.capture_sync_change()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = 'off'
as $function$
declare
  v_row jsonb;
  v_workspace_id uuid;
  v_record_id uuid;
  v_entity text;
  v_operation text := tg_op;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  v_workspace_id := nullif(v_row ->> 'workspace_id', '')::uuid;

  if tg_table_name = 'home_visits' then
    v_entity := 'domiciles';
    v_record_id := nullif(v_row ->> 'id', '')::uuid;
  elsif tg_table_name in (
    'home_visit_tests',
    'home_visit_assignments',
    'home_visit_events',
    'home_visit_documents',
    'home_visit_additional_patients'
  ) then
    v_entity := 'domiciles';
    v_record_id := nullif(v_row ->> 'home_visit_id', '')::uuid;
  elsif tg_table_name = 'clinical_samples' then
    v_entity := 'clinical_samples';
    v_record_id := nullif(v_row ->> 'id', '')::uuid;
  elsif tg_table_name in ('clinical_sample_containers', 'clinical_sample_events') then
    v_entity := 'clinical_samples';
    v_record_id := nullif(v_row ->> 'sample_id', '')::uuid;
  else
    raise exception 'Tabla no admitida en el registro incremental: %', tg_table_name;
  end if;

  if v_workspace_id is null or v_record_id is null then
    raise exception 'No se pudo determinar el espacio o registro del cambio incremental.';
  end if;

  -- Serialize cursor allocation for a workspace until transaction commit.
  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text, 0));

  insert into public.sync_change_log (
    workspace_id, entity, record_id, operation, actor_id
  ) values (
    v_workspace_id, v_entity, v_record_id, v_operation, (select auth.uid())
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;
revoke all on function public.capture_sync_change() from public, anon, authenticated;
