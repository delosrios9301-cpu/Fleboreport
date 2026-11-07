-- Remove recipient-only policies that duplicate the broader scoped policies.
-- Effective recipient/admin/clinician/reception access remains enforced by:
-- workflow_sla_alerts_read_scoped and workflow_sla_alerts_ack_own.
drop policy if exists workflow_sla_alerts_recipient_select on public.workflow_sla_alerts;
drop policy if exists workflow_sla_alerts_recipient_acknowledge on public.workflow_sla_alerts;
