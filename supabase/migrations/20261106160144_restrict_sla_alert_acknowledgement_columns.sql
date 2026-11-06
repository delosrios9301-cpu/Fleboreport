revoke update on public.workflow_sla_alerts from authenticated;
grant update (acknowledged_at,acknowledged_by) on public.workflow_sla_alerts to authenticated;
