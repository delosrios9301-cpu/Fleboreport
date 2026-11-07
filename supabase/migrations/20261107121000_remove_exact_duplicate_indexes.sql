-- Remove duplicate indexes while preserving the constraint-backed unique key.
drop index if exists public.clinical_sample_containers_sample_idx;
drop index if exists public.patients_workspace_id_id_uidx;
