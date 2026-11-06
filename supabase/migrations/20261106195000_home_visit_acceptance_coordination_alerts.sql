-- Notifica a coordinación cuando una asignación sigue pendiente de aceptación.
create or replace function private.notify_home_visit_acceptance_pending()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_scheduled_at timestamptz;
  v_priority text;
begin
  if new.status = 'invited' then
    select v.scheduled_at, v.priority into v_scheduled_at, v_priority
    from public.home_visits v
    where v.workspace_id = new.workspace_id and v.id = new.home_visit_id;

    insert into public.workflow_sla_alerts
      (workspace_id, entity, record_id, recipient_user_id, alert_code, severity, due_at, metadata)
    select new.workspace_id, 'home_visit', new.home_visit_id, m.user_id,
      'acceptance_pending', 'warning',
      coalesce(new.assigned_at, clock_timestamp()),
      jsonb_build_object('source','assignment_acceptance','assignment_id',new.id,
        'priority',coalesce(v_priority,'normal'),'scheduled_at',v_scheduled_at)
    from public.workspace_members m
    where m.workspace_id = new.workspace_id and m.active = true
      and m.role in ('admin','clinician','reception')
      and m.user_id <> new.assigned_user_id
    on conflict (workspace_id,entity,record_id,recipient_user_id,alert_code)
    do update set severity=excluded.severity,due_at=excluded.due_at,
      generated_at=clock_timestamp(),resolved_at=null,metadata=excluded.metadata;
  elsif new.status in ('accepted','rejected') then
    update public.workflow_sla_alerts a set resolved_at=clock_timestamp()
    where a.workspace_id=new.workspace_id and a.entity='home_visit'
      and a.record_id=new.home_visit_id and a.alert_code='acceptance_pending'
      and a.metadata->>'assignment_id'=new.id::text and a.resolved_at is null;
  end if;
  return new;
end;
$$;
revoke all on function private.notify_home_visit_acceptance_pending() from public,anon,authenticated;
drop trigger if exists home_visit_assignment_acceptance_alert on public.home_visit_assignments;
create trigger home_visit_assignment_acceptance_alert
after insert or update of status on public.home_visit_assignments
for each row execute function private.notify_home_visit_acceptance_pending();
