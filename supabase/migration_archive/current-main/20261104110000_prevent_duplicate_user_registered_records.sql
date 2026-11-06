begin;
-- Consolidar duplicados del catálogo de servicios conservando la fila más antigua.
-- La identidad es el código cuando existe; sin código, se usa el nombre normalizado.
with ranked as (
 select id,
        row_number() over (
          partition by workspace_id,
          case when nullif(btrim(code),'') is not null
               then 'code:'||regexp_replace(lower(btrim(code)),'[^a-z0-9]','','g')
               else 'name:'||regexp_replace(lower(btrim(name)),'[^a-z0-9]','','g')
          end
          order by created_at,id
        ) as duplicate_rank
 from public.services
 where nullif(btrim(name),'') is not null
)
delete from public.services s
using ranked r
where s.id=r.id and r.duplicate_rank>1
  and not exists(select 1 from public.appointments a where a.service_id=s.id)
  and not exists(select 1 from public.attention_tests a where a.service_id=s.id)
  and not exists(select 1 from public.home_visit_tests h where h.service_id=s.id)
  and not exists(select 1 from public.service_package_items p where p.service_id=s.id);

-- Si existe código, la identidad es el código; si no, la identidad es el nombre.
-- El mismo nombre con códigos diferentes se permite.
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
