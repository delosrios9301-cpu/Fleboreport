
begin;
-- Remove only the later, exact duplicate catalog rows. All references are on the
-- retained canonical rows; the duplicate rows have no appointments, tests or packages.
delete from public.services
where id in (
 '052f5f5e-999c-4818-8997-4c37f226b8b4',
 '8279ee65-6ced-473d-9b52-6916da4a0d02',
 'a4068a8f-d0a6-4f9d-b200-26df89480d24'
)
and not exists(select 1 from public.appointments a where a.service_id=services.id)
and not exists(select 1 from public.attention_tests a where a.service_id=services.id)
and not exists(select 1 from public.home_visit_tests h where h.service_id=services.id)
and not exists(select 1 from public.service_package_items p where p.service_id=services.id);

create unique index if not exists services_workspace_code_or_name_uidx
on public.services (
 workspace_id,
 (case when nullif(btrim(code),'') is not null
      then 'code:'||regexp_replace(lower(btrim(code)),'[^a-z0-9]','','g')
      else 'name:'||regexp_replace(lower(btrim(name)),'[^a-z0-9]','','g')
 end)
)
where nullif(btrim(name),'') is not null;

create unique index if not exists clinical_studies_workspace_protocol_normalized_uidx
on public.clinical_studies(workspace_id, lower(btrim(protocol_code)));

create unique index if not exists patients_workspace_document_normalized_uidx
on public.patients(workspace_id, regexp_replace(lower(btrim(document_number)),'[^a-z0-9]','','g'))
where nullif(btrim(document_number),'') is not null;
commit;
