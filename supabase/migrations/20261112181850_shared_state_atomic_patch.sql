-- Atomic top-level JSON patch for FleboReport shared workspace state.
-- Maintains the existing save_workspace_shared_app_state permissions, patient
-- deletion guard, revision CAS and reset_epoch. No clinical rows are rewritten.
create or replace function public.save_workspace_shared_app_state_patch(
 p_workspace_id uuid,p_patch jsonb,p_expected_revision integer
) returns table(saved boolean,revision integer)
language plpgsql security definer set search_path=''
as $patch$
declare
 v_uid uuid:=auth.uid();
 v_revision integer;
 v_state jsonb;
begin
 if v_uid is null then
  raise exception 'Se requiere una sesión autenticada';
 end if;
 if not private.member_has_workspace_role(p_workspace_id,v_uid,array['admin','clinician','reception']::text[]) then
  raise exception 'No tienes permiso para modificar el estado compartido';
 end if;
 if p_patch is null or jsonb_typeof(p_patch)<>'object' then
  raise exception 'El cambio debe ser un objeto JSON';
 end if;
 if pg_column_size(p_patch)>6500000 then
  raise exception 'Cambio demasiado grande para una sincronización segura';
 end if;
 if exists(
  select 1 from jsonb_object_keys(p_patch) as changed(key)
  where key='auditLog' or key='reset_epoch'
     or key like '\_clinicalCloudSync%' escape '\'
 ) then
  raise exception 'La actualización incluye claves locales o protegidas';
 end if;
 if not exists(select 1 from public.workspace_shared_app_state s where s.workspace_id=p_workspace_id) then
  perform * from public.get_workspace_shared_app_state(p_workspace_id);
 end if;
 select s.state,s.revision into v_state,v_revision
 from public.workspace_shared_app_state s where s.workspace_id=p_workspace_id for update;
 if p_expected_revision is distinct from v_revision then
  return query select false,v_revision;return;
 end if;
 if (coalesce(v_state,'{}'::jsonb)||p_patch) is not distinct from v_state then
  return query select true,v_revision;return;
 end if;
 -- The original function validates authorization, patient integrity and
 -- transactional optimistic concurrency. Never duplicate or bypass it here.
 return query select * from public.save_workspace_shared_app_state(
  p_workspace_id,coalesce(v_state,'{}'::jsonb)||p_patch,v_revision
 );
end;
$patch$;
revoke all on function public.save_workspace_shared_app_state_patch(uuid,jsonb,integer)
 from public,anon;
grant execute on function public.save_workspace_shared_app_state_patch(uuid,jsonb,integer)
 to authenticated,service_role;
