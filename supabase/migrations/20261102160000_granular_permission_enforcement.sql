-- Enforce granular authorization on core FleboReport modules and expose own role permissions.
-- This migration keeps existing assignment-scoped access for home visits.

create policy role_permissions_member_read
on public.role_permissions for select to authenticated
using (
  public.has_workspace_role(workspace_id,array['admin']::text[])
  or role_key = (
    select wm.role from public.workspace_members wm
    where wm.workspace_id=role_permissions.workspace_id
      and wm.user_id=(select auth.uid()) and wm.active=true
    limit 1
  )
);

-- Supervisors/coordinators may manage the complete domicile queue; technicians remain assignment-scoped.
insert into public.role_permissions(workspace_id,role_key,module_key,action_key,allowed)
select w.id,r.role_key,'domicilios','manage',true
from public.workspaces w
cross join (values('clinician'),('reception')) r(role_key)
on conflict(workspace_id,role_key,module_key,action_key)
do update set allowed=true,updated_at=now();

-- Technical staff can use the processing module when explicitly assigned that role.
insert into public.role_permissions(workspace_id,role_key,module_key,action_key,allowed)
select w.id,'technician','processing',a.action_key,true
from public.workspaces w
cross join unnest(array['view','create','edit']::text[]) a(action_key)
on conflict(workspace_id,role_key,module_key,action_key)
do update set allowed=true,updated_at=now();
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

do $$
declare r record;
begin
  for r in
    select * from (values
      ('companies','companies'),
      ('journeys','journeys'),
      ('patients','patients'),
      ('services','catalog'),
      ('service_packages','catalog'),
      ('service_package_items','catalog'),
      ('attention_templates','settings'),
      ('attentions','journeys'),
      ('attention_tests','journeys'),
      ('evidences','documents'),
      ('signatures','documents'),
      ('reports','reports'),
      ('invoices','documents'),
      ('payments','documents'),
      ('professionals','users')
    ) as x(table_name,module_key)
  loop
    execute format('drop policy if exists granular_allow_select on public.%I',r.table_name);
    execute format('drop policy if exists granular_enforce_select on public.%I',r.table_name);
    execute format('create policy granular_allow_select on public.%I for select to authenticated using (private.has_workspace_permission(workspace_id,%L,%L))',r.table_name,r.module_key,'view');
    execute format('create policy granular_enforce_select on public.%I as restrictive for select to authenticated using (private.has_workspace_permission(workspace_id,%L,%L))',r.table_name,r.module_key,'view');

    execute format('drop policy if exists granular_allow_insert on public.%I',r.table_name);
    execute format('drop policy if exists granular_enforce_insert on public.%I',r.table_name);
    execute format('create policy granular_allow_insert on public.%I for insert to authenticated with check (private.has_workspace_permission(workspace_id,%L,%L))',r.table_name,r.module_key,'create');
    execute format('create policy granular_enforce_insert on public.%I as restrictive for insert to authenticated with check (private.has_workspace_permission(workspace_id,%L,%L))',r.table_name,r.module_key,'create');

    execute format('drop policy if exists granular_allow_update on public.%I',r.table_name);
    execute format('drop policy if exists granular_enforce_update on public.%I',r.table_name);
    execute format('create policy granular_allow_update on public.%I for update to authenticated using (private.has_workspace_permission(workspace_id,%L,%L)) with check (private.has_workspace_permission(workspace_id,%L,%L))',r.table_name,r.module_key,'edit',r.module_key,'edit');
    execute format('create policy granular_enforce_update on public.%I as restrictive for update to authenticated using (private.has_workspace_permission(workspace_id,%L,%L)) with check (private.has_workspace_permission(workspace_id,%L,%L))',r.table_name,r.module_key,'edit',r.module_key,'edit');

    execute format('drop policy if exists granular_allow_delete on public.%I',r.table_name);
    execute format('drop policy if exists granular_enforce_delete on public.%I',r.table_name);
    execute format('create policy granular_allow_delete on public.%I for delete to authenticated using (private.has_workspace_permission(workspace_id,%L,%L))',r.table_name,r.module_key,'delete');
    execute format('create policy granular_enforce_delete on public.%I as restrictive for delete to authenticated using (private.has_workspace_permission(workspace_id,%L,%L))',r.table_name,r.module_key,'delete');
  end loop;
