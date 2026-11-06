drop policy if exists home_visit_notifications_read_scoped on public.home_visit_notifications;
revoke all on function public.flebo_notify_user(uuid,uuid,uuid,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.flebo_notify_workspace_staff(uuid,uuid,text,text,text,jsonb,uuid) from public, anon, authenticated;
revoke all on function public.flebo_notify_assignment_changes() from public, anon, authenticated;
revoke all on function public.flebo_notify_visit_status() from public, anon, authenticated;