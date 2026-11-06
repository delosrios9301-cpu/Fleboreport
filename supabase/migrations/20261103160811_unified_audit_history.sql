
-- Unified, searchable, immutable audit history for all FleboReport modules.
create index if not exists audit_logs_workspace_time_id_idx
  on public.audit_logs(workspace_id, occurred_at desc, id desc);
create index if not exists audit_logs_workspace_actor_time_idx
  on public.audit_logs(workspace_id, actor_id, occurred_at desc);
create index if not exists audit_logs_workspace_entity_time_idx
  on public.audit_logs(workspace_id, entity_table, occurred_at desc);
create index if not exists audit_logs_workspace_site_time_idx
  on public.audit_logs(workspace_id, site_id, occurred_at desc);
create index if not exists audit_logs_changed_fields_gin_idx
  on public.audit_logs using gin(changed_fields);
create index if not exists audit_logs_details_gin_idx
  on public.audit_logs using gin(details jsonb_path_ops);

-- Capture the module and site without copying clinical/patient values into the audit trail.
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
    fields := array(
      select k from jsonb_object_keys(row_json) k
      where row_json->k is distinct from old_json->k
    );
    if cardinality(fields)=0 then
      return new;
    end if;
  end if;

  module_key := case
    when tg_table_name like 'clinical_%' then 'clinical'
    when tg_table_name in ('patients','professionals') then tg_table_name
    when tg_table_name in ('journeys','attentions','attention_tests','evidences','signatures','reports') then 'journey'
    when tg_table_name in ('appointments','reminders') then 'domicilios'
    when tg_table_name in ('inventory_items','inventory_movements') then 'inventory'
    when tg_table_name in ('companies','services','service_packages','service_package_items','attention_templates','invoices','payments') then 'configuration'
    when tg_table_name='approval_requests' then 'approvals'
    else 'administration'
  end;

  if ws is not null then
    insert into public.audit_logs
      (workspace_id,actor_id,actor_name,entity_table,entity_id,action,changed_fields,occurred_at,site_id,details)
    values
      (ws,auth.uid(),
       coalesce((select display_name from public.profiles where user_id=auth.uid()),''),
       tg_table_name,entity,tg_op,coalesce(fields,'{}'::text[]),now(),sid,
       jsonb_build_object('source','database_trigger','module_key',module_key,'schema_version',1));
  end if;

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

-- Backfill the browser audit trail already synchronized in workspace_app_state.
-- Preserve the original event timestamp, operator, section and event ID; never duplicate a legacy event.
insert into public.audit_logs
  (workspace_id,actor_id,actor_name,entity_table,entity_id,action,changed_fields,occurred_at,details)
select
  s.workspace_id,
  s.user_id,
  coalesce(nullif(item->>'operator',''),'Operador local'),
  'legacy_local',
  null,
  coalesce(nullif(item->>'action',''),'Actividad'),
  '{}'::text[],
  coalesce(nullif(item->>'timestamp','')::timestamptz,s.updated_at,now()),
  jsonb_build_object(
    'source','legacy_local_history',
    'module_key',case
      when lower(coalesce(item->>'section','')) like '%clínic%' or lower(coalesce(item->>'section','')) like '%clinical%' then 'clinical'
      when lower(coalesce(item->>'section','')) like '%pacient%' then 'patients'
      when lower(coalesce(item->>'section','')) like '%jornada%' then 'journey'
      when lower(coalesce(item->>'section','')) like '%domicil%' then 'domicilios'
      when lower(coalesce(item->>'section','')) like '%config%' then 'configuration'
      else 'administration'
    end,
    'section',coalesce(item->>'section','Aplicación'),
    'legacy_id',coalesce(item->>'id',md5(item::text))
  )
from public.workspace_app_state s
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(s.state->'auditLog')='array' then s.state->'auditLog' else '[]'::jsonb end
) item
where not exists (
  select 1 from public.audit_logs a
  where a.workspace_id=s.workspace_id
    and a.entity_table='legacy_local'
    and a.details->>'legacy_id'=coalesce(item->>'id',md5(item::text))
);

-- Server-side filtered pagination. RLS remains authoritative (including per-workspace permissions).
create or replace function public.search_audit_logs(
  p_workspace_id uuid,
  p_search text default null,
  p_module text default null,
  p_action text default null,
  p_actor text default null,
  p_site_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  id bigint,
  workspace_id uuid,
  actor_id uuid,
  actor_name text,
  entity_table text,
  entity_id uuid,
  action text,
  changed_fields text[],
  occurred_at timestamptz,
  site_id uuid,
  details jsonb,
  total_count bigint
)
language sql
stable
security invoker
set search_path=''
as $$
  with filtered as (
    select a.*
    from public.audit_logs a
    where a.workspace_id=p_workspace_id
      and (nullif(btrim(p_search),'') is null or
        lower(concat_ws(' ',a.actor_name,a.entity_table,a.entity_id::text,a.action,
          array_to_string(a.changed_fields,' '),a.details::text))
        like '%'||lower(btrim(p_search))||'%')
      and (nullif(p_module,'') is null or
        coalesce(a.details->>'module_key',
          case when a.entity_table like 'clinical_%' then 'clinical'
               when a.entity_table in ('patients','professionals') then a.entity_table
               when a.entity_table in ('journeys','attentions','attention_tests','evidences','signatures','reports') then 'journey'
               when a.entity_table in ('appointments','reminders') then 'domicilios'
               when a.entity_table in ('inventory_items','inventory_movements') then 'inventory'
               when a.entity_table in ('companies','services','service_packages','service_package_items','attention_templates','invoices','payments') then 'configuration'
               when a.entity_table='approval_requests' then 'approvals'
               else 'administration' end)=p_module)
      and (nullif(p_action,'') is null or lower(a.action)=lower(p_action))
      and (nullif(btrim(p_actor),'') is null or
        lower(a.actor_name) like '%'||lower(btrim(p_actor))||'%' or a.actor_id::text ilike '%'||btrim(p_actor)||'%')
      and (p_site_id is null or a.site_id=p_site_id)
      and (p_from is null or a.occurred_at>=p_from)
      and (p_to is null or a.occurred_at<=p_to)
  )
  select f.id,f.workspace_id,f.actor_id,f.actor_name,f.entity_table,f.entity_id,
         f.action,f.changed_fields,f.occurred_at,f.site_id,f.details,
         count(*) over() as total_count
  from filtered f
  order by f.occurred_at desc,f.id desc
  limit greatest(1,least(coalesce(p_limit,50),200))
  offset greatest(0,coalesce(p_offset,0));
$$;

revoke all on function public.search_audit_logs(uuid,text,text,text,text,uuid,timestamptz,timestamptz,integer,integer) from public,anon;
grant execute on function public.search_audit_logs(uuid,text,text,text,text,uuid,timestamptz,timestamptz,integer,integer) to authenticated;

-- Audit entries are append-only. Inserts are performed by SECURITY DEFINER triggers/RPCs only.
drop policy if exists audit_logs_insert_member on public.audit_logs;
revoke insert,update,delete on public.audit_logs from anon,authenticated;
grant select on public.audit_logs to authenticated;
