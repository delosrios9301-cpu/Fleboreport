-- Defense-in-depth: assigned technicians may read a COMPLETE home visit row
-- only after accepting the invitation. Coordination retains management access.
-- The invitation preview is provided by a separate field-whitelisted RPC.
-- Existing SELECT policies remain; this policy intersects their result.
alter table public.home_visits enable row level security;
drop policy if exists home_visits_invitation_details_protection on public.home_visits;
create policy home_visits_invitation_details_protection
 on public.home_visits as restrictive for select to authenticated
 using (
  (
   private.has_workspace_permission(workspace_id,'domicilios','view')
   and private.has_workspace_permission(workspace_id,'domicilios','manage')
  )
  or public.is_current_home_visit_assignee(
   workspace_id,id,(select auth.uid()),array['accepted']::text[]
  )
 );
