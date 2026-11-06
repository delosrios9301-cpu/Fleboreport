-- Notify active, administrator-assigned processing, reception and coordination roles
-- as soon as a clinical sample enters PENDIENTE_PROCESO. SLA threshold alerts remain separate.
create or replace function private.notify_clinical_sample_pending()
returns trigger
language plpgsql
security definer
set search_path to ''
set row_security to 'off'
as $function$
begin
  if new.workflow_status is distinct from 'PENDIENTE_PROCESO' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.workflow_status is not distinct from new.workflow_status then
    return new;
  end if;
  insert into public.workflow_sla_alerts
    (workspace_id,entity,record_id,recipient_user_id,alert_code,severity,due_at,metadata)
  select distinct new.workspace_id,'clinical_sample',new.id,m.user_id,'sample_received','warning',
    new.collection_at + interval '72 hours',
    jsonb_build_object('source','clinical_sample_pending_event','event','sample_received_pending_processing',
      'recipient_rule','active_assigned_roles_by_area')
  from public.workspace_members m
  join public.workspace_member_roles mr on mr.workspace_id=m.workspace_id and mr.user_id=m.user_id
  join public.workspace_roles r on r.workspace_id=mr.workspace_id and r.role_key=mr.role_key and r.active
  where m.workspace_id=new.workspace_id and m.active
    and r.area_key in ('processing','reception','coordination')
  on conflict (workspace_id,entity,record_id,recipient_user_id,alert_code) do nothing;
  return new;
end;
$function$;
drop trigger if exists trg_notify_clinical_sample_pending on public.clinical_samples;
create trigger trg_notify_clinical_sample_pending
after insert or update of workflow_status on public.clinical_samples
for each row execute function private.notify_clinical_sample_pending();
insert into public.workflow_sla_alerts
  (workspace_id,entity,record_id,recipient_user_id,alert_code,severity,due_at,metadata)
select distinct s.workspace_id,'clinical_sample',s.id,m.user_id,'sample_received','warning',
  s.collection_at + interval '72 hours',
  jsonb_build_object('source','clinical_sample_pending_backfill','event','sample_received_pending_processing',
    'recipient_rule','active_assigned_roles_by_area')
from public.clinical_samples s
join public.workspace_members m on m.workspace_id=s.workspace_id and m.active
join public.workspace_member_roles mr on mr.workspace_id=m.workspace_id and mr.user_id=m.user_id
join public.workspace_roles r on r.workspace_id=mr.workspace_id and r.role_key=mr.role_key and r.active
where s.deleted_at is null and s.workflow_status='PENDIENTE_PROCESO'
  and r.area_key in ('processing','reception','coordination')
on conflict (workspace_id,entity,record_id,recipient_user_id,alert_code) do nothing;
