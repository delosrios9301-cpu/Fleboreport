-- Pacientes adicionales capturados durante un domicilio y revisión obligatoria por Oficina.
create table if not exists public.home_visit_additional_patients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  home_visit_id uuid not null,
  patient_id uuid,
  document_number text,
  first_name text not null,
  last_name text not null,
  birth_date date,
  sex text,
  phone text,
  email text,
  address text,
  requested_tests jsonb not null default '[]'::jsonb,
  status text not null default 'pending_review'
    check (status in ('pending_review','approved','rejected')),
  review_note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  unique (workspace_id,id),
  foreign key (workspace_id,home_visit_id)
    references public.home_visits(workspace_id,id) on delete cascade,
  foreign key (workspace_id,patient_id)
    references public.patients(workspace_id,id) on delete restrict
);

create index if not exists home_visit_additional_patients_visit_idx
  on public.home_visit_additional_patients(workspace_id,home_visit_id,created_at desc);
create index if not exists home_visit_additional_patients_review_idx
  on public.home_visit_additional_patients(workspace_id,status,created_at desc);

alter table public.home_visit_additional_patients enable row level security;

create policy home_visit_additional_patients_read_scoped
on public.home_visit_additional_patients for select to authenticated
using (
  public.is_workspace_member(workspace_id)
  and (
    private.has_workspace_permission(workspace_id,'domicilios','manage')
    or created_by=(select auth.uid())
    or public.is_current_home_visit_assignee(workspace_id,home_visit_id,(select auth.uid()),array['accepted']::text[])
  )
);

create policy home_visit_additional_patients_insert_assignee
on public.home_visit_additional_patients for insert to authenticated
with check (
  public.is_workspace_member(workspace_id)
  and created_by=(select auth.uid())
  and status='pending_review'
  and reviewed_by is null
  and reviewed_at is null
  and (
    private.has_workspace_permission(workspace_id,'domicilios','manage')
    or public.is_current_home_visit_assignee(workspace_id,home_visit_id,(select auth.uid()),array['accepted']::text[])
  )
);

create policy home_visit_additional_patients_review
on public.home_visit_additional_patients for update to authenticated
using (
  private.has_workspace_permission(workspace_id,'domicilios','manage')
)
with check (
  private.has_workspace_permission(workspace_id,'domicilios','manage')
);

create or replace function public.guard_home_visit_additional_patient_review()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.status <> new.status then
    if not private.has_workspace_permission(old.workspace_id,'domicilios','manage') then
      raise exception 'Solo Oficina puede revisar pacientes adicionales';
    end if;
    if old.status <> 'pending_review' or new.status not in ('approved','rejected') then
      raise exception 'La revisión solo puede resolverse una vez';
    end if;
    new.reviewed_by := (select auth.uid());
    new.reviewed_at := now();
  else
    if new.workspace_id is distinct from old.workspace_id
      or new.home_visit_id is distinct from old.home_visit_id
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
      or new.document_number is distinct from old.document_number
      or new.first_name is distinct from old.first_name
      or new.last_name is distinct from old.last_name
      or new.birth_date is distinct from old.birth_date
      or new.sex is distinct from old.sex
      or new.phone is distinct from old.phone
      or new.email is distinct from old.email
      or new.address is distinct from old.address
      or new.requested_tests is distinct from old.requested_tests then
      raise exception 'Los datos enviados por campo no se pueden alterar durante la revisión';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists home_visit_additional_patients_guard
  on public.home_visit_additional_patients;
create trigger home_visit_additional_patients_guard
before update on public.home_visit_additional_patients
for each row execute function public.guard_home_visit_additional_patient_review();
