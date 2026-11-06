create or replace function public.get_workspace_profile_names(p_workspace_id uuid)
returns table(user_id uuid, display_name text, username text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.active = true
  ) then
    raise exception 'Not an active member of this workspace';
  end if;

  return query
  select
    u.id,
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      'Usuario'
    )::text,
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'username'), ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), '')
    )::text
  from public.workspace_members wm
  join auth.users u on u.id = wm.user_id
  where wm.workspace_id = p_workspace_id
    and wm.active = true;
end;
$$;

revoke all on function public.get_workspace_profile_names(uuid) from public;
revoke all on function public.get_workspace_profile_names(uuid) from anon;
grant execute on function public.get_workspace_profile_names(uuid) to authenticated;
