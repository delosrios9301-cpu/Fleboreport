-- Atomic and verifiable save for per-user permission overrides.
-- Uses untargeted ON CONFLICT so PostgreSQL can resolve the expression-based
-- unique index that treats a NULL site_id as the workspace-wide scope.

create or replace function public.save_member_permissions(
  p_workspace_id uuid,
  p_user_id uuid,
  p_site_id uuid,
  p_permissions jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_count integer;
  requested_count integer;
begin
  if auth.uid() is null then
    raise exception 'Se requiere una sesión autenticada.';
  end if;
  if not public.has_workspace_role(p_workspace_id, array['admin']::text[]) then
    raise exception 'No tienes permisos para administrar los permisos del espacio de trabajo.';
  end if;
  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = p_user_id
      and wm.active = true
  ) then
    raise exception 'El usuario seleccionado no es un miembro activo de este espacio de trabajo.';
  end if;
  if p_site_id is not null and not exists (
    select 1 from public.sedes s
    where s.workspace_id = p_workspace_id and s.id = p_site_id
  ) then
    raise exception 'La sede seleccionada no pertenece a este espacio de trabajo.';
  end if;
  if jsonb_typeof(p_permissions) <> 'array' then
    raise exception 'La lista de permisos no tiene un formato válido.';
  end if;

  select count(*) into requested_count
  from jsonb_to_recordset(p_permissions) as x(module_key text, action_key text, allowed boolean);

  if requested_count = 0 then
    raise exception 'No se recibieron permisos para guardar.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_permissions) as x(module_key text, action_key text, allowed boolean)
    where coalesce(trim(module_key), '') = ''
       or coalesce(trim(action_key), '') = ''
       or allowed is null
  ) then
    raise exception 'Hay permisos incompletos o inválidos.';
  end if;

  insert into public.member_permissions(
    workspace_id, user_id, module_key, action_key, allowed, site_id, updated_by, updated_at
  )
  select p_workspace_id, p_user_id, x.module_key, x.action_key, x.allowed,
         p_site_id, auth.uid(), now()
  from jsonb_to_recordset(p_permissions) as x(
    module_key text, action_key text, allowed boolean
  )
  on conflict do update
    set allowed = excluded.allowed,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;

  get diagnostics saved_count = row_count;
  return jsonb_build_object('ok', saved_count = requested_count, 'saved', saved_count);
end;
$$;

revoke all on function public.save_member_permissions(uuid,uuid,uuid,jsonb) from public, anon;
grant execute on function public.save_member_permissions(uuid,uuid,uuid,jsonb) to authenticated;
