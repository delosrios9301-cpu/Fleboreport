
create or replace function private.reset_workspace_operational_data(p_workspace_id uuid,p_confirmation text)
returns table(backup_id uuid,deleted_tables integer,deleted_rows bigint,reset_epoch uuid)
language plpgsql security definer set search_path=''
as $$
declare
 v_uid uuid:=auth.uid(); v_owner uuid; v_primary uuid;
 v_epoch uuid:=gen_random_uuid(); v_backup uuid:=gen_random_uuid();
 v_snapshot jsonb:='{}'::jsonb; v_snapshot_value jsonb;
 v_tables text[]; v_table text; v_candidate text; v_remaining text[];
 v_rows bigint:=0; v_count bigint; v_deleted_tables integer:=0; v_actor text;
begin
 if v_uid is null then raise exception 'Debes iniciar sesión para restablecer FleboReport.'; end if;
 if p_confirmation is distinct from 'RESTABLECER FLEBOREPORT' then raise exception 'La frase de confirmación no coincide.'; end if;
 select w.owner_user_id,s.primary_admin_user_id into v_owner,v_primary
 from public.workspaces w join public.workspace_security_settings s on s.workspace_id=w.id
 where w.id=p_workspace_id for update of w,s;
 if not found then raise exception 'No se encontró el espacio de trabajo o su configuración de seguridad.'; end if;
 if v_uid<>v_owner or v_uid<>v_primary or not public.has_workspace_role(p_workspace_id,array['admin']::text[]) then
   raise exception 'Solo el administrador principal protegido puede ejecutar el restablecimiento.';
 end if;
 select array_agg(c.table_name order by c.table_name) into v_tables
 from information_schema.columns c
 where c.table_schema='public' and c.column_name='workspace_id'
 and c.table_name not in ('workspaces','workspace_members','role_permissions','member_permissions','sedes','user_sedes','workspace_security_settings','workspace_app_state');
 if coalesce(array_length(v_tables,1),0)=0 then raise exception 'No se encontraron tablas operativas para respaldar.'; end if;
 foreach v_table in array v_tables loop
   execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t where t.workspace_id=$1',v_table)
   into v_snapshot_value using p_workspace_id;
   v_snapshot:=v_snapshot||jsonb_build_object(v_table,coalesce(v_snapshot_value,'[]'::jsonb));
 end loop;
 insert into private.workspace_reset_backups(id,workspace_id,created_by,reset_epoch,snapshot)
 values(v_backup,p_workspace_id,v_uid,v_epoch,v_snapshot);
 v_remaining:=v_tables;
 while coalesce(array_length(v_remaining,1),0)>0 loop
   v_candidate:=null;
   foreach v_table in array v_remaining loop
     if not exists(
       select 1 from pg_constraint fk
       join pg_class child_rel on child_rel.oid=fk.conrelid
       join pg_namespace child_ns on child_ns.oid=child_rel.relnamespace
       join pg_class parent_rel on parent_rel.oid=fk.confrelid
       join pg_namespace parent_ns on parent_ns.oid=parent_rel.relnamespace
       where fk.contype='f' and child_ns.nspname='public' and parent_ns.nspname='public'
       and parent_rel.relname=v_table and child_rel.relname=any(v_remaining)
       and child_rel.relname<>v_table
     ) then v_candidate:=v_table; exit; end if;
   end loop;
   if v_candidate is null then raise exception 'No se pudo ordenar la eliminación por dependencias. No se eliminó ningún dato.'; end if;
   execute format('delete from public.%I where workspace_id=$1',v_candidate) using p_workspace_id;
   get diagnostics v_count=row_count;
   v_rows:=v_rows+v_count; v_deleted_tables:=v_deleted_tables+1;
   v_remaining:=array_remove(v_remaining,v_candidate);
 end loop;
 -- Create a fresh empty cloud-state row for every member, including users who never synced before.
 insert into public.workspace_app_state(workspace_id,user_id,state,revision,updated_by,updated_at,reset_epoch)
 select p_workspace_id,wm.user_id,'{}'::jsonb,1,v_uid,now(),v_epoch
 from public.workspace_members wm where wm.workspace_id=p_workspace_id
 on conflict(workspace_id,user_id) do update
 set state='{}'::jsonb,
     revision=public.workspace_app_state.revision+1,
     updated_by=excluded.updated_by,
     updated_at=excluded.updated_at,
     reset_epoch=excluded.reset_epoch;
 select coalesce(p.display_name,p.username,p.email,'Administrador') into v_actor from public.profiles p where p.user_id=v_uid;
 v_actor:=coalesce(v_actor,'Administrador');
 insert into public.audit_logs(workspace_id,actor_id,actor_name,entity_table,entity_id,action,occurred_at,details)
 values(p_workspace_id,v_uid,v_actor,'workspace',p_workspace_id,'FULL_OPERATIONAL_RESET',now(),
 jsonb_build_object('backup_id',v_backup,'reset_epoch',v_epoch,'deleted_tables',v_deleted_tables,'deleted_rows',v_rows,
 'preserved',jsonb_build_array('auth.users','workspace_members','role_permissions','member_permissions','sedes','user_sedes','workspace_security_settings')));
 update private.workspace_reset_backups set deleted_tables=v_deleted_tables,deleted_rows=v_rows where id=v_backup;
 return query select v_backup,v_deleted_tables,v_rows,v_epoch;
end;
$$;
