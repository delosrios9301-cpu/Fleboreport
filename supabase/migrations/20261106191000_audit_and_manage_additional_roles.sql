-- Audit and atomic server-side assignment of additional professional roles.
create or replace function private.audit_workspace_member_role()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
 v_workspace uuid; v_user uuid; v_role text; v_actor uuid; v_action text; v_name text; v_primary boolean;
begin
 if tg_op='DELETE' then
  v_workspace:=old.workspace_id; v_user:=old.user_id; v_role:=old.role_key;
  v_actor:=coalesce(old.assigned_by,(select auth.uid())); v_action:='cargo_retirado'; v_primary:=old.is_primary;
 else
  v_workspace:=new.workspace_id; v_user:=new.user_id; v_role:=new.role_key;
  v_actor:=coalesce(new.assigned_by,(select auth.uid()));
  v_action:=case when new.is_primary then 'cargo_principal_asignado' else 'cargo_adicional_asignado' end;
  v_primary:=new.is_primary;
 end if;
 select coalesce(p.display_name,'') into v_name from public.profiles p where p.user_id=v_actor;
 insert into public.audit_logs(workspace_id,actor_id,actor_name,entity_table,entity_id,action,changed_fields,details)
 values(v_workspace,v_actor,coalesce(v_name,''),'workspace_member_roles',v_user::text,v_action,
  array['role_key','is_primary'],jsonb_build_object('user_id',v_user,'role_key',v_role,'is_primary',v_primary));
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
drop trigger if exists audit_workspace_member_role on public.workspace_member_roles;
create trigger audit_workspace_member_role after insert or delete on public.workspace_member_roles
for each row execute function private.audit_workspace_member_role();

create or replace function public.admin_set_member_roles(
 p_workspace_id uuid,p_actor_id uuid,p_user_id uuid,p_additional_role_keys text[]
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_primary text; v_keys text[]:=coalesce(p_additional_role_keys,array[]::text[]); v_count integer;
begin
 if not private.member_has_workspace_role(p_workspace_id,p_actor_id,array['admin']::text[]) then
  raise exception 'Solo un administrador activo puede asignar cargos.';
 end if;
 select role into v_primary from public.workspace_members
 where workspace_id=p_workspace_id and user_id=p_user_id and active=true;
 if v_primary is null then raise exception 'El usuario no pertenece activamente a este espacio.'; end if;
 if p_user_id=(select owner_user_id from public.workspaces where id=p_workspace_id) then
  raise exception 'La cuenta del administrador principal está protegida.';
 end if;
 if 'admin'=any(v_keys) then raise exception 'Administrador se gestiona como cargo principal protegido.'; end if;
 if v_primary=any(v_keys) then raise exception 'El cargo principal no debe repetirse como cargo adicional.'; end if;
 if exists(select 1 from unnest(v_keys) k left join public.workspace_roles wr
  on wr.workspace_id=p_workspace_id and wr.role_key=k
  where wr.role_key is null or wr.active=false) then
  raise exception 'Uno o más cargos no existen o están inactivos.';
 end if;
 delete from public.workspace_member_roles
 where workspace_id=p_workspace_id and user_id=p_user_id and is_primary=false
 and not (role_key=any(v_keys));
 insert into public.workspace_member_roles(workspace_id,user_id,role_key,is_primary,assigned_by)
 select p_workspace_id,p_user_id,k,false,p_actor_id
 from (select distinct unnest(v_keys) k) x
 on conflict(workspace_id,user_id,role_key) do update
 set is_primary=false,assigned_by=excluded.assigned_by;
 select count(*) into v_count from public.workspace_member_roles
 where workspace_id=p_workspace_id and user_id=p_user_id;
 return jsonb_build_object('ok',true,'assigned_roles',v_count);
end $$;
revoke all on function public.admin_set_member_roles(uuid,uuid,uuid,text[]) from public,anon,authenticated;
grant execute on function public.admin_set_member_roles(uuid,uuid,uuid,text[]) to service_role;
revoke all on function private.audit_workspace_member_role() from public,anon,authenticated;
