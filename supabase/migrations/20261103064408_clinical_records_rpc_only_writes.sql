
begin;
-- Clinical samples are written only through audited SECURITY DEFINER RPCs.
drop policy if exists workspace_insert on public.clinical_samples;
drop policy if exists workspace_update on public.clinical_samples;
drop policy if exists workspace_delete on public.clinical_samples;

-- Individual cryovials and their positions are also RPC-only.
drop policy if exists workspace_insert on public.clinical_cryovials;
drop policy if exists workspace_update on public.clinical_cryovials;
drop policy if exists workspace_delete on public.clinical_cryovials;

-- Containers are created atomically with sample registration.
drop policy if exists clinical_sample_containers_insert on public.clinical_sample_containers;
drop policy if exists clinical_sample_containers_update on public.clinical_sample_containers;
drop policy if exists clinical_sample_containers_delete on public.clinical_sample_containers;

-- Event histories are append-only and can only be written by audited server functions/triggers.
drop policy if exists workspace_insert on public.clinical_sample_events;
drop policy if exists workspace_update on public.clinical_sample_events;
drop policy if exists workspace_delete on public.clinical_sample_events;
drop policy if exists workspace_insert on public.clinical_cryovial_events;
drop policy if exists workspace_update on public.clinical_cryovial_events;
drop policy if exists workspace_delete on public.clinical_cryovial_events;
commit;