-- Private non-destructive recovery checkpoint before clinical security hardening.
-- No production rows are modified or deleted by this migration.
-- This is a same-database checkpoint, NOT an independent/offsite backup.
create table if not exists private.fleboreport_integrity_checkpoints (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  captured_at timestamptz not null default now(),
  source_commit text not null,
  source_revision integer not null,
  snapshot jsonb not null,
  summary jsonb not null,
  checksum_md5 text not null
);
create index if not exists fleboreport_integrity_checkpoints_recent_idx
  on private.fleboreport_integrity_checkpoints(workspace_id,captured_at desc);
revoke all on table private.fleboreport_integrity_checkpoints
  from public,anon,authenticated,service_role;

with workspace_capture as (
  select s.workspace_id, s.revision,
    jsonb_build_object(
    'workspace_shared_app_state', coalesce((select jsonb_agg(to_jsonb(t)) from public.workspace_shared_app_state t where t.workspace_id=s.workspace_id),'[]'::jsonb),
    'workspace_app_state', coalesce((select jsonb_agg(to_jsonb(t)) from public.workspace_app_state t where t.workspace_id=s.workspace_id),'[]'::jsonb),
    'patients', coalesce((select jsonb_agg(to_jsonb(t)) from public.patients t where t.workspace_id=s.workspace_id),'[]'::jsonb),
    'companies', coalesce((select jsonb_agg(to_jsonb(t)) from public.companies t where t.workspace_id=s.workspace_id),'[]'::jsonb),
    'journeys', coalesce((select jsonb_agg(to_jsonb(t)) from public.journeys t where t.workspace_id=s.workspace_id),'[]'::jsonb),
    'attentions', coalesce((select jsonb_agg(to_jsonb(t)) from public.attentions t where t.workspace_id=s.workspace_id),'[]'::jsonb),
    'reports', coalesce((select jsonb_agg(to_jsonb(t)) from public.reports t where t.workspace_id=s.workspace_id),'[]'::jsonb),
    'home_visits', coalesce((select jsonb_agg(to_jsonb(t)) from public.home_visits t where t.workspace_id=s.workspace_id),'[]'::jsonb),
    'home_visit_assignments', coalesce((select jsonb_agg(to_jsonb(t)) from public.home_visit_assignments t where t.workspace_id=s.workspace_id),'[]'::jsonb),
    'home_visit_tests', coalesce((select jsonb_agg(to_jsonb(t)) from public.home_visit_tests t where t.workspace_id=s.workspace_id),'[]'::jsonb),
    'home_visit_events', coalesce((select jsonb_agg(to_jsonb(t)) from public.home_visit_events t where t.workspace_id=s.workspace_id),'[]'::jsonb),
    'clinical_studies', coalesce((select jsonb_agg(to_jsonb(t)) from public.clinical_studies t where t.workspace_id=s.workspace_id),'[]'::jsonb),
    'clinical_sample_types', coalesce((select jsonb_agg(to_jsonb(t)) from public.clinical_sample_types t where t.workspace_id=s.workspace_id),'[]'::jsonb),
    'clinical_samples', coalesce((select jsonb_agg(to_jsonb(t)) from public.clinical_samples t where t.workspace_id=s.workspace_id),'[]'::jsonb),
    'clinical_sample_events', coalesce((select jsonb_agg(to_jsonb(t)) from public.clinical_sample_events t where t.workspace_id=s.workspace_id),'[]'::jsonb),
    'workspace_members', coalesce((select jsonb_agg(to_jsonb(t)) from public.workspace_members t where t.workspace_id=s.workspace_id),'[]'::jsonb),
    'workspace_roles', coalesce((select jsonb_agg(to_jsonb(t)) from public.workspace_roles t where t.workspace_id=s.workspace_id),'[]'::jsonb),
    'workspace_member_roles', coalesce((select jsonb_agg(to_jsonb(t)) from public.workspace_member_roles t where t.workspace_id=s.workspace_id),'[]'::jsonb),
    'role_permissions', coalesce((select jsonb_agg(to_jsonb(t)) from public.role_permissions t where t.workspace_id=s.workspace_id),'[]'::jsonb),
    'member_permissions', coalesce((select jsonb_agg(to_jsonb(t)) from public.member_permissions t where t.workspace_id=s.workspace_id),'[]'::jsonb)
    ) as snapshot
  from public.workspace_shared_app_state s
)
insert into private.fleboreport_integrity_checkpoints
  (workspace_id,source_commit,source_revision,snapshot,summary,checksum_md5)
select c.workspace_id,
  '307a7517757ca65296deb8305de319e03a7ff327',
  c.revision,
  c.snapshot,
  (select jsonb_object_agg(k,jsonb_array_length(v)) from jsonb_each(c.snapshot) as parts(k,v))
    || jsonb_build_object('audit_logs_not_copied', (select count(*) from public.audit_logs a where a.workspace_id=c.workspace_id)),
  md5(c.snapshot::text)
from workspace_capture c
where not exists (
  select 1 from private.fleboreport_integrity_checkpoints previous
  where previous.workspace_id=c.workspace_id
    and previous.source_revision=c.revision
    and previous.checksum_md5=md5(c.snapshot::text)
);
