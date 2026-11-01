-- Limit each role to the data domains required by its application modules.
-- Existing write policies remain in force; this migration narrows SELECT access.
do $$
declare
  t text;
  allowed text[];
  core_tables text[] := array[
    'companies','journeys','patients','professionals','services','service_packages',
    'service_package_items','attention_templates','attentions','attention_tests',
    'evidences','signatures','reports','invoices','payments','appointments','reminders',
    'inventory_items','inventory_movements'
  ];
  clinical_tables text[] := array[
    'clinical_studies','clinical_visits','clinical_sample_types','clinical_samples',
    'clinical_sample_events','clinical_freezers','clinical_freezer_temperature_logs',
    'clinical_freezer_drawers','clinical_racks','clinical_rack_trays','clinical_boxes',
    'clinical_cryovials','clinical_cryovial_events'
  ];
begin
  foreach t in array core_tables loop
    execute format('drop policy if exists workspace_read on public.%I',t);
    if t='reports' then
      allowed := array['admin','clinician','reception','viewer'];
    else
      allowed := array['admin','clinician','reception'];
    end if;
    execute format(
      'create policy workspace_read on public.%I for select to authenticated using (public.has_workspace_role(workspace_id,%L::text[]))',
      t, allowed
    );
  end loop;
  foreach t in array clinical_tables loop
    execute format('drop policy if exists workspace_read on public.%I',t);
    execute format(
      'create policy workspace_read on public.%I for select to authenticated using (public.has_workspace_role(workspace_id,array[''admin'',''clinician'']))',
      t
    );
  end loop;
  drop policy if exists workspace_read on public.audit_logs;
  drop policy if exists audit_admin_read on public.audit_logs;
  create policy audit_admin_read on public.audit_logs
    for select to authenticated
    using (public.has_workspace_role(workspace_id,array['admin']));
end $$;