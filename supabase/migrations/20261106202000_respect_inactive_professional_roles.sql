-- Inactive cargo definitions must no longer contribute permissions or privileged roles.
create or replace function private.member_has_workspace_role(
 p_workspace_id uuid,p_user_id uuid,p_allowed_roles text[]
) returns boolean language sql stable security definer set search_path=''
as $$
 select exists(
  select 1 from public.workspace_members wm
  where wm.workspace_id=p_workspace_id and wm.user_id=p_user_id and wm.active
   and (
    exists(select 1 from public.workspace_roles wr
      where wr.workspace_id=wm.workspace_id and wr.role_key=wm.role
       and wr.active and wr.role_key=any(p_allowed_roles))
    or exists(
      select 1 from public.workspace_member_roles wmr
      join public.workspace_roles wr
       on wr.workspace_id=wmr.workspace_id and wr.role_key=wmr.role_key and wr.active
      where wmr.workspace_id=wm.workspace_id and wmr.user_id=wm.user_id
       and wmr.role_key=any(p_allowed_roles)
    )
   )
 );
$$;

create or replace function private.has_workspace_permission(
 p_workspace_id uuid,p_module_key text,p_action_key text,p_site_id uuid default null
) returns boolean language sql stable security definer set search_path=''
as $$
 select exists(
  select 1 from public.workspace_members wm
  where wm.workspace_id=p_workspace_id and wm.user_id=(select auth.uid()) and wm.active
   and (
    private.member_has_workspace_role(p_workspace_id,(select auth.uid()),array['admin']::text[])
    or coalesce(
     (select mp.allowed from public.member_permissions mp
      where mp.workspace_id=p_workspace_id and mp.user_id=(select auth.uid())
       and mp.module_key=p_module_key and mp.action_key=p_action_key
       and (mp.site_id is null or mp.site_id=p_site_id)
      order by (mp.site_id is not null) desc limit 1),
     (select bool_or(rp.allowed)
      from public.workspace_member_roles wmr
      join public.workspace_roles wr on wr.workspace_id=wmr.workspace_id and wr.role_key=wmr.role_key and wr.active
      join public.role_permissions rp on rp.workspace_id=wmr.workspace_id and rp.role_key=wmr.role_key
      where wmr.workspace_id=p_workspace_id and wmr.user_id=(select auth.uid())
       and rp.module_key=p_module_key and rp.action_key=p_action_key),
     (select rp.allowed from public.role_permissions rp
      join public.workspace_roles wr on wr.workspace_id=rp.workspace_id and wr.role_key=rp.role_key and wr.active
      where rp.workspace_id=p_workspace_id and rp.role_key=wm.role
       and rp.module_key=p_module_key and rp.action_key=p_action_key limit 1),
     false
    )
   )
 );
$$;
