-- Row-level isolation: technicians may read a patient only after accepting
-- the most recent assignment. Clinical tables require studies/processing view.
create or replace function private.technician_has_accepted_patient(p_workspace_id uuid,p_patient_id uuid)
returns boolean language sql stable security definer set search_path=''
as $scope$
 select (select auth.uid()) is not null and exists(
  select 1 from public.home_visits v
  join public.home_visit_assignments a on a.workspace_id=v.workspace_id and a.home_visit_id=v.id
  where v.workspace_id=p_workspace_id and v.patient_id=p_patient_id
    and a.assigned_user_id=(select auth.uid()) and a.status='accepted'
    and a.id=(select x.id from public.home_visit_assignments x
     where x.workspace_id=v.workspace_id and x.home_visit_id=v.id
     order by x.assigned_at desc,x.id desc limit 1)
 );
$scope$;
revoke all on function private.technician_has_accepted_patient(uuid,uuid) from public,anon;
grant execute on function private.technician_has_accepted_patient(uuid,uuid) to authenticated,service_role;
create index if not exists home_visits_patient_scope_idx
 on public.home_visits(workspace_id,patient_id,id) where patient_id is not null;
create index if not exists home_visit_assignments_accepted_scope_idx
 on public.home_visit_assignments(workspace_id,assigned_user_id,home_visit_id,assigned_at desc)
 where status='accepted';
do $p$
begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='patients' and policyname='technician_patients_current_accepted_scope') then
  create policy technician_patients_current_accepted_scope on public.patients
  as restrictive for select to authenticated using (
    not private.member_has_workspace_role(workspace_id,(select auth.uid()),array['technician']::text[])
    or private.member_has_workspace_role(workspace_id,(select auth.uid()),array['admin','clinician','reception']::text[])
    or private.technician_has_accepted_patient(workspace_id,id)
  );
 end if;
end $p$;
do $clinical$
declare v_table text;
begin
 foreach v_table in array array['clinical_boxes','clinical_cryovial_events','clinical_cryovials','clinical_freezer_drawers','clinical_freezers','clinical_rack_trays','clinical_racks','clinical_sample_containers','clinical_sample_events','clinical_sample_types','clinical_samples','clinical_studies','clinical_visits'] loop
  if to_regclass(format('public.%I',v_table)) is not null
   and not exists(select 1 from pg_policies where schemaname='public' and tablename=v_table and policyname='clinical_technician_module_read_guard') then
   execute format($fmt$
     create policy clinical_technician_module_read_guard on public.%I
     as restrictive for select to authenticated using (
       not private.member_has_workspace_role(workspace_id,(select auth.uid()),array['technician']::text[])
       or private.member_has_workspace_role(workspace_id,(select auth.uid()),array['admin','clinician','reception']::text[])
       or private.has_workspace_permission(workspace_id,'studies','view')
       or private.has_workspace_permission(workspace_id,'processing','view')
     )
   $fmt$,v_table);
  end if;
 end loop;
end $clinical$;
