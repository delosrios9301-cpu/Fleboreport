-- Protected per-module APIs: modular authoritative reads, module-specific CAS writes.
create or replace function public.get_workspace_modular_snapshot(p_workspace_id uuid)
returns table(state jsonb,revision integer,updated_at timestamptz,reset_epoch uuid,module_revisions jsonb)
language plpgsql security definer set search_path=''
as $fn$
declare
 u uuid:=auth.uid(); m text; p jsonb; mr integer;
 full_state jsonb:='{}'::jsonb; revs jsonb:='{}'::jsonb;
 original jsonb; global_rev integer; modified timestamptz; epoch uuid;
 viewer_only boolean;
begin
 if u is null or not private.member_has_workspace_role(
  p_workspace_id,u,array['admin','clinician','reception','viewer']::text[]) then
  raise exception 'Acceso denegado al espacio de trabajo';end if;
 perform * from public.get_workspace_shared_app_state(p_workspace_id);
 select s.state,s.revision,s.updated_at,s.reset_epoch
 into original,global_rev,modified,epoch
 from public.workspace_shared_app_state s where s.workspace_id=p_workspace_id for share;
 if original is null then raise exception 'No existe estado para este espacio';end if;
 for m in select unnest(array['patients','journeys','companies','reports','catalog','attentions','clinical','settings','extras']::text[]) loop
  execute format('select payload,module_revision from private.%I where workspace_id=$1','fr_module_'||m)
    into p,mr using p_workspace_id;
  if p is null or mr is null then raise exception 'Tabla modular incompleta: %',m;end if;
  full_state:=full_state||p;
  revs:=jsonb_set(revs,array[m],to_jsonb(mr),true);
 end loop;
 if full_state is distinct from original then
  raise exception 'Inconsistencia detectada entre módulos y estado anterior';
 end if;
 viewer_only:=private.member_has_workspace_role(
  p_workspace_id,u,array['viewer']::text[])
  and not private.member_has_workspace_role(
   p_workspace_id,u,array['admin','clinician','reception']::text[]);
 if viewer_only then
  if private.has_workspace_permission(p_workspace_id,'reports','view') then
   full_state:=jsonb_build_object(
    'reportHistory',coalesce(full_state->'reportHistory','[]'::jsonb),
    'reportHistoryLogos',coalesce(full_state->'reportHistoryLogos','{}'::jsonb)
   );
   revs:=jsonb_build_object('reports',revs->'reports');
  else full_state:='{}'::jsonb;revs:='{}'::jsonb;end if;
 end if;
 return query select full_state,global_rev,modified,epoch,revs;
end;
$fn$;
revoke all on function public.get_workspace_modular_snapshot(uuid) from public,anon;
grant execute on function public.get_workspace_modular_snapshot(uuid) to authenticated,service_role;

create or replace function public.get_workspace_module_state(
 p_workspace_id uuid,p_module_key text
) returns table(payload jsonb,module_revision integer,shared_revision integer)
language plpgsql security definer set search_path=''
as $fn$
declare u uuid:=auth.uid(); permission_key text;
begin
 if p_module_key is null or p_module_key<>all(array['patients','journeys','companies','reports','catalog','attentions','clinical','settings','extras']::text[]) then
  raise exception 'Módulo desconocido';end if;
 if u is null or not private.member_has_workspace_role(
   p_workspace_id,u,array['admin','clinician','reception','viewer']::text[]) then
  raise exception 'Módulo no autorizado';end if;
 permission_key:=case when p_module_key='clinical' then 'studies'
  when p_module_key='attentions' then 'reception'
  when p_module_key='extras' then 'settings'
  else p_module_key end;
 if p_module_key='extras' and
  not private.member_has_workspace_role(p_workspace_id,u,array['admin']::text[]) then
  raise exception 'Módulo no autorizado';end if;
 if p_module_key='clinical' then
  if not (private.has_workspace_permission(p_workspace_id,'studies','view')
    or private.has_workspace_permission(p_workspace_id,'processing','view')) then
   raise exception 'Módulo no autorizado';end if;
 elsif not private.has_workspace_permission(p_workspace_id,permission_key,'view') then
  raise exception 'Módulo no autorizado';end if;
 return query execute format('select t.payload,t.module_revision,t.shared_revision from private.%I t where t.workspace_id=$1',
  'fr_module_'||p_module_key) using p_workspace_id;
