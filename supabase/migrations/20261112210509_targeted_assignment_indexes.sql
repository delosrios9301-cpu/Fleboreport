-- Focused indexes for accepted/invited assignment lookups.
-- Do not add every advisor-suggested index to tiny or inactive tables.
create index if not exists home_visit_assignments_invited_preview_idx
 on public.home_visit_assignments
 (workspace_id,assigned_user_id,home_visit_id,assigned_at desc,id desc)
 where status='invited';
create index if not exists home_visit_assignments_recent_status_idx
 on public.home_visit_assignments
 (workspace_id,home_visit_id,assigned_at desc,id desc);
