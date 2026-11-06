-- Prevent direct client writes that could bypass clinical workflow validation.
begin;
drop policy if exists workspace_insert on public.clinical_samples;
drop policy if exists workspace_update on public.clinical_samples;
drop policy if exists workspace_delete on public.clinical_samples;
drop policy if exists workspace_insert on public.clinical_cryovials;
drop policy if exists workspace_update on public.clinical_cryovials;
drop policy if exists workspace_delete on public.clinical_cryovials;
drop policy if exists clinical_sample_containers_insert on public.clinical_sample_containers;
drop policy if exists clinical_sample_containers_update on public.clinical_sample_containers;
drop policy if exists clinical_sample_containers_delete on public.clinical_sample_containers;
drop policy if exists workspace_insert on public.clinical_sample_events;
drop policy if exists workspace_update on public.clinical_sample_events;
drop policy if exists workspace_delete on public.clinical_sample_events;
drop policy if exists workspace_insert on public.clinical_cryovial_events;
drop policy if exists workspace_update on public.clinical_cryovial_events;
drop policy if exists workspace_delete on public.clinical_cryovial_events;
commit;
