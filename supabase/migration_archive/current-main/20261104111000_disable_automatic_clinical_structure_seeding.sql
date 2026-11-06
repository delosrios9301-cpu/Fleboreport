begin;
-- Detener la creación automática de gavetas y bandejas al insertar congeladores o racks.
drop trigger if exists clinical_freezer_seed_drawers on public.clinical_freezers;
drop trigger if exists clinical_rack_seed_trays on public.clinical_racks;

-- Retirar únicamente las bandejas y gavetas automáticas que nunca se asociaron a cajas.
delete from public.clinical_rack_trays t
where not exists(select 1 from public.clinical_boxes b where b.tray_id=t.id);
delete from public.clinical_freezer_drawers d
where not exists(select 1 from public.clinical_racks r where r.drawer_id=d.id)
  and not exists(select 1 from public.clinical_boxes b where b.drawer_id=d.id);
commit;