end;
$fn$;
revoke all on function public.get_workspace_module_state(uuid,text) from public,anon;
grant execute on function public.get_workspace_module_state(uuid,text) to authenticated,service_role;

create or replace function public.save_workspace_module_state(
 p_workspace_id uuid,p_module_key text,p_payload jsonb,
 p_expected_module_revision integer
) returns table(saved boolean,revision integer,module_revision integer)
language plpgsql security definer set search_path=''
as $fn$
declare
 u uuid:=auth.uid();
 permission_key text;
 old_state jsonb; new_state jsonb;
 global_rev integer; old_module_revision integer;
 new_global_rev integer; new_module_revision integer;
 did_save boolean; k text;
begin
 if u is null or not private.member_has_workspace_role(
  p_workspace_id,u,array['admin','clinician','reception']::text[]) then
  raise exception 'No tienes permiso para modificar este módulo';end if;
 if p_module_key is null or p_module_key<>all(array['patients','journeys','companies','reports','catalog','attentions','clinical','settings','extras']::text[]) then
  raise exception 'Módulo desconocido';end if;
 if jsonb_typeof(p_payload)<>'object' or pg_column_size(p_payload)>6500000 then
  raise exception 'El módulo debe enviarse como objeto JSON válido';end if;
 permission_key:=case when p_module_key='clinical' then 'studies'
   when p_module_key='attentions' then 'reception'
   when p_module_key='extras' then 'settings' else p_module_key end;
 if p_module_key='extras'
  and not private.member_has_workspace_role(p_workspace_id,u,array['admin']::text[]) then
  raise exception 'Módulo no autorizado';end if;
 if p_module_key='clinical' then
  if not (private.has_workspace_permission(p_workspace_id,'studies','edit')
   or private.has_workspace_permission(p_workspace_id,'processing','edit')) then
   raise exception 'Sin permiso para editar el módulo';end if;
 elsif not private.has_workspace_permission(p_workspace_id,permission_key,'edit') then
  raise exception 'Sin permiso para editar el módulo';end if;
 for k in select jsonb_object_keys(p_payload) loop
  if private.fr_module_bucket(k)<>p_module_key then
   raise exception 'Campo fuera del módulo: %',k;end if;
 end loop;
 if not exists(select 1 from public.workspace_shared_app_state where workspace_id=p_workspace_id) then
  perform * from public.get_workspace_shared_app_state(p_workspace_id);
 end if;
 select s.state,s.revision into old_state,global_rev
  from public.workspace_shared_app_state s where s.workspace_id=p_workspace_id for update;
 execute format('select module_revision from private.%I where workspace_id=$1',
   'fr_module_'||p_module_key) into old_module_revision using p_workspace_id;
 if old_module_revision is null then raise exception 'El módulo no está inicializado';end if;
 if p_expected_module_revision is distinct from old_module_revision then
  return query select false,global_rev,old_module_revision;return;end if;
 new_state:=old_state;
 for k in select e.key from jsonb_each(old_state) e(key,value)
   where private.fr_module_bucket(e.key)=p_module_key loop
  new_state:=new_state-k;
 end loop;
 new_state:=new_state||p_payload;
 if new_state is not distinct from old_state then
  return query select true,global_rev,old_module_revision;return;end if;
 select x.saved,x.revision into did_save,new_global_rev
  from public.save_workspace_shared_app_state(p_workspace_id,new_state,global_rev) x;
 if not did_save then return query select false,new_global_rev,old_module_revision;return;end if;
 execute format('select module_revision from private.%I where workspace_id=$1',
  'fr_module_'||p_module_key) into new_module_revision using p_workspace_id;
 return query select true,new_global_rev,new_module_revision;
end;
$fn$;
revoke all on function public.save_workspace_module_state(uuid,text,jsonb,integer) from public,anon;
grant execute on function public.save_workspace_module_state(uuid,text,jsonb,integer) to authenticated,service_role;
