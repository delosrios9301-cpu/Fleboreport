
begin;
delete from public.clinical_rack_trays t
where not exists(select 1 from public.clinical_boxes b where b.tray_id=t.id);
delete from public.clinical_freezer_drawers d
where not exists(select 1 from public.clinical_racks r where r.drawer_id=d.id)
  and not exists(select 1 from public.clinical_boxes b where b.drawer_id=d.id);
commit;
