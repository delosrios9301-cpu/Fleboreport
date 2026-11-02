-- Make NULL site scope unique so per-user permission matrices can be saved in one upsert.
drop index if exists public.member_permissions_unique_scope;
alter table public.member_permissions
  add constraint member_permissions_unique_scope
  unique nulls not distinct (workspace_id,user_id,module_key,action_key,site_id);
