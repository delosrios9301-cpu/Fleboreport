-- Require active workspace membership even for an accepted assignee.
-- The existing restrictive invitation policy is preserved and tightened.
alter policy home_visits_invitation_details_protection
 on public.home_visits
 using (
  (
   private.has_workspace_permission(workspace_id,'domicilios','view')
   and private.has_workspace_permission(workspace_id,'domicilios','manage')
  )
  or (
   public.is_workspace_member(workspace_id)
   and public.is_current_home_visit_assignee(
    workspace_id,id,(select auth.uid()),array['accepted']::text[]
   )
  )
 );
