
drop policy if exists home_visit_events_insert_staff_or_assignee on public.home_visit_events;
create policy home_visit_events_insert_staff_or_assignee
on public.home_visit_events
for insert
to authenticated
with check (
  has_workspace_role(workspace_id, array['admin','clinician','reception']::text[])
  or exists (
    select 1
    from public.home_visit_assignments a
    where a.workspace_id = home_visit_events.workspace_id
      and a.home_visit_id = home_visit_events.home_visit_id
      and a.assigned_user_id = auth.uid()
  )
);
