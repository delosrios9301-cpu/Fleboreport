-- Fake users and rows: verifies RLS without touching production data.
\set ON_ERROR_STOP on
alter table public.home_visits add column if not exists patient_id uuid;
alter table public.home_visit_assignments add column if not exists home_visit_id uuid;
alter table public.home_visit_assignments add column if not exists assigned_user_id uuid;
alter table public.home_visit_assignments add column if not exists status text;
alter table public.home_visit_assignments add column if not exists assigned_at timestamptz default now();
insert into public.patients(id,workspace_id) values
('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001');
insert into public.home_visits(id,workspace_id,patient_id) values
('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001');
insert into public.home_visit_assignments(id,workspace_id,home_visit_id,assigned_user_id,status)
values('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','accepted');
insert into public.clinical_samples(id,workspace_id) values
('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
alter table public.patients enable row level security;
alter table public.clinical_samples enable row level security;
grant select on public.patients,public.clinical_samples to authenticated;
create policy test_patients_workspace on public.patients for select to authenticated using (
 private.member_has_workspace_role(workspace_id,(select auth.uid()),array['admin','clinician','reception','technician']::text[])
);
create policy test_samples_workspace on public.clinical_samples for select to authenticated using (
 private.member_has_workspace_role(workspace_id,(select auth.uid()),array['admin','clinician','reception','technician']::text[])
);
\i supabase/migrations/20261112173000_technician_patient_clinical_read_scope.sql
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
do $tech$
begin
 if (select count(*) from public.patients)<>1 then raise exception 'Technician patient scope failed'; end if;
 if (select count(*) from public.clinical_samples)<>0 then raise exception 'Technician clinical samples leaked'; end if;
end $tech$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $admin$
begin
 if (select count(*) from public.patients)<>2 then raise exception 'Admin lost patient access'; end if;
 if (select count(*) from public.clinical_samples)<>1 then raise exception 'Admin lost clinical access'; end if;
end $admin$;
reset role;
\echo 'OK: technician scope and admin access verified'