end $$;

-- Home visits preserve assignment-level visibility and editing.
create policy home_visits_granular_manager_read on public.home_visits
for select to authenticated
using(private.has_workspace_permission(workspace_id,'domicilios','view')
  and private.has_workspace_permission(workspace_id,'domicilios','manage'));
create policy home_visits_granular_create on public.home_visits
for insert to authenticated
with check(private.has_workspace_permission(workspace_id,'domicilios','create'));
create policy home_visits_granular_manager_update on public.home_visits
for update to authenticated
using(private.has_workspace_permission(workspace_id,'domicilios','edit')
  and private.has_workspace_permission(workspace_id,'domicilios','manage'))
with check(private.has_workspace_permission(workspace_id,'domicilios','edit'));
create policy home_visits_granular_delete on public.home_visits
for delete to authenticated
using(private.has_workspace_permission(workspace_id,'domicilios','delete'));

create policy home_visits_permission_scope on public.home_visits
as restrictive for select to authenticated
using(private.has_workspace_permission(workspace_id,'domicilios','view')
  and (
    private.has_workspace_permission(workspace_id,'domicilios','manage')
    or public.is_current_home_visit_assignee(workspace_id,id,(select auth.uid()),array['invited','accepted']::text[])
  ));
create policy home_visits_permission_insert_scope on public.home_visits
as restrictive for insert to authenticated
with check(private.has_workspace_permission(workspace_id,'domicilios','create'));
create policy home_visits_permission_update_scope on public.home_visits
as restrictive for update to authenticated
using(private.has_workspace_permission(workspace_id,'domicilios','edit')
  and (
    private.has_workspace_permission(workspace_id,'domicilios','manage')
    or public.is_current_home_visit_assignee(workspace_id,id,(select auth.uid()),array['accepted']::text[])
  ))
with check(private.has_workspace_permission(workspace_id,'domicilios','edit'));
create policy home_visits_permission_delete_scope on public.home_visits
as restrictive for delete to authenticated
using(private.has_workspace_permission(workspace_id,'domicilios','delete'));

create policy home_visit_assignments_granular_read on public.home_visit_assignments
for select to authenticated
using(private.has_workspace_permission(workspace_id,'domicilios','view')
  and (private.has_workspace_permission(workspace_id,'domicilios','manage')
    or public.is_current_home_visit_assignee(workspace_id,home_visit_id,(select auth.uid()),array['invited','accepted']::text[])));
create policy home_visit_assignments_granular_insert on public.home_visit_assignments
for insert to authenticated
with check(private.has_workspace_permission(workspace_id,'domicilios','assign')
  or private.has_workspace_permission(workspace_id,'domicilios','manage'));
create policy home_visit_assignments_permission_scope on public.home_visit_assignments
as restrictive for select to authenticated
using(private.has_workspace_permission(workspace_id,'domicilios','view')
  and (private.has_workspace_permission(workspace_id,'domicilios','manage')
    or public.is_current_home_visit_assignee(workspace_id,home_visit_id,(select auth.uid()),array['invited','accepted']::text[])));
create policy home_visit_assignments_permission_insert_scope on public.home_visit_assignments
as restrictive for insert to authenticated
with check(private.has_workspace_permission(workspace_id,'domicilios','assign')
  or private.has_workspace_permission(workspace_id,'domicilios','manage'));
create policy home_visit_assignments_permission_update_scope on public.home_visit_assignments
as restrictive for update to authenticated
using(private.has_workspace_permission(workspace_id,'domicilios','edit')
  and (private.has_workspace_permission(workspace_id,'domicilios','manage') or assigned_user_id=(select auth.uid())))
with check(private.has_workspace_permission(workspace_id,'domicilios','edit')
  and (private.has_workspace_permission(workspace_id,'domicilios','manage') or assigned_user_id=(select auth.uid())));
