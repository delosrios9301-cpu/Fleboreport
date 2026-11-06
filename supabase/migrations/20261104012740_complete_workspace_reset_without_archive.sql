-- Full clean-slate reset requested for FleboReport.
-- The owner identity and access/security shell are retained so the administrator can sign in again.
create or replace function private.reset_workspace_completely(p_workspace_id uuid,p_confirmation text)
returns table(deleted_tables integer,deleted_rows bigint,reset_epoch uuid)
language plpgsql security definer set search_path=''
as $$
declare
 v_uid uuid:=auth.uid(); v_owner uuid; v_primary uuid;
 v_epoch uuid:=gen_random_uuid();
 v_tables text[]; v_table text; v_candidate text; v_remaining text[];
 v_rows bigint:=0; v_count bigint; v_deleted_tables integer:=0;
begin
 if v_uid is null then raise exception 'Debes iniciar sesión para borrar los datos.'; end if;
 if p_confirmation is distinct from 'BORRAR TODO EL ESPACIO' then raise exception 'La frase de confirmación no coincide.'; end if;
 select w.owner_user_id,s.primary_admin_user_id into v_owner,v_primary
 from public.workspaces w join public.workspace_security_settings s on s.workspace_id=w.id
 where w.id=p_workspace_id for update of w,s;
 if not found then raise exception 'No se encontró el espacio de trabajo o su configuración de seguridad.'; end if;
 if v_uid<>v_owner or v_uid<>v_primary or not public.has_workspace_role(p_workspace_id,array['admin']::text[]) then
   raise exception 'Solo el administrador principal protegido puede borrar todos los datos.';
 end if;

 select array_agg(c.table_name order by c.table_name) into v_tables
 from information_schema.columns c
 where c.table_schema='public' and c.column_name='workspace_id'
 and c.table_name not in ('workspaces','workspace_members','workspace_security_settings','workspace_app_state','audit_logs');
 v_remaining:=coalesce(v_tables,array[]::text[]);

 -- The reset is intentionally destructive: no restore archive or operational audit trail is kept.
 alter table public.clinical_sample_events disable trigger trg_clinical_sample_events_immutable;
 alter table public.clinical_cryovial_events disable trigger trg_clinical_cryovial_events_immutable;
 alter table public.home_visit_events disable trigger home_visit_events_immutable;
 alter table public.inventory_movements disable trigger inventory_movements_immutable;
 alter table public.clinical_cryovials disable trigger clinical_sync_sample_storage;
 alter table public.audit_logs disable trigger audit_logs_immutable;

 -- Clear audit rows first so restrictive immutable triggers and site foreign keys do not block cleanup.
 delete from public.audit_logs where workspace_id=p_workspace_id;
 get diagnostics v_count=row_count;
 v_rows:=v_rows+v_count; v_deleted_tables:=v_deleted_tables+1;

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
   if v_candidate is null then raise exception 'No se pudo ordenar la eliminación por dependencias. No se modificó ningún dato.'; end if;
   execute format('delete from public.%I where workspace_id=$1',v_candidate) using p_workspace_id;
   get diagnostics v_count=row_count;
   v_rows:=v_rows+v_count; v_deleted_tables:=v_deleted_tables+1;
   v_remaining:=array_remove(v_remaining,v_candidate);
 end loop;

 delete from private.workspace_reset_backups where workspace_id=p_workspace_id;
 delete from public.workspace_members where workspace_id=p_workspace_id and user_id<>v_owner;
 get diagnostics v_count=row_count;
 v_rows:=v_rows+v_count; v_deleted_tables:=v_deleted_tables+1;
 delete from public.workspace_app_state where workspace_id=p_workspace_id and user_id<>v_owner;
 get diagnostics v_count=row_count;
 v_rows:=v_rows+v_count; v_deleted_tables:=v_deleted_tables+1;

 alter table public.clinical_sample_events enable trigger trg_clinical_sample_events_immutable;
 alter table public.clinical_cryovial_events enable trigger trg_clinical_cryovial_events_immutable;
 alter table public.home_visit_events enable trigger home_visit_events_immutable;
 alter table public.inventory_movements enable trigger inventory_movements_immutable;
 alter table public.clinical_cryovials enable trigger clinical_sync_sample_storage;
 alter table public.audit_logs enable trigger audit_logs_immutable;

 insert into public.workspace_app_state(workspace_id,user_id,state,revision,updated_by,updated_at,reset_epoch)
 select p_workspace_id,wm.user_id,'{}'::jsonb,1,v_uid,now(),v_epoch
 from public.workspace_members wm where wm.workspace_id=p_workspace_id and wm.user_id=v_owner
 on conflict(workspace_id,user_id) do update
 set state='{}'::jsonb,
     revision=public.workspace_app_state.revision+1,
     updated_by=excluded.updated_by,
     updated_at=excluded.updated_at,
     reset_epoch=excluded.reset_epoch;

 return query select v_deleted_tables,v_rows,v_epoch;
end;
$$;

revoke all on function private.reset_workspace_completely(uuid,text) from public,anon,authenticated;
grant execute on function private.reset_workspace_completely(uuid,text) to authenticated;

create or replace function public.reset_workspace_completely(p_workspace_id uuid,p_confirmation text)
returns table(deleted_tables integer,deleted_rows bigint,reset_epoch uuid)
language sql security definer set search_path=''
as $$
  select * from private.reset_workspace_completely(p_workspace_id,p_confirmation);
$$;
revoke all on function public.reset_workspace_completely(uuid,text) from public,anon;
grant execute on function public.reset_workspace_completely(uuid,text) to authenticated;

