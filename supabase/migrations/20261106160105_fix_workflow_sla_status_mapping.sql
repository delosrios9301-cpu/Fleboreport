create or replace function private.generate_workflow_sla_alerts()
returns integer language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare inserted_count integer:=0; now_at timestamptz:=clock_timestamp();
begin
  with latest_assignment as (
    select distinct on(a.workspace_id,a.home_visit_id) a.workspace_id,a.home_visit_id,a.assigned_user_id,a.status
    from public.home_visit_assignments a order by a.workspace_id,a.home_visit_id,a.assigned_at desc,a.id desc
  ),
  domicile_alerts as (
    select v.workspace_id,v.id record_id,la.assigned_user_id recipient,
      case when now_at>=v.scheduled_at then 'departure_overdue' when now_at>=v.scheduled_at-interval '20 minutes' then 'departure_followup' else 'departure_due' end alert_code,
      case when now_at>=v.scheduled_at then 'overdue' when now_at>=v.scheduled_at-interval '20 minutes' then 'critical' else 'warning' end severity,
      v.scheduled_at-interval '30 minutes' due_at
    from public.home_visits v join latest_assignment la on la.workspace_id=v.workspace_id and la.home_visit_id=v.id
    where la.status='accepted' and la.assigned_user_id is not null
      and v.status not in ('en_route','at_home','samples_taken','completed','cancelled','not_performed','patient_absent','patient_refused','rejected','rescheduled')
      and now_at>=v.scheduled_at-interval '30 minutes'
  ),
  recipients as (
    select d.workspace_id,d.record_id,d.recipient recipient_user_id,d.alert_code,d.severity,d.due_at from domicile_alerts d
    union all
    select d.workspace_id,d.record_id,m.user_id,d.alert_code,d.severity,d.due_at from domicile_alerts d
    join public.workspace_members m on m.workspace_id=d.workspace_id and m.active
    where m.role in ('admin','clinician','reception') and m.user_id<>d.recipient
  ),
  inserted as (
    insert into public.workflow_sla_alerts(workspace_id,entity,record_id,recipient_user_id,alert_code,severity,due_at,metadata)
    select workspace_id,'home_visit',record_id,recipient_user_id,alert_code,severity,due_at,jsonb_build_object('source','scheduled_sla','threshold_minutes',30)
    from recipients on conflict(workspace_id,entity,record_id,recipient_user_id,alert_code) do nothing returning 1
  ) select count(*) into inserted_count from inserted;

  with clinical_thresholds as (
    select s.workspace_id,s.id record_id,s.collection_at+interval '72 hours' expires_at,
      case when now_at>=s.collection_at+interval '72 hours' then 'sample_overdue'
           when now_at>=s.collection_at+interval '71 hours 40 minutes' then 'sample_20m'
           when now_at>=s.collection_at+interval '48 hours' then 'sample_24h' end alert_code,
      case when now_at>=s.collection_at+interval '72 hours' then 'overdue'
           when now_at>=s.collection_at+interval '71 hours 40 minutes' then 'critical' else 'warning' end severity
    from public.clinical_samples s
    where s.deleted_at is null and s.processing_started_at is null
      and now_at>=s.collection_at+interval '48 hours'
      and coalesce(s.workflow_status,'') not in ('PROCESANDO','ALMACENAMIENTO_TEMPORAL','CONGELADOR_DEFINITIVO','CANCELADO','ANULADO')
  ),
  clinical_recipients as (
    select t.workspace_id,t.record_id,m.user_id recipient_user_id,t.alert_code,t.severity,t.expires_at due_at
    from clinical_thresholds t join public.workspace_members m on m.workspace_id=t.workspace_id and m.active
    where t.alert_code is not null and m.role in ('admin','clinician','technician')
  ),
  inserted as (
    insert into public.workflow_sla_alerts(workspace_id,entity,record_id,recipient_user_id,alert_code,severity,due_at,metadata)
    select workspace_id,'clinical_sample',record_id,recipient_user_id,alert_code,severity,due_at,jsonb_build_object('source','collection_sla','maximum_hours',72)
    from clinical_recipients on conflict(workspace_id,entity,record_id,recipient_user_id,alert_code) do nothing returning 1
  ) select inserted_count+count(*) into inserted_count from inserted;

  update public.workflow_sla_alerts a set resolved_at=now_at where a.resolved_at is null and (
    (a.entity='home_visit' and exists(select 1 from public.home_visits v where v.id=a.record_id and v.workspace_id=a.workspace_id
      and v.status in ('en_route','at_home','samples_taken','completed','cancelled','not_performed','patient_absent','patient_refused','rejected','rescheduled')))
    or (a.entity='clinical_sample' and exists(select 1 from public.clinical_samples s where s.id=a.record_id and s.workspace_id=a.workspace_id
      and (s.processing_started_at is not null or s.deleted_at is not null or coalesce(s.workflow_status,'') in ('PROCESANDO','ALMACENAMIENTO_TEMPORAL','CONGELADOR_DEFINITIVO','CANCELADO','ANULADO')))
  );
  return inserted_count;
end; $$;
revoke all on function private.generate_workflow_sla_alerts() from public,anon,authenticated;
