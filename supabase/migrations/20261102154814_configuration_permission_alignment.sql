-- Permission alignment after the initial granular enforcement migration.
-- Keeps appointment/reminder data on their existing staff policies until the
-- dedicated scheduling permissions are connected to the UI.

do $$
declare t text;
begin
  foreach t in array array['appointments','reminders'] loop
    execute format('drop policy if exists granular_allow_select on public.%I',t);
    execute format('drop policy if exists granular_enforce_select on public.%I',t);
    execute format('drop policy if exists granular_allow_insert on public.%I',t);
    execute format('drop policy if exists granular_enforce_insert on public.%I',t);
    execute format('drop policy if exists granular_allow_update on public.%I',t);
    execute format('drop policy if exists granular_enforce_update on public.%I',t);
    execute format('drop policy if exists granular_allow_delete on public.%I',t);
    execute format('drop policy if exists granular_enforce_delete on public.%I',t);
  end loop;
end $$;

insert into public.role_permissions(workspace_id,role_key,module_key,action_key,allowed)
select w.id,d.role_key,d.module_key,d.action_key,true
from public.workspaces w
cross join (values
  ('technician','catalog','view'),
  ('clinician','users','view'),('reception','users','view'),
  ('clinician','settings','view'),('reception','settings','view'),
  ('clinician','documents','view'),('clinician','documents','create'),('clinician','documents','edit'),('clinician','documents','export'),('clinician','documents','print'),
  ('reception','documents','view'),('reception','documents','create'),('reception','documents','edit'),('reception','documents','export'),('reception','documents','print')
) d(role_key,module_key,action_key)
on conflict(workspace_id,role_key,module_key,action_key)
do update set allowed=true,updated_at=now();

create policy audit_logs_granular_read on public.audit_logs
for select to authenticated
using(private.has_workspace_permission(workspace_id,'audit','view'));
