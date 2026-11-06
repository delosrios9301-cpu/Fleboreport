
-- The role-permission editor performs an UPSERT from the authenticated client.
-- PostgreSQL requires UPDATE privilege for the ON CONFLICT DO UPDATE branch.
-- RLS continues to restrict writes to active workspace administrators.
grant update on table public.role_permissions to authenticated;
