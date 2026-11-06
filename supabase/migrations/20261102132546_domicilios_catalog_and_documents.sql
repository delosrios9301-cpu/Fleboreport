
alter table public.services add column if not exists catalog_source_id text;
create unique index if not exists services_workspace_catalog_source_uidx
  on public.services(workspace_id,catalog_source_id) where catalog_source_id is not null;

drop policy if exists services_read_workspace_roles on public.services;
create policy services_read_workspace_roles on public.services
for select to authenticated
using (has_workspace_role(workspace_id, array['admin','clinician','reception','technician']));

create table if not exists public.home_visit_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  home_visit_id uuid not null,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  file_size bigint,
  uploaded_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint home_visit_documents_visit_fk
    foreign key (workspace_id,home_visit_id)
    references public.home_visits(workspace_id,id) on delete cascade
);
create index if not exists home_visit_documents_visit_idx
  on public.home_visit_documents(workspace_id,home_visit_id,created_at desc);
alter table public.home_visit_documents enable row level security;

drop policy if exists home_visit_documents_read_scoped on public.home_visit_documents;
create policy home_visit_documents_read_scoped on public.home_visit_documents
for select to authenticated
using (
  is_workspace_member(workspace_id)
  and (
    has_workspace_role(workspace_id,array['admin','clinician','reception'])
    or is_current_home_visit_assignee(workspace_id,home_visit_id,auth.uid(),array['accepted'])
  )
);

drop policy if exists home_visit_documents_insert_scoped on public.home_visit_documents;
create policy home_visit_documents_insert_scoped on public.home_visit_documents
for insert to authenticated
with check (
  is_workspace_member(workspace_id)
  and uploaded_by=auth.uid()
  and (
    has_workspace_role(workspace_id,array['admin','clinician','reception'])
    or is_current_home_visit_assignee(workspace_id,home_visit_id,auth.uid(),array['accepted'])
  )
);

drop policy if exists home_visit_documents_delete_staff on public.home_visit_documents;
create policy home_visit_documents_delete_staff on public.home_visit_documents
for delete to authenticated
using (has_workspace_role(workspace_id,array['admin','clinician','reception']));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'home-visit-documents',
  'home-visit-documents',
  false,
  15728640,
  array['application/pdf','image/jpeg','image/png','image/webp','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update set public=false,file_size_limit=15728640,
allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists home_visit_documents_storage_read on storage.objects;
create policy home_visit_documents_storage_read on storage.objects
for select to authenticated
using (
  bucket_id='home-visit-documents'
  and exists (
    select 1 from public.home_visit_documents d
    where d.storage_path=name
      and d.workspace_id::text=(storage.foldername(name))[1]
      and (
        public.has_workspace_role(d.workspace_id,array['admin','clinician','reception'])
        or public.is_current_home_visit_assignee(d.workspace_id,d.home_visit_id,auth.uid(),array['accepted'])
      )
  )
);

drop policy if exists home_visit_documents_storage_insert on storage.objects;
create policy home_visit_documents_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id='home-visit-documents'
  and exists (
    select 1 from public.home_visits v
    where v.workspace_id::text=(storage.foldername(name))[1]
      and v.id::text=(storage.foldername(name))[2]
      and (
        public.has_workspace_role(v.workspace_id,array['admin','clinician','reception'])
        or public.is_current_home_visit_assignee(v.workspace_id,v.id,auth.uid(),array['accepted'])
      )
  )
);

drop policy if exists home_visit_documents_storage_delete on storage.objects;
create policy home_visit_documents_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id='home-visit-documents'
  and exists (
    select 1 from public.home_visit_documents d
    where d.storage_path=name
      and public.has_workspace_role(d.workspace_id,array['admin','clinician','reception'])
  )
);
