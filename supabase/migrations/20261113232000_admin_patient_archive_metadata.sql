-- V326, fase 1: archivado seguro y permanente (sin borrado físico).
alter table public.patients add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id);
create index if not exists patients_archived_per_workspace_idx on public.patients(workspace_id,archived_at)
 where archived_at is not null;
-- Esta misma migración se aplicó a Supabase. La protección compartida rechaza
-- eliminaciones sin rol admin y elimina cualquier intento de resurrección.
-- Funciones actuales del servidor: private.protect_archived_workspace_patients,
-- public.archive_workspace_patient, private.guard_patient_archive_columns.
-- Sus definiciones completas se conservan en la base de datos mediante
-- migraciones Supabase admin_patient_archive_swipe_guard y admin_only_patient_archive_column_guard.
