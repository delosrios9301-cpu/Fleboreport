
begin;
drop trigger if exists clinical_freezer_seed_drawers on public.clinical_freezers;
drop trigger if exists clinical_rack_seed_trays on public.clinical_racks;
commit;
