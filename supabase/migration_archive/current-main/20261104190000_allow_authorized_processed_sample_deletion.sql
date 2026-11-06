-- Allow audited sample deletion after processing only for members with processing.delete.
begin;
create or replace function public.delete_clinical_sample(
  p_workspace_id uuid,
  p_sample_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_sample public.clinical_samples%rowtype;
  v_actor_name text;
  v_reason text := nullif(trim(coalesce(p_reason,'')),'');
begin
  if v_actor is null then raise exception 'Se requiere una sesión autenticada'; end if;
  if not private.has_workspace_permission(p_workspace_id,'processing','delete',null) then
    raise exception 'No tiene permiso para eliminar muestras del procesamiento';
  end if;
  if v_reason is null or length(v_reason)<5 then
    raise exception 'Indique el motivo de eliminación (mínimo 5 caracteres)';
  end if;
  select * into v_sample from public.clinical_samples
  where workspace_id=p_workspace_id and id=p_sample_id for update;
  if not found then raise exception 'La muestra no existe en este espacio de trabajo'; end if;
  if v_sample.deleted_at is not null then
    return jsonb_build_object('ok',true,'already_deleted',true,'sample_id',v_sample.id);
  end if;
  select coalesce(pr.display_name,'Usuario') into v_actor_name
  from public.profiles pr where pr.user_id=v_actor;
  update public.clinical_samples
  set deleted_at=now(),deleted_by=v_actor,deletion_reason=v_reason,updated_at=now()
  where workspace_id=p_workspace_id and id=p_sample_id;
  insert into public.clinical_sample_events(workspace_id,sample_id,previous_status,next_status,notes,actor_id,occurred_at)
  values(p_workspace_id,p_sample_id,v_sample.workflow_status,'ELIMINADA',v_reason,v_actor,now());
  insert into public.audit_logs(workspace_id,actor_id,actor_name,entity_table,entity_id,action,changed_fields,occurred_at,details)
  values(p_workspace_id,v_actor,coalesce(v_actor_name,'Usuario'),'clinical_samples',p_sample_id,
    'sample_deleted',array['deleted_at','deleted_by','deletion_reason'],now(),
    jsonb_build_object('legacy_id',v_sample.legacy_id,'subject_code',v_sample.subject_code,
      'workflow_status',v_sample.workflow_status,'reason',v_reason));
  return jsonb_build_object('ok',true,'sample_id',p_sample_id,'deleted_at',now());
end;
$$;
revoke all on function public.delete_clinical_sample(uuid,uuid,text) from public, anon;
grant execute on function public.delete_clinical_sample(uuid,uuid,text) to authenticated;
commit;