create policy home_visit_assignments_granular_update on public.home_visit_assignments
for update to authenticated
using(private.has_workspace_permission(workspace_id,'domicilios','edit')
  and (private.has_workspace_permission(workspace_id,'domicilios','manage') or assigned_user_id=(select auth.uid())))
with check(private.has_workspace_permission(workspace_id,'domicilios','edit')
  and (private.has_workspace_permission(workspace_id,'domicilios','manage') or assigned_user_id=(select auth.uid())));
create policy home_visit_assignments_granular_delete on public.home_visit_assignments
for delete to authenticated using(private.has_workspace_permission(workspace_id,'domicilios','delete'));
create policy home_visit_assignments_permission_delete_scope on public.home_visit_assignments
as restrictive for delete to authenticated using(private.has_workspace_permission(workspace_id,'domicilios','delete'));

create policy home_visit_tests_granular_read on public.home_visit_tests
for select to authenticated
using(private.has_workspace_permission(workspace_id,'domicilios','view')
  and (private.has_workspace_permission(workspace_id,'domicilios','manage')
    or public.is_current_home_visit_assignee(workspace_id,home_visit_id,(select auth.uid()),array['invited','accepted']::text[])));
create policy home_visit_tests_granular_insert on public.home_visit_tests
for insert to authenticated
with check(private.has_workspace_permission(workspace_id,'domicilios','create')
  and (private.has_workspace_permission(workspace_id,'domicilios','manage')
    or (source='additional' and public.is_current_home_visit_assignee(workspace_id,home_visit_id,(select auth.uid()),array['accepted']::text[]))));
create policy home_visit_tests_permission_scope on public.home_visit_tests
as restrictive for select to authenticated
using(private.has_workspace_permission(workspace_id,'domicilios','view')
  and (private.has_workspace_permission(workspace_id,'domicilios','manage')
    or public.is_current_home_visit_assignee(workspace_id,home_visit_id,(select auth.uid()),array['invited','accepted']::text[])));
create policy home_visit_tests_permission_insert_scope on public.home_visit_tests
as restrictive for insert to authenticated
with check(private.has_workspace_permission(workspace_id,'domicilios','create')
  and (private.has_workspace_permission(workspace_id,'domicilios','manage')
    or (source='additional' and public.is_current_home_visit_assignee(workspace_id,home_visit_id,(select auth.uid()),array['accepted']::text[]))));
create policy home_visit_tests_permission_update_scope on public.home_visit_tests
as restrictive for update to authenticated
using(private.has_workspace_permission(workspace_id,'domicilios','edit')
  and (private.has_workspace_permission(workspace_id,'domicilios','manage')
    or public.is_current_home_visit_assignee(workspace_id,home_visit_id,(select auth.uid()),array['accepted']::text[])))
with check(private.has_workspace_permission(workspace_id,'domicilios','edit')
  and (private.has_workspace_permission(workspace_id,'domicilios','manage')
    or public.is_current_home_visit_assignee(workspace_id,home_visit_id,(select auth.uid()),array['accepted']::text[])));
create policy home_visit_tests_permission_delete_scope on public.home_visit_tests
as restrictive for delete to authenticated
using(private.has_workspace_permission(workspace_id,'domicilios','delete'));
create policy home_visit_tests_granular_update on public.home_visit_tests
for update to authenticated
using(private.has_workspace_permission(workspace_id,'domicilios','edit')
  and (private.has_workspace_permission(workspace_id,'domicilios','manage')
    or public.is_current_home_visit_assignee(workspace_id,home_visit_id,(select auth.uid()),array['accepted']::text[])))
with check(private.has_workspace_permission(workspace_id,'domicilios','edit')
  and (private.has_workspace_permission(workspace_id,'domicilios','manage')
    or public.is_current_home_visit_assignee(workspace_id,home_visit_id,(select auth.uid()),array['accepted']::text[])));
create policy home_visit_tests_granular_delete on public.home_visit_tests
for delete to authenticated using(private.has_workspace_permission(workspace_id,'domicilios','delete'));

create policy home_visit_events_granular_read on public.home_visit_events
for select to authenticated
using(private.has_workspace_permission(workspace_id,'domicilios','view')
  and (private.has_workspace_permission(workspace_id,'domicilios','manage')
    or public.is_current_home_visit_assignee(workspace_id,home_visit_id,(select auth.uid()),array['invited','accepted']::text[])));
