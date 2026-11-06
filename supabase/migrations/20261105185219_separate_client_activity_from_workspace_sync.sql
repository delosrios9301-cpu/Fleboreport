alter table public.audit_logs add column if not exists source_event_key text;
create unique index if not exists audit_logs_source_event_key_uidx on public.audit_logs (source_event_key);

insert into public.audit_logs
  (workspace_id, actor_id, actor_name, entity_table, entity_id, action, changed_fields, occurred_at, site_id, details, source_event_key)
select s.workspace_id, s.user_id,
  coalesce(nullif(btrim(e.value->>'operator'), ''), 'Operador local'),
  'app_activity', null,
  coalesce(nullif(btrim(e.value->>'action'), ''), 'Actividad'),
  '{}'::text[], (e.value->>'timestamp')::timestamptz, null,
  jsonb_build_object('source','legacy_client_audit_log','module_key','application',
    'section',coalesce(nullif(btrim(e.value->>'section'),''),'Aplicación'),
    'legacy_event_id',e.value->>'id'),
  'legacy:' || s.user_id::text || ':' || (e.value->>'id')
from public.workspace_app_state s
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(s.state->'auditLog')='array' then s.state->'auditLog' else '[]'::jsonb end
) as e(value)
where nullif(e.value->>'id','') is not null and nullif(e.value->>'timestamp','') is not null
on conflict (source_event_key) do nothing;