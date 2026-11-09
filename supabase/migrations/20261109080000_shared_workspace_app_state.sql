-- Estado general compartido por espacio de trabajo.
-- Conserva workspace_app_state como respaldo histórico; no elimina ni sobrescribe snapshots individuales.
create table if not exists public.workspace_shared_app_state (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  revision integer not null default 1 check (revision > 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  reset_epoch uuid
);
alter table public.workspace_shared_app_state enable row level security;
revoke all on public.workspace_shared_app_state from anon, authenticated;

create or replace function private.merge_workspace_app_state_jsonb(p_left jsonb,p_right jsonb)
returns jsonb
language plpgsql
immutable
set search_path=''
as $$
declare
  v_key text;
  v_left jsonb;
  v_right jsonb;
  v_value jsonb;
  v_result jsonb := '{}'::jsonb;
begin
  for v_key in
    select key from jsonb_each(coalesce(p_left,'{}'::jsonb))
    union
    select key from jsonb_each(coalesce(p_right,'{}'::jsonb))
  loop
    v_left:=coalesce(p_left->v_key,'null'::jsonb);
    v_right:=coalesce(p_right->v_key,'null'::jsonb);
    if jsonb_typeof(v_left)='array' and jsonb_typeof(v_right)='array' then
      with all_items as (
        select
          e.value,
          e.ordinality::bigint as ord,
          case when v_key='patients' then
            coalesce(nullif(lower(regexp_replace(btrim(coalesce(e.value->>'document',e.value->>'cedula','')),'[^a-z0-9]','','g')),''),nullif(e.value->>'id',''),nullif(lower(btrim(coalesce(e.value->>'code',e.value->>'protocol',e.value->>'protocolCode',''))),''),nullif(lower(btrim(coalesce(e.value->>'name',e.value->>'fullName',''))),''),e.value::text)
          else
            coalesce(nullif(e.value->>'id',''),nullif(lower(regexp_replace(btrim(coalesce(e.value->>'document',e.value->>'cedula','')),'[^a-z0-9]','','g')),''),nullif(lower(btrim(coalesce(e.value->>'code',e.value->>'protocol',e.value->>'protocolCode',''))),''),nullif(lower(btrim(coalesce(e.value->>'name',e.value->>'fullName',''))),''),e.value::text)
          end
            || '|' || coalesce(e.value->>'studyId',e.value->>'study_id','')
            || '|' || coalesce(e.value->>'companyId',e.value->>'company_id','')
            || '|' || coalesce(e.value->>'siteId',e.value->>'site_id','') as identity_key
        from jsonb_array_elements(v_left) with ordinality e(value,ordinality)
        union all
        select
          e.value,
          1000000000::bigint+e.ordinality::bigint as ord,
          case when v_key='patients' then
            coalesce(nullif(lower(regexp_replace(btrim(coalesce(e.value->>'document',e.value->>'cedula','')),'[^a-z0-9]','','g')),''),nullif(e.value->>'id',''),nullif(lower(btrim(coalesce(e.value->>'code',e.value->>'protocol',e.value->>'protocolCode',''))),''),nullif(lower(btrim(coalesce(e.value->>'name',e.value->>'fullName',''))),''),e.value::text)
          else
            coalesce(nullif(e.value->>'id',''),nullif(lower(regexp_replace(btrim(coalesce(e.value->>'document',e.value->>'cedula','')),'[^a-z0-9]','','g')),''),nullif(lower(btrim(coalesce(e.value->>'code',e.value->>'protocol',e.value->>'protocolCode',''))),''),nullif(lower(btrim(coalesce(e.value->>'name',e.value->>'fullName',''))),''),e.value::text)
          end
            || '|' || coalesce(e.value->>'studyId',e.value->>'study_id','')
            || '|' || coalesce(e.value->>'companyId',e.value->>'company_id','')
            || '|' || coalesce(e.value->>'siteId',e.value->>'site_id','') as identity_key
        from jsonb_array_elements(v_right) with ordinality e(value,ordinality)
      ),
      grouped as (
        select identity_key,min(ord) as first_ord,(array_agg(value order by ord desc))[1] as latest_value
        from all_items group by identity_key
      )
      select coalesce(jsonb_agg(
        case when jsonb_typeof(g.latest_value)='object' then
          coalesce((
            select jsonb_object_agg(fields.key,fields.value order by fields.ord)
            from (
              select ai.ord,j.key,j.value
              from all_items ai
              cross join lateral jsonb_each(case when jsonb_typeof(ai.value)='object' then ai.value else '{}'::jsonb end) j
              where ai.identity_key=g.identity_key
              order by ai.ord
            ) fields
          ),g.latest_value)
        else g.latest_value end
        order by g.first_ord
      ),'[]'::jsonb)
      into v_value
      from grouped g;
    elsif jsonb_typeof(v_left)='object' and jsonb_typeof(v_right)='object' then
      v_value:=v_left||v_right;
    elsif v_right<>'null'::jsonb then
      v_value:=v_right;
    else
      v_value:=v_left;
    end if;
    if v_value<>'null'::jsonb then v_result:=v_result||jsonb_build_object(v_key,v_value); end if;
  end loop;
  return v_result;
end;
$$;
revoke all on function private.merge_workspace_app_state_jsonb(jsonb,jsonb) from public,anon,authenticated;

create or replace function public.get_workspace_shared_app_state(p_workspace_id uuid)
returns table(state jsonb,revision integer,updated_at timestamptz,reset_epoch uuid)
language plpgsql
security definer
set search_path=''
as $$
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
  return query select v_row.state,v_row.revision,v_row.updated_at,v_row.reset_epoch;
end;
$$;

create or replace function public.get_workspace_shared_app_state_meta(p_workspace_id uuid)
returns table(revision integer,updated_at timestamptz,reset_epoch uuid)
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'Se requiere una sesión autenticada'; end if;
  if not private.member_has_workspace_role(p_workspace_id,v_uid,array['admin','clinician','reception','viewer']::text[]) then
    raise exception 'No tienes permiso para consultar el estado compartido';
  end if;
  if not exists(select 1 from public.workspace_shared_app_state s where s.workspace_id=p_workspace_id) then
    perform * from public.get_workspace_shared_app_state(p_workspace_id);
  end if;
  return query select s.revision,s.updated_at,s.reset_epoch
    from public.workspace_shared_app_state s where s.workspace_id=p_workspace_id;
end;
$$;

create or replace function public.save_workspace_shared_app_state(
  p_workspace_id uuid,p_state jsonb,p_expected_revision integer
)
returns table(saved boolean,revision integer)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_revision integer;
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
  select s.revision into v_revision from public.workspace_shared_app_state s
    where s.workspace_id=p_workspace_id for update;
  if p_expected_revision is distinct from v_revision then
    return query select false,v_revision; return;
  end if;
  update public.workspace_shared_app_state
    set state=p_state,revision=v_revision+1,updated_by=v_uid,updated_at=now()
    where workspace_id=p_workspace_id;
  return query select true,v_revision+1;
end;
$$;

revoke all on function public.get_workspace_shared_app_state(uuid) from public,anon;
revoke all on function public.get_workspace_shared_app_state_meta(uuid) from public,anon;
revoke all on function public.save_workspace_shared_app_state(uuid,jsonb,integer) from public,anon;
grant execute on function public.get_workspace_shared_app_state(uuid) to authenticated;
grant execute on function public.get_workspace_shared_app_state_meta(uuid) to authenticated;
grant execute on function public.save_workspace_shared_app_state(uuid,jsonb,integer) to authenticated;

-- Los reinicios protegidos existentes eliminan las tablas operativas por workspace_id.
-- Se recrea el snapshot compartido vacío al terminar y se propaga el reset_epoch a todas las sesiones.
create or replace function public.reset_workspace_completely(p_workspace_id uuid,p_confirmation text)
returns table(deleted_tables integer,deleted_rows bigint,reset_epoch uuid)
language plpgsql
security definer
set search_path=''
as $$
declare v_result record; v_uid uuid:=auth.uid();
begin
  select * into v_result from private.reset_workspace_completely(p_workspace_id,p_confirmation);
  insert into public.workspace_shared_app_state(workspace_id,state,revision,updated_by,updated_at,reset_epoch)
  values(p_workspace_id,'{}'::jsonb,1,v_uid,now(),v_result.reset_epoch)
  on conflict(workspace_id) do update
    set state='{}'::jsonb,
        revision=public.workspace_shared_app_state.revision+1,
        updated_by=excluded.updated_by,
        updated_at=excluded.updated_at,
        reset_epoch=excluded.reset_epoch;
  return query select v_result.deleted_tables,v_result.deleted_rows,v_result.reset_epoch;
end;
$$;

create or replace function public.reset_workspace_operational_data(p_workspace_id uuid,p_confirmation text)
returns table(backup_id uuid,deleted_tables integer,deleted_rows bigint,reset_epoch uuid)
language plpgsql
security definer
set search_path=''
as $$
declare v_result record; v_uid uuid:=auth.uid();
begin
  select * into v_result from private.reset_workspace_operational_data(p_workspace_id,p_confirmation);
  insert into public.workspace_shared_app_state(workspace_id,state,revision,updated_by,updated_at,reset_epoch)
  values(p_workspace_id,'{}'::jsonb,1,v_uid,now(),v_result.reset_epoch)
  on conflict(workspace_id) do update
    set state='{}'::jsonb,
        revision=public.workspace_shared_app_state.revision+1,
        updated_by=excluded.updated_by,
        updated_at=excluded.updated_at,
        reset_epoch=excluded.reset_epoch;
  return query select v_result.backup_id,v_result.deleted_tables,v_result.deleted_rows,v_result.reset_epoch;
end;
$$;

revoke all on function public.reset_workspace_completely(uuid,text) from public,anon;
revoke all on function public.reset_workspace_operational_data(uuid,text) from public,anon;
grant execute on function public.reset_workspace_completely(uuid,text) to authenticated;
grant execute on function public.reset_workspace_operational_data(uuid,text) to authenticated;
