
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  row_json jsonb;
  old_json jsonb;
  entity uuid;
  ws uuid;
  sid uuid;
  fields text[];
  module_key text;
begin
  row_json := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  old_json := case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
  entity := nullif(row_json->>'id','')::uuid;
  ws := nullif(row_json->>'workspace_id','')::uuid;
  sid := nullif(row_json->>'site_id','')::uuid;
  if tg_op='INSERT' then
    fields := array(select jsonb_object_keys(row_json));
  elsif tg_op='DELETE' then
    fields := array(select jsonb_object_keys(old_json));
  else
    fields := array(select k from jsonb_object_keys(row_json) k where row_json->k is distinct from old_json->k);
    if cardinality(fields)=0 then return new; end if;
  end if;
  module_key := case
    when tg_table_name like 'clinical_%' then 'clinical'
    when tg_table_name in ('patients','professionals') then tg_table_name
    when tg_table_name in ('journeys','attentions','attention_tests','evidences','signatures','reports') then 'journey'
    when tg_table_name in ('appointments','reminders','home_visits','home_visit_assignments','home_visit_additional_patients','home_visit_documents','home_visit_events','home_visit_tests','home_visit_notifications') then 'domicilios'
    when tg_table_name in ('inventory_items','inventory_movements') then 'inventory'
    when tg_table_name in ('companies','services','service_packages','service_package_items','attention_templates','invoices','payments','sedes') then 'configuration'
    when tg_table_name='approval_requests' then 'approvals'
    else 'administration'
  end;
  if ws is not null then
    insert into public.audit_logs(workspace_id,actor_id,actor_name,entity_table,entity_id,action,changed_fields,occurred_at,site_id,details)
    values(ws,auth.uid(),coalesce((select display_name from public.profiles where user_id=auth.uid()),''),
      tg_table_name,entity,tg_op,coalesce(fields,'{}'::text[]),now(),sid,
      jsonb_build_object('source','database_trigger','module_key',module_key,'schema_version',1));
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
