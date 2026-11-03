begin;
revoke all on function public.register_clinical_cryovial(uuid,uuid,text,text,uuid,integer) from public, anon;
grant execute on function public.register_clinical_cryovial(uuid,uuid,text,text,uuid,integer) to authenticated;
revoke all on function public.move_clinical_cryovial_to_definitive(uuid,uuid,uuid,integer,text) from public, anon;
grant execute on function public.move_clinical_cryovial_to_definitive(uuid,uuid,uuid,integer,text) to authenticated;
revoke all on function public.transition_clinical_sample(uuid,text,text,integer,integer,uuid,uuid) from public, anon;
grant execute on function public.transition_clinical_sample(uuid,text,text,integer,integer,uuid,uuid) to authenticated;
drop index if exists public.clinical_cryovials_workspace_barcode_uidx;
commit;
