-- Consulta unificada del expediente maestro por documento normalizado o nombre.
create or replace function public.search_workspace_patients(p_workspace_id uuid,p_query text)
returns setof public.patients
language plpgsql security invoker set search_path=public
as $$
declare
  v_query text:=btrim(coalesce(p_query,''));
  v_key text:=regexp_replace(lower(btrim(coalesce(p_query,''))),'[^a-z0-9]','','g');
begin
  if auth.uid() is null then raise exception 'Se requiere una sesión autenticada'; end if;
  if not has_workspace_role(p_workspace_id,array['admin','clinician','reception']::text[]) then
    raise exception 'No tienes permiso para consultar expedientes de pacientes';
  end if;
  if v_query='' then return; end if;
  return query
  select p.* from public.patients p
  where p.workspace_id=p_workspace_id and (
    (v_key<>'' and regexp_replace(lower(coalesce(p.document_number,'')),'[^a-z0-9]','','g')=v_key)
    or concat_ws(' ',p.first_name,p.last_name) ilike '%'||v_query||'%'
    or p.first_name ilike '%'||v_query||'%'
    or p.last_name ilike '%'||v_query||'%'
  )
  order by case when v_key<>'' and regexp_replace(lower(coalesce(p.document_number,'')),'[^a-z0-9]','','g')=v_key then 0 else 1 end,
           p.updated_at desc nulls last
  limit 10;
end;
$$;
grant execute on function public.search_workspace_patients(uuid,text) to authenticated;