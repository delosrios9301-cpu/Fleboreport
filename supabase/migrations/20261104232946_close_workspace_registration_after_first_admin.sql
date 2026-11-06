create or replace function public.create_workspace(workspace_name text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  new_id uuid;
  actor uuid;
begin
  actor := (select auth.uid());

  if actor is null then
    raise exception 'Authentication required';
  end if;

  if length(trim(coalesce(workspace_name, ''))) < 2 then
    raise exception 'Workspace name is required';
  end if;

  -- Serialize first-workspace creation so two simultaneous registrations
  -- cannot both become the initial workspace administrator.
  perform pg_advisory_xact_lock(hashtextextended('fleboreport:first-workspace', 0));

  if exists (select 1 from public.workspaces limit 1) then
    raise exception 'Workspace registration is closed. Contact the system administrator.';
  end if;

  insert into public.workspaces(name, owner_user_id)
  values (trim(workspace_name), actor)
  returning id into new_id;

  insert into public.workspace_members(workspace_id, user_id, role)
  values (new_id, actor, 'admin');

  return new_id;
end;
$function$;

revoke all on function public.create_workspace(text) from public, anon;
grant execute on function public.create_workspace(text) to authenticated, service_role;