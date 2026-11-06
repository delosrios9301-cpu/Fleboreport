
create or replace function public.is_current_home_visit_assignee(
 target_workspace uuid,
 target_visit uuid,
 target_user uuid,
 allowed_status text[] default array['invited','accepted']::text[]
)
returns boolean
language sql
stable
security definer
set search_path=''
set row_security=off
as $function$
 select exists (
  select 1
  from public.home_visit_assignments a
  where a.workspace_id=target_workspace
    and a.home_visit_id=target_visit
    and a.assigned_user_id=target_user
    and a.status=any(allowed_status)
    and a.id=(
      select a2.id
      from public.home_visit_assignments a2
      where a2.workspace_id=target_workspace
        and a2.home_visit_id=target_visit
      order by a2.assigned_at desc,a2.id desc
      limit 1
    )
 );
$function$;

drop policy if exists home_visit_assignments_read_scoped on public.home_visit_assignments;
create policy home_visit_assignments_read_scoped
on public.home_visit_assignments for select
using (
 public.is_workspace_member(workspace_id)
 and (
  public.has_workspace_role(workspace_id,array['admin','clinician','reception'])
  or public.is_current_home_visit_assignee(
    workspace_id,home_visit_id,(select auth.uid()),array['invited','accepted']::text[]
  )
 )
);
