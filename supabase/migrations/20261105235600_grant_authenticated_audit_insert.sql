-- Allow authenticated users to append their own activity rows; RLS limits the row scope.
grant insert on table public.audit_logs to authenticated;
