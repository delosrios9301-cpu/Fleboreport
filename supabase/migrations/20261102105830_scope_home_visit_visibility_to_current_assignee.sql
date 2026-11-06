
drop policy if exists home_visits_read_scoped on public.home_visits;
create policy home_visits_read_scoped on public.home_visits for select
using (
 public.is_workspace_member(workspace_id)
 and (
  public.has_workspace_role(workspace_id,array['admin','clinician','reception'])
  or exists (
   select 1 from public.home_visit_assignments a
   where a.workspace_id=home_visits.workspace_id and a.home_visit_id=home_visits.id
    and a.assigned_user_id=(select auth.uid()) and a.status in ('invited','accepted')
    and not exists (
     select 1 from public.home_visit_assignments newer
     where newer.workspace_id=a.workspace_id and newer.home_visit_id=a.home_visit_id
      and newer.assigned_at>a.assigned_at
    )
  )
 )
);

drop policy if exists home_visit_assignments_read_scoped on public.home_visit_assignments;
create policy home_visit_assignments_read_scoped on public.home_visit_assignments for select
using (
 public.is_workspace_member(workspace_id)
 and (
  public.has_workspace_role(workspace_id,array['admin','clinician','reception'])
  or (
   assigned_user_id=(select auth.uid()) and status in ('invited','accepted')
   and not exists (
    select 1 from public.home_visit_assignments newer
    where newer.workspace_id=home_visit_assignments.workspace_id
     and newer.home_visit_id=home_visit_assignments.home_visit_id
     and newer.assigned_at>home_visit_assignments.assigned_at
   )
  )
 )
);

drop policy if exists home_visit_tests_read_scoped on public.home_visit_tests;
create policy home_visit_tests_read_scoped on public.home_visit_tests for select
using (
 public.is_workspace_member(workspace_id)
 and (
  public.has_workspace_role(workspace_id,array['admin','clinician','reception'])
  or exists (
   select 1 from public.home_visit_assignments a
   where a.workspace_id=home_visit_tests.workspace_id and a.home_visit_id=home_visit_tests.home_visit_id
    and a.assigned_user_id=(select auth.uid()) and a.status in ('invited','accepted')
    and not exists (
     select 1 from public.home_visit_assignments newer
     where newer.workspace_id=a.workspace_id and newer.home_visit_id=a.home_visit_id
      and newer.assigned_at>a.assigned_at
    )
  )
 )
);

drop policy if exists home_visit_events_read_scoped on public.home_visit_events;
create policy home_visit_events_read_scoped on public.home_visit_events for select
using (
 public.is_workspace_member(workspace_id)
 and (
  public.has_workspace_role(workspace_id,array['admin','clinician','reception'])
  or exists (
   select 1 from public.home_visit_assignments a
   where a.workspace_id=home_visit_events.workspace_id and a.home_visit_id=home_visit_events.home_visit_id
    and a.assigned_user_id=(select auth.uid()) and a.status in ('invited','accepted')
    and not exists (
     select 1 from public.home_visit_assignments newer
     where newer.workspace_id=a.workspace_id and newer.home_visit_id=a.home_visit_id
      and newer.assigned_at>a.assigned_at
    )
  )
 )
);
