-- Allow authenticated workspace members to append only their own UI activity events.
-- The audit ledger remains immutable: no UPDATE or DELETE privilege is added.
create policy audit_logs_client_activity_insert
  on public.audit_logs
  as permissive
  for insert
  to authenticated
  with check (
    entity_table = 'app_activity'
    and source_event_key is not null
    and actor_id = (select auth.uid())
    and exists (
      select 1
      from public.workspace_members m
      where m.workspace_id = audit_logs.workspace_id
        and m.user_id = (select auth.uid())
        and m.active = true
    )
  );

grant insert on public.audit_logs to authenticated;
grant usage, select on sequence public.audit_logs_id_seq to authenticated;
