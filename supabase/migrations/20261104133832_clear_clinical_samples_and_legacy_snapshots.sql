
begin;

-- Limpieza limitada al espacio de trabajo FleboReport.
-- Se conservan estudios, visitas, tipos de muestra, congeladores, cajas y auditoría general.
alter table public.clinical_sample_events disable trigger trg_clinical_sample_events_immutable;
alter table public.clinical_cryovial_events disable trigger trg_clinical_cryovial_events_immutable;

delete from public.clinical_sample_containers
where workspace_id='ec542800-7d0d-4d9d-8c52-ee49cc102ad3';

delete from public.clinical_cryovial_events
where workspace_id='ec542800-7d0d-4d9d-8c52-ee49cc102ad3';

delete from public.clinical_cryovials
where workspace_id='ec542800-7d0d-4d9d-8c52-ee49cc102ad3';

delete from public.clinical_sample_events
where workspace_id='ec542800-7d0d-4d9d-8c52-ee49cc102ad3';

delete from public.clinical_samples
where workspace_id='ec542800-7d0d-4d9d-8c52-ee49cc102ad3';

-- Vaciar también las copias antiguas guardadas en el estado sincronizado por usuario.
update public.workspace_app_state
set state = jsonb_set(
  jsonb_set(
    jsonb_set(coalesce(state,'{}'::jsonb),'{clinicalSamples}','[]'::jsonb,true),
    '{clinicalSampleHistory}','[]'::jsonb,true
  ),
  '{clinicalLocalDeletedSampleIds}','[]'::jsonb,true
),
revision=revision+1,
updated_at=now()
where workspace_id='ec542800-7d0d-4d9d-8c52-ee49cc102ad3';

alter table public.clinical_sample_events enable trigger trg_clinical_sample_events_immutable;
alter table public.clinical_cryovial_events enable trigger trg_clinical_cryovial_events_immutable;

commit;