create policy home_visit_events_granular_insert on public.home_visit_events
for insert to authenticated
with check(private.has_workspace_permission(workspace_id,'domicilios','create')
  and (private.has_workspace_permission(workspace_id,'domicilios','manage')
    or public.is_current_home_visit_assignee(workspace_id,home_visit_id,(select auth.uid()),array['accepted']::text[])));
create policy home_visit_events_permission_scope on public.home_visit_events
as restrictive for select to authenticated
using(private.has_workspace_permission(workspace_id,'domicilios','view')
  and (private.has_workspace_permission(workspace_id,'domicilios','manage')
    or public.is_current_home_visit_assignee(workspace_id,home_visit_id,(select auth.uid()),array['invited','accepted']::text[])));
create policy home_visit_events_permission_insert_scope on public.home_visit_events
as restrictive for insert to authenticated
with check(private.has_workspace_permission(workspace_id,'domicilios','create')
  and (private.has_workspace_permission(workspace_id,'domicilios','manage')
    or public.is_current_home_visit_assignee(workspace_id,home_visit_id,(select auth.uid()),array['accepted']::text[])));

create policy home_visit_documents_granular_read on public.home_visit_documents
for select to authenticated
using(private.has_workspace_permission(workspace_id,'domicilios','view')
  and (private.has_workspace_permission(workspace_id,'domicilios','manage')
    or public.is_current_home_visit_assignee(workspace_id,home_visit_id,(select auth.uid()),array['accepted']::text[])));
create policy home_visit_documents_granular_insert on public.home_visit_documents
for insert to authenticated
with check(private.has_workspace_permission(workspace_id,'domicilios','create')
  and uploaded_by=(select auth.uid())
  and (private.has_workspace_permission(workspace_id,'domicilios','manage')
    or public.is_current_home_visit_assignee(workspace_id,home_visit_id,(select auth.uid()),array['accepted']::text[])));
create policy home_visit_documents_permission_scope on public.home_visit_documents
as restrictive for select to authenticated
using(private.has_workspace_permission(workspace_id,'domicilios','view')
  and (private.has_workspace_permission(workspace_id,'domicilios','manage')
    or public.is_current_home_visit_assignee(workspace_id,home_visit_id,(select auth.uid()),array['accepted']::text[])));
create policy home_visit_documents_permission_insert_scope on public.home_visit_documents
as restrictive for insert to authenticated
with check(private.has_workspace_permission(workspace_id,'domicilios','create')
  and uploaded_by=(select auth.uid())
  and (private.has_workspace_permission(workspace_id,'domicilios','manage')
    or public.is_current_home_visit_assignee(workspace_id,home_visit_id,(select auth.uid()),array['accepted']::text[])));
create policy home_visit_documents_permission_delete_scope on public.home_visit_documents
as restrictive for delete to authenticated
using(private.has_workspace_permission(workspace_id,'domicilios','delete'));
create policy home_visit_documents_granular_delete on public.home_visit_documents
for delete to authenticated using(private.has_workspace_permission(workspace_id,'domicilios','delete'));

create or replace function private.audit_approval_request()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  insert into public.audit_logs(workspace_id,actor_id,actor_name,entity_table,entity_id,action,changed_fields,details)
  values(
    new.workspace_id,
    coalesce((select auth.uid()),new.approved_by,new.requested_by),
    '',
    'approval_requests',
    new.id,
    case when tg_op='INSERT' then 'approval_requested' else 'approval_'||new.status end,
    array['status'],
    jsonb_build_object('module',new.module_key,'action',new.action_key,'requester',new.requested_by,'approver',new.approved_by,'reason',new.reason,'decision_note',new.decision_note)
  );
  return new;
end;
$$;
revoke all on function private.audit_approval_request() from public,anon,authenticated;
drop trigger if exists audit_approval_request_changes on public.approval_requests;
create trigger audit_approval_request_changes
after insert or update of status on public.approval_requests
for each row execute function private.audit_approval_request();
