create table if not exists public.workflow_sla_alerts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity text not null check (entity in ('home_visit','clinical_sample')),
  record_id uuid not null,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  alert_code text not null,
  severity text not null check (severity in ('warning','critical','overdue')),
  due_at timestamptz not null,
  generated_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id),
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint workflow_sla_alerts_once unique (workspace_id,entity,record_id,recipient_user_id,alert_code)
);
create index if not exists workflow_sla_alerts_inbox_idx
  on public.workflow_sla_alerts (workspace_id,recipient_user_id,generated_at desc)
  where resolved_at is null;
alter table public.workflow_sla_alerts enable row level security;
revoke all on public.workflow_sla_alerts from anon;
grant select, update on public.workflow_sla_alerts to authenticated;
drop policy if exists workflow_sla_alerts_read_scoped on public.workflow_sla_alerts;
create policy workflow_sla_alerts_read_scoped on public.workflow_sla_alerts
for select to authenticated
using (
  public.is_workspace_member(workspace_id)
  and (recipient_user_id=(select auth.uid()) or public.has_workspace_role(workspace_id,array['admin','clinician','reception']))
);
drop policy if exists workflow_sla_alerts_ack_own on public.workflow_sla_alerts;
create policy workflow_sla_alerts_ack_own on public.workflow_sla_alerts
for update to authenticated
using (
  public.is_workspace_member(workspace_id)
  and (recipient_user_id=(select auth.uid()) or public.has_workspace_role(workspace_id,array['admin','clinician','reception']))
)
with check (
  public.is_workspace_member(workspace_id)
  and (recipient_user_id=(select auth.uid()) or public.has_workspace_role(workspace_id,array['admin','clinician','reception']))
);
revoke insert, delete on public.workflow_sla_alerts from authenticated;
