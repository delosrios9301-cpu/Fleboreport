-- Audit 2026-11-12: reduce anonymous Data API RPC privileges.
-- These functions already require auth.uid() and a workspace role internally.
-- Keep their authenticated users and service backend execution intact.
-- No business records, policies, roles, passwords or user settings are changed.

revoke execute on function public.save_workspace_app_state(uuid,jsonb,integer) from public, anon;
revoke execute on function public.search_workspace_patients(uuid,text) from public, anon;
revoke execute on function public.sync_workspace_patient(uuid,text,jsonb) from public, anon;
revoke execute on function public.upsert_clinical_sample_type_config(uuid,uuid,text,text,text,text,text,text,text,integer,integer,integer,text,boolean) from public, anon;
revoke execute on function public.upsert_clinical_visit_config(uuid,uuid,text,text,integer,integer,boolean) from public, anon;

grant execute on function public.save_workspace_app_state(uuid,jsonb,integer) to authenticated, service_role;
grant execute on function public.search_workspace_patients(uuid,text) to authenticated, service_role;
grant execute on function public.sync_workspace_patient(uuid,text,jsonb) to authenticated, service_role;
grant execute on function public.upsert_clinical_sample_type_config(uuid,uuid,text,text,text,text,text,text,text,integer,integer,integer,text,boolean) to authenticated, service_role;
grant execute on function public.upsert_clinical_visit_config(uuid,uuid,text,text,integer,integer,boolean) to authenticated, service_role;
