-- Keep domicile delta visibility aligned with the existing parent-row policy:
-- managers can read managed agenda changes; assignees can see their own assignment
-- lifecycle changes so their client can remove visits that are no longer visible.
drop policy if exists sync_change_log_read_scoped on public.sync_change_log;
create policy sync_change_log_read_scoped
on public.sync_change_log
for select
to authenticated
using (
  (
    entity = 'domiciles'
    and (
      (
        private.has_workspace_permission(workspace_id, 'domicilios', 'view')
        and private.has_workspace_permission(workspace_id, 'domicilios', 'manage')
      )
      or public.is_current_home_visit_assignee(
        workspace_id,
        record_id,
        (select auth.uid()),
        array['invited'::text, 'accepted'::text, 'rejected'::text]
      )
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
