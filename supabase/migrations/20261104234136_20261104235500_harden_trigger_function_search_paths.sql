
alter function public.flebo_notify_assignment_changes() set search_path = '';
alter function public.flebo_notify_user(uuid, uuid, uuid, text, text, text, jsonb) set search_path = '';
alter function public.flebo_notify_visit_status() set search_path = '';
alter function public.flebo_notify_workspace_staff(uuid, uuid, text, text, text, jsonb, uuid) set search_path = '';
alter function public.guard_home_visit_assignment_update() set search_path = '';
alter function public.guard_home_visit_technician_update() set search_path = '';
alter function public.sync_workspace_technician_professional() set search_path = '';
