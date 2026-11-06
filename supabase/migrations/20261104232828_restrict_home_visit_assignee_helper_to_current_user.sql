create or replace function public.is_current_home_visit_assignee(
  target_workspace uuid,
  target_visit uuid,
  target_user uuid,
  allowed_status text[] default array['invited'::text, 'accepted'::text]
)
returns boolean
language sql
stable
security definer
set search_path to ''
set row_security to 'off'
as $function$
  select
    (select auth.uid()) is not null
    and target_user = (select auth.uid())
    and exists (
      select 1
      from public.home_visit_assignments a
      where a.workspace_id = target_workspace
        and a.home_visit_id = target_visit
        and a.assigned_user_id = (select auth.uid())
        and a.status = any(allowed_status)
        and a.id = (
          select a2.id
          from public.home_visit_assignments a2
          where a2.workspace_id = target_workspace
            and a2.home_visit_id = target_visit
          order by a2.assigned_at desc, a2.id desc
          limit 1
        )
    );
$function$;

revoke all on function public.is_current_home_visit_assignee(uuid,uuid,uuid,text[]) from public, anon;
grant execute on function public.is_current_home_visit_assignee(uuid,uuid,uuid,text[]) to authenticated, service_role;