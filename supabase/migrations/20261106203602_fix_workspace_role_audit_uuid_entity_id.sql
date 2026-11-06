-- Fix role-assignment audit: audit_logs.entity_id is UUID, not text.
create or replace function private.audit_workspace_member_role()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
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
 values(v_workspace,v_actor,coalesce(v_name,''),'workspace_member_roles',v_user,v_action,
  array['role_key','is_primary'],jsonb_build_object('user_id',v_user,'role_key',v_role,'is_primary',v_primary));
 if tg_op='DELETE' then return old; end if;
 return new;
end $function$;
