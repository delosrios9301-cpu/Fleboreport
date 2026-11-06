-- Prevent anonymous execution through PostgreSQL's implicit PUBLIC grant.
revoke execute on function public.is_current_home_visit_assignee(uuid,uuid,uuid,text[]) from public,anon;
revoke execute on function public.sync_workspace_technician_professional() from public,anon,authenticated;
