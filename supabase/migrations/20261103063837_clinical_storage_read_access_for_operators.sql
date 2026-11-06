
begin;
drop policy if exists workspace_read on public.clinical_freezers;
create policy workspace_read on public.clinical_freezers for select to authenticated
using (public.has_workspace_role(workspace_id,array['admin','clinician','technician','reception']));
drop policy if exists workspace_read on public.clinical_freezer_drawers;
create policy workspace_read on public.clinical_freezer_drawers for select to authenticated
using (public.has_workspace_role(workspace_id,array['admin','clinician','technician','reception']));
drop policy if exists workspace_read on public.clinical_racks;
create policy workspace_read on public.clinical_racks for select to authenticated
using (public.has_workspace_role(workspace_id,array['admin','clinician','technician','reception']));
drop policy if exists workspace_read on public.clinical_rack_trays;
create policy workspace_read on public.clinical_rack_trays for select to authenticated
using (public.has_workspace_role(workspace_id,array['admin','clinician','technician','reception']));
commit;