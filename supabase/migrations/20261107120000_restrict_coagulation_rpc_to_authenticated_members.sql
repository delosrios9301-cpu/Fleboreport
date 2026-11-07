-- Restrict coagulation configuration RPCs to signed-in users.
-- Both functions retain their internal workspace membership/role checks.
revoke execute on function public.set_clinical_sample_coagulation_snapshot(uuid, uuid, integer, integer, integer) from public, anon;
grant execute on function public.set_clinical_sample_coagulation_snapshot(uuid, uuid, integer, integer, integer) to authenticated;

revoke execute on function public.set_clinical_sample_type_coagulation_config(uuid, uuid, boolean, integer, integer, integer) from public, anon;
grant execute on function public.set_clinical_sample_type_coagulation_config(uuid, uuid, boolean, integer, integer, integer) to authenticated;
