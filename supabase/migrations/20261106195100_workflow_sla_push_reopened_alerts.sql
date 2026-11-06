drop trigger if exists workflow_sla_push_after_insert on public.workflow_sla_alerts;
create trigger workflow_sla_push_after_insert
after insert or update of generated_at on public.workflow_sla_alerts
for each row
execute function private.enqueue_workflow_sla_push();