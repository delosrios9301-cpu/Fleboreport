-- Let former assignees receive identifier-only deltas for visits they previously
-- had access to, so their device can remove stale patient details after reassignment.
create or replace function private.was_home_visit_assignee(
  target_workspace uuid,
  target_visit uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = 'off'
as $function$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.home_visit_assignments a
      where a.workspace_id = target_workspace
        and a.home_visit_id = target_visit
        and a.assigned_user_id = (select auth.uid())
    );
$function$;
revoke all on function private.was_home_visit_assignee(uuid,uuid) from public, anon;
grant execute on function private.was_home_visit_assignee(uuid,uuid) to authenticated;

drop policy if exists sync_change_log_read_scoped on public.sync_change_log;
create policy sync_change_log_read_scoped
on public.sync_change_log
for select
to authenticated
using (
  (
    entity = 'domiciles'
    and public.is_workspace_member(workspace_id)
    and (
      (
        private.has_workspace_permission(workspace_id, 'domicilios', 'view')
        and private.has_workspace_permission(workspace_id, 'domicilios', 'manage')
      )
      or private.was_home_visit_assignee(workspace_id, record_id)
    )
  )
  or
  (
    entity = 'clinical_samples'
    and public.has_workspace_role(
      workspace_id,
      array['admin'::text, 'clinician'::text, 'technician'::text, 'reception'::text]
    )
  )
);
