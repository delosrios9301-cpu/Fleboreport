begin;
revoke all on function public.set_clinical_sample_aliquots(uuid,integer,integer) from public, anon;
grant execute on function public.set_clinical_sample_aliquots(uuid,integer,integer) to authenticated, service_role;
commit;