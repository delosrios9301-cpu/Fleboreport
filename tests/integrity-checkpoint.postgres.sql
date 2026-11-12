-- All synthetic data, isolated PostgreSQL integration test.
\set ON_ERROR_STOP on
create table if not exists public.patients (id uuid primary key default gen_random_uuid(),workspace_id uuid not null);
create table if not exists public.companies (id uuid primary key default gen_random_uuid(),workspace_id uuid not null);
create table if not exists public.journeys (id uuid primary key default gen_random_uuid(),workspace_id uuid not null);
create table if not exists public.attentions (id uuid primary key default gen_random_uuid(),workspace_id uuid not null);
create table if not exists public.reports (id uuid primary key default gen_random_uuid(),workspace_id uuid not null);
create table if not exists public.home_visits (id uuid primary key default gen_random_uuid(),workspace_id uuid not null);
create table if not exists public.home_visit_assignments (id uuid primary key default gen_random_uuid(),workspace_id uuid not null);
create table if not exists public.home_visit_tests (id uuid primary key default gen_random_uuid(),workspace_id uuid not null);
create table if not exists public.home_visit_events (id uuid primary key default gen_random_uuid(),workspace_id uuid not null);
create table if not exists public.clinical_studies (id uuid primary key default gen_random_uuid(),workspace_id uuid not null);
create table if not exists public.clinical_sample_types (id uuid primary key default gen_random_uuid(),workspace_id uuid not null);
create table if not exists public.clinical_samples (id uuid primary key default gen_random_uuid(),workspace_id uuid not null);
create table if not exists public.clinical_sample_events (id uuid primary key default gen_random_uuid(),workspace_id uuid not null);
create table if not exists public.role_permissions (id uuid primary key default gen_random_uuid(),workspace_id uuid not null);
create table if not exists public.member_permissions (id uuid primary key default gen_random_uuid(),workspace_id uuid not null);
create table if not exists public.audit_logs (id uuid primary key default gen_random_uuid(),workspace_id uuid not null);
\echo 'Testing private integrity checkpoint'
\i supabase/migrations/20261112170000_private_integrity_checkpoint.sql
do $audit$
declare checkpoint record;
begin
 select * into checkpoint from private.fleboreport_integrity_checkpoints
 where workspace_id='10000000-0000-0000-0000-000000000001' order by captured_at desc limit 1;
 if checkpoint.id is null then raise exception 'No checkpoint was created'; end if;
 if checkpoint.checksum_md5<>md5(checkpoint.snapshot::text) then
  raise exception 'Snapshot checksum mismatch';
 end if;
 if (checkpoint.summary->>'workspace_members')::int<>4 then
  raise exception 'Snapshot did not preserve synthetic workspace members';
 end if;
 if (checkpoint.summary->>'workspace_shared_app_state')::int<>1 then
  raise exception 'Shared state missing in checkpoint';
 end if;
 if has_table_privilege('authenticated','private.fleboreport_integrity_checkpoints','select')
    or has_table_privilege('anon','private.fleboreport_integrity_checkpoints','select')
    or has_table_privilege('service_role','private.fleboreport_integrity_checkpoints','select') then
   raise exception 'Checkpoint leaked to API roles';
 end if;
end $audit$;
\echo 'OK: private integrity checkpoint and no API access'
