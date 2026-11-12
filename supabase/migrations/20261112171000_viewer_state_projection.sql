-- Security regression: viewer role must not receive the full shared clinical snapshot.
-- Only an authorized reports view is projected, and no data rows are mutated.
CREATE OR REPLACE FUNCTION public.get_workspace_shared_app_state(p_workspace_id uuid)
 RETURNS TABLE(state jsonb, revision integer, updated_at timestamp with time zone, reset_epoch uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_state jsonb:='{}'::jsonb;
  v_epoch uuid;
  v_revision integer;
  v_updated timestamptz;
  v_row public.workspace_shared_app_state%rowtype;
  v_legacy record;
begin
  if v_uid is null then raise exception 'Se requiere una sesión autenticada'; end if;
  if not private.member_has_workspace_role(p_workspace_id,v_uid,array['admin','clinician','reception','viewer']::text[]) then
    raise exception 'No tienes permiso para consultar el estado compartido';
  end if;
  select * into v_row from public.workspace_shared_app_state s where s.workspace_id=p_workspace_id;
  if not found then
    for v_legacy in
      select s.state,s.reset_epoch,s.updated_at
      from public.workspace_app_state s
      join public.workspace_members wm on wm.workspace_id=s.workspace_id and wm.user_id=s.user_id and wm.active
      where s.workspace_id=p_workspace_id
        and private.member_has_workspace_role(p_workspace_id,s.user_id,array['admin','clinician','reception']::text[])
      order by s.updated_at asc,s.user_id
    loop
      v_state:=private.merge_workspace_app_state_jsonb(v_state,coalesce(v_legacy.state,'{}'::jsonb));
      if v_legacy.reset_epoch is not null then v_epoch:=v_legacy.reset_epoch; end if;
      v_updated:=greatest(coalesce(v_updated,'-infinity'::timestamptz),v_legacy.updated_at);
    end loop;
    insert into public.workspace_shared_app_state(workspace_id,state,revision,updated_by,updated_at,reset_epoch)
    values(p_workspace_id,v_state,1,v_uid,coalesce(v_updated,now()),v_epoch)
    on conflict(workspace_id) do nothing;
    select * into v_row from public.workspace_shared_app_state s where s.workspace_id=p_workspace_id;
  end if;
  -- Un visor sin privilegios operativos solo recibe el material de reportes
  -- cuando tiene permiso explícito. No devolver pacientes, domicilios ni
  -- catálogos clínicos a un usuario con rol viewer de solo lectura.
  if private.member_has_workspace_role(p_workspace_id,v_uid,array['viewer']::text[])
     and not private.member_has_workspace_role(p_workspace_id,v_uid,array['admin','clinician','reception']::text[]) then
    v_state:='{}'::jsonb;
    if private.has_workspace_permission(p_workspace_id,'reports','view') then
      v_state:=jsonb_build_object(
        'reportHistory',coalesce(v_row.state->'reportHistory','[]'::jsonb),
        'reportHistoryLogos',coalesce(v_row.state->'reportHistoryLogos','{}'::jsonb)
      );
    end if;
    return query select v_state,v_row.revision,v_row.updated_at,v_row.reset_epoch;
    return;
  end if;
  return query select v_row.state,v_row.revision,v_row.updated_at,v_row.reset_epoch;
end;
$function$

revoke execute on function public.get_workspace_shared_app_state(uuid) from public,anon;
grant execute on function public.get_workspace_shared_app_state(uuid) to authenticated,service_role;
