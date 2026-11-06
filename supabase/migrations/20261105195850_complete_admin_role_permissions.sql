-- Complete the administrator role matrix for every workspace.
-- The administrator is an invariant full-access role; regular role matrices remain unchanged.

insert into public.role_permissions(workspace_id,role_key,module_key,action_key,allowed)
select w.id,'admin',m.module_key,a.action_key,true
from public.workspaces w
cross join (values
  ('dashboard'),('journeys'),('companies'),('patients'),('catalog'),
  ('users'),('permissions'),('sites'),('studies'),('domicilios'),
  ('reception'),('processing'),('materials'),('reports'),('documents'),
  ('notifications'),('audit'),('settings'),('approvals')
) as m(module_key)
cross join (values
  ('view'),('create'),('edit'),('delete'),('approve'),('assign'),
  ('export'),('print'),('manage'),('configure'),('request')
) as a(action_key)
on conflict(workspace_id,role_key,module_key,action_key)
do update set allowed=true,updated_at=now();