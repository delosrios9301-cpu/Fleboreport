-- A change of primary role must not silently preserve the former role as an extra privilege.
create or replace function private.sync_primary_workspace_role()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 delete from public.workspace_member_roles
 where workspace_id=new.workspace_id and user_id=new.user_id
   and is_primary=true and role_key<>new.role;
 insert into public.workspace_member_roles(workspace_id,user_id,role_key,is_primary)
 values(new.workspace_id,new.user_id,new.role,true)
 on conflict(workspace_id,user_id,role_key) do update set is_primary=true;
 return new;
end $$;
