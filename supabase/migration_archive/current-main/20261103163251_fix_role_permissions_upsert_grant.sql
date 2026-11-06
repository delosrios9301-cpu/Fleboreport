-- Allow the authenticated role to complete ON CONFLICT DO UPDATE in the role-permission editor.
-- Row-level security remains enabled and the existing admin-only policies continue to guard writes.
grant update on table public.role_permissions to authenticated;
