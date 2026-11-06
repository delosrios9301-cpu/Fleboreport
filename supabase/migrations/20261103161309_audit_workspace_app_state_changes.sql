
-- Track changes made through the synchronized application-state document as well.
-- This covers modules whose records are still stored in workspace_app_state rather than normalized tables.
create or replace function public.audit_workspace_app_state_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  before_state jsonb;
  after_state jsonb;
  changed_keys text[];
  module_name text;
  module_keys text[];
begin
  before_state := case when tg_op='INSERT' then '{}'::jsonb else coalesce(old.state,'{}'::jsonb) end;
  after_state := coalesce(new.state,'{}'::jsonb);
  select coalesce(array_agg(k order by k),'{}'::text[])
    into changed_keys
  from (
    select key as k
    from (
      select jsonb_object_keys(before_state) as key
      union
      select jsonb_object_keys(after_state) as key
    ) all_keys
    where before_state->key is distinct from after_state->key
  ) changed;

  if coalesce(cardinality(changed_keys),0)=0 then return new; end if;

  for module_name in
    select distinct case
      when k like 'clinical%' then 'clinical'
      when k in ('patients') then 'patients'
      when k in ('journey','journeyEntries','selected','reportHistory','reportHistoryLogos') then 'journey'
      when k in ('domicilios','homeVisits','homeVisitAssignments','homeVisitEvents') then 'domicilios'
      when k in ('companies','catalog','individualTestCatalog','individualServices','examPackages','individualTestPrices','attentionTemplates','billingSettings','company','style') then 'configuration'
      else 'administration'
    end
    from unnest(changed_keys) k
  loop
    select array_agg(k order by k) into module_keys
    from unnest(changed_keys) k
    where (case
      when k like 'clinical%' then 'clinical'
      when k in ('patients') then 'patients'
      when k in ('journey','journeyEntries','selected','reportHistory','reportHistoryLogos') then 'journey'
      when k in ('domicilios','homeVisits','homeVisitAssignments','homeVisitEvents') then 'domicilios'
      when k in ('companies','catalog','individualTestCatalog','individualServices','examPackages','individualTestPrices','attentionTemplates','billingSettings','company','style') then 'configuration'
      else 'administration'
    end)=module_name;

    insert into public.audit_logs
      (workspace_id,actor_id,actor_name,entity_table,entity_id,action,changed_fields,occurred_at,site_id,details)
    values
      (new.workspace_id,
       coalesce(auth.uid(),new.updated_by,new.user_id),
       coalesce((select display_name from public.profiles where user_id=coalesce(auth.uid(),new.updated_by,new.user_id)),''),
       'workspace_app_state',new.workspace_id,tg_op,coalesce(module_keys,'{}'::text[]),now(),null,
       jsonb_build_object('source','workspace_state_trigger','module_key',module_name,'state_keys',to_jsonb(module_keys),'revision',new.revision));
  end loop;
  return new;
end;
$$;

drop trigger if exists audit_workspace_app_state_change on public.workspace_app_state;
create trigger audit_workspace_app_state_change
after insert or update on public.workspace_app_state
for each row execute function public.audit_workspace_app_state_change();
