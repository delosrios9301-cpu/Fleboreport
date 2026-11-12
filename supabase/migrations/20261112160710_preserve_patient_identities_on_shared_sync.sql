-- High-integrity shared sync: preserve existing patient identities without delete privilege.
-- Runs only on writes, uses the row already locked by optimistic CAS.
CREATE OR REPLACE FUNCTION public.save_workspace_shared_app_state(p_workspace_id uuid, p_state jsonb, p_expected_revision integer)
 RETURNS TABLE(saved boolean, revision integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_revision integer;
  v_previous jsonb;
begin
  if v_uid is null then raise exception 'Se requiere una sesión autenticada'; end if;
  if not private.member_has_workspace_role(p_workspace_id,v_uid,array['admin','clinician','reception']::text[]) then
    raise exception 'No tienes permiso para modificar el estado compartido';
  end if;
  if p_state is null or jsonb_typeof(p_state)<>'object' then
    raise exception 'El estado de la aplicación debe ser un objeto JSON';
  end if;
  if not exists(select 1 from public.workspace_shared_app_state s where s.workspace_id=p_workspace_id) then
    perform * from public.get_workspace_shared_app_state(p_workspace_id);
  end if;
  select s.revision,s.state into v_revision,v_previous from public.workspace_shared_app_state s
    where s.workspace_id=p_workspace_id for update;
  if p_expected_revision is distinct from v_revision then
    return query select false,v_revision; return;
  end if;
  -- Una sincronización no puede omitir expedientes existentes si el usuario
  -- carece del permiso granular patients.delete. Las identidades se comparan
  -- por cédula normalizada o ID para admitir correcciones/deduplicaciones.
  if not private.has_workspace_permission(p_workspace_id,'patients','delete')
     and jsonb_typeof(v_previous->'patients')='array' then
    if exists (
      select 1
      from jsonb_array_elements(v_previous->'patients') as previous_patient(value)
      where not exists (
        select 1 from jsonb_array_elements(
          case when jsonb_typeof(p_state->'patients')='array'
            then p_state->'patients' else '[]'::jsonb end
        ) as incoming_patient(value)
        where (
          nullif(regexp_replace(lower(btrim(coalesce(previous_patient.value->>'document',previous_patient.value->>'cedula',''))),'[^a-z0-9]','','g'),'')
          =
          nullif(regexp_replace(lower(btrim(coalesce(incoming_patient.value->>'document',incoming_patient.value->>'cedula',''))),'[^a-z0-9]','','g'),'')
          and nullif(regexp_replace(lower(btrim(coalesce(previous_patient.value->>'document',previous_patient.value->>'cedula',''))),'[^a-z0-9]','','g'),'') is not null
        ) or (
          nullif(previous_patient.value->>'id','') is not null
          and previous_patient.value->>'id'=incoming_patient.value->>'id'
        )
      )
    ) then
      raise exception 'No se pueden retirar expedientes sin permiso patients.delete. Sincroniza de nuevo para recuperar la lista completa.';
    end if;
  end if;
  update public.workspace_shared_app_state
    set state=p_state,revision=v_revision+1,updated_by=v_uid,updated_at=now()
    where workspace_id=p_workspace_id;
  return query select true,v_revision+1;
end;
$function$;
