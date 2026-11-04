do $migration$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.cancel_home_visit(uuid,text)'::regprocedure);
  if position($old$if not public.has_workspace_role(v_visit.workspace_id, array['admin','clinician','reception']) then$old$ in v_def)=0 then
    raise exception 'No se encontró el control esperado en cancel_home_visit';
  end if;
  v_def := replace(v_def,
    $old$if not public.has_workspace_role(v_visit.workspace_id, array['admin','clinician','reception']) then$old$,
    $new$if not private.has_workspace_permission(v_visit.workspace_id,'domicilios','manage',null) then$new$);
  execute v_def;

  v_def := pg_get_functiondef('public.register_clinical_sample(uuid,text,uuid,uuid,text,uuid,uuid,timestamptz,timestamptz,integer,text[],text)'::regprocedure);
  if position($old$if not public.has_workspace_role(p_workspace_id,array['admin','clinician','reception']) then$old$ in v_def)=0 then
    raise exception 'No se encontró el control esperado en register_clinical_sample';
  end if;
  v_def := replace(v_def,
    $old$if not public.has_workspace_role(p_workspace_id,array['admin','clinician','reception']) then$old$,
    $new$if not private.has_workspace_permission(p_workspace_id,'studies','create',null) then$new$);
  execute v_def;

  v_def := pg_get_functiondef('public.set_clinical_sample_aliquots(uuid,integer,integer)'::regprocedure);
  if position($old$if not public.has_workspace_role(v_sample.workspace_id,array['admin','technician']) then$old$ in v_def)=0 then
    raise exception 'No se encontró el control esperado en set_clinical_sample_aliquots';
  end if;
  v_def := replace(v_def,
    $old$if not public.has_workspace_role(v_sample.workspace_id,array['admin','technician']) then$old$,
    $new$if not private.has_workspace_permission(v_sample.workspace_id,'processing','edit',null) then$new$);
  execute v_def;

  v_def := pg_get_functiondef('public.register_clinical_cryovial(uuid,uuid,text,text,uuid,integer)'::regprocedure);
  if position($old$if not public.has_workspace_role(p_workspace_id,array['admin','technician']) then$old$ in v_def)=0 then
    raise exception 'No se encontró el control esperado en register_clinical_cryovial';
  end if;
  v_def := replace(v_def,
    $old$if not public.has_workspace_role(p_workspace_id,array['admin','technician']) then$old$,
    $new$if not private.has_workspace_permission(p_workspace_id,'processing','create',null) then$new$);
  execute v_def;

  v_def := pg_get_functiondef('public.move_clinical_cryovial_to_definitive(uuid,uuid,uuid,integer,text)'::regprocedure);
  if position($old$if not public.has_workspace_role(p_workspace_id,array['admin','technician']) then$old$ in v_def)=0 then
    raise exception 'No se encontró el control esperado en move_clinical_cryovial_to_definitive';
  end if;
  v_def := replace(v_def,
    $old$if not public.has_workspace_role(p_workspace_id,array['admin','technician']) then$old$,
    $new$if not private.has_workspace_permission(p_workspace_id,'processing','edit',null) then$new$);
  execute v_def;

  v_def := pg_get_functiondef('public.transition_clinical_sample(uuid,text,text,integer,integer,uuid,uuid)'::regprocedure);
  if position($old$if not public.has_workspace_role(v_sample.workspace_id,v_allowed) then raise exception 'No tiene permisos para ejecutar esta transición'; end if;$old$ in v_def)=0 then
    raise exception 'No se encontró el control esperado en transition_clinical_sample';
  end if;
  v_def := replace(v_def,
    $old$if not public.has_workspace_role(v_sample.workspace_id,v_allowed) then raise exception 'No tiene permisos para ejecutar esta transición'; end if;$old$,
    $new$if p_next_status in ('EN_REVISION','PENDIENTE_PROCESO') then
  if not private.has_workspace_permission(v_sample.workspace_id,'studies','approve',null) then
    raise exception 'No tiene permiso para aprobar o enviar muestras desde Estudios Clínicos';
  end if;
 else
  if not private.has_workspace_permission(v_sample.workspace_id,'processing','edit',null) then
    raise exception 'No tiene permiso para cambiar el estado de procesamiento';
  end if;
 end if;$new$);
  execute v_def;
end
$migration$;
