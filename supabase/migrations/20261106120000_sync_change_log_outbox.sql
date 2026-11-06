-- Registro incremental de cambios por espacio de trabajo.
-- No almacena datos clínicos ni domicilios: solo entidad, UUID, operación y cursor.
create table if not exists public.sync_change_log (
  seq bigint generated always as identity primary key,
  workspace_id uuid not null,
  entity text not null check (entity in ('domiciles','clinical_samples')),
  record_id uuid not null,
  operation text not null check (operation in ('INSERT','UPDATE','DELETE')),
  actor_id uuid,
  changed_at timestamptz not null default clock_timestamp()
);

create index if not exists sync_change_log_workspace_seq_idx
  on public.sync_change_log (workspace_id, seq);

alter table public.sync_change_log enable row level security;

revoke all on table public.sync_change_log from anon, public;
grant select on table public.sync_change_log to authenticated;

drop policy if exists sync_change_log_read_scoped on public.sync_change_log;
create policy sync_change_log_read_scoped
on public.sync_change_log
for select
to authenticated
using (
  (
    entity = 'domiciles'
    and public.is_workspace_member(workspace_id)
    and private.has_workspace_permission(workspace_id, 'domicilios', 'view')
    and (
      private.has_workspace_permission(workspace_id, 'domicilios', 'manage')
      or public.is_current_home_visit_assignee(
        workspace_id,
        record_id,
        (select auth.uid()),
        array['invited'::text, 'accepted'::text, 'rejected'::text]
      )
    )
  )
  or
  (
    entity = 'clinical_samples'
    and public.has_workspace_role(
      workspace_id,
      array['admin'::text, 'clinician'::text, 'technician'::text, 'reception'::text]
    )
  )
);

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

drop trigger if exists sync_change_log_home_visits on public.home_visits;
create trigger sync_change_log_home_visits
after insert or update or delete on public.home_visits
for each row execute function public.capture_sync_change();

drop trigger if exists sync_change_log_home_visit_tests on public.home_visit_tests;
create trigger sync_change_log_home_visit_tests
after insert or update or delete on public.home_visit_tests
for each row execute function public.capture_sync_change();

drop trigger if exists sync_change_log_home_visit_assignments on public.home_visit_assignments;
create trigger sync_change_log_home_visit_assignments
after insert or update or delete on public.home_visit_assignments
for each row execute function public.capture_sync_change();

drop trigger if exists sync_change_log_home_visit_events on public.home_visit_events;
create trigger sync_change_log_home_visit_events
after insert or update or delete on public.home_visit_events
for each row execute function public.capture_sync_change();

drop trigger if exists sync_change_log_home_visit_documents on public.home_visit_documents;
create trigger sync_change_log_home_visit_documents
after insert or update or delete on public.home_visit_documents
for each row execute function public.capture_sync_change();

drop trigger if exists sync_change_log_home_visit_additional_patients on public.home_visit_additional_patients;
create trigger sync_change_log_home_visit_additional_patients
after insert or update or delete on public.home_visit_additional_patients
for each row execute function public.capture_sync_change();

drop trigger if exists sync_change_log_clinical_samples on public.clinical_samples;
create trigger sync_change_log_clinical_samples
after insert or update or delete on public.clinical_samples
for each row execute function public.capture_sync_change();

drop trigger if exists sync_change_log_clinical_sample_containers on public.clinical_sample_containers;
create trigger sync_change_log_clinical_sample_containers
after insert or update or delete on public.clinical_sample_containers
for each row execute function public.capture_sync_change();

drop trigger if exists sync_change_log_clinical_sample_events on public.clinical_sample_events;
create trigger sync_change_log_clinical_sample_events
after insert or update or delete on public.clinical_sample_events
for each row execute function public.capture_sync_change();

do $publication$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'sync_change_log'
     ) then
    alter publication supabase_realtime add table public.sync_change_log;
  end if;
end
$publication$;
