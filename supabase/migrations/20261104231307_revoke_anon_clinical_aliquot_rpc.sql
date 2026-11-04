-- Keep the legacy aliquot RPC unavailable to anonymous callers.
-- Authenticated users and trusted server operations retain execution.
revoke all on function public.set_clinical_sample_aliquots(uuid,integer,integer) from public, anon;
grant execute on function public.set_clinical_sample_aliquots(uuid,integer,integer) to authenticated, service_role;
