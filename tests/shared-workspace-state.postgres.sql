-- Prueba de integración PostgreSQL 17: migración, consolidación, aislamiento y concurrencia.
\set ON_ERROR_STOP on
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema private;
create table auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid
language sql stable set search_path='' as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create table public.workspaces(id uuid primary key);
create table public.workspace_members(
  workspace_id uuid not null,
  user_id uuid not null,
  role text not null,
  active boolean not null default true
);
create table public.workspace_app_state(
  workspace_id uuid not null,
  user_id uuid not null,
  state jsonb not null,
  reset_epoch uuid,
  updated_at timestamptz not null default now(),
  primary key(workspace_id,user_id)
);
create or replace function private.member_has_workspace_role(p_workspace_id uuid,p_user_id uuid,p_roles text[])
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.workspace_members wm
    where wm.workspace_id=p_workspace_id and wm.user_id=p_user_id
      and wm.active and wm.role=any(p_roles)
  )
$$;
create or replace function private.reset_workspace_completely(p_workspace_id uuid,p_confirmation text)
returns table(deleted_tables integer,deleted_rows bigint,reset_epoch uuid)
language sql security definer set search_path=''
as $$ select 0,0,gen_random_uuid() $$;
create or replace function private.reset_workspace_operational_data(p_workspace_id uuid,p_confirmation text)
returns table(backup_id uuid,deleted_tables integer,deleted_rows bigint,reset_epoch uuid)
language sql security definer set search_path=''
as $$ select gen_random_uuid(),0,0,gen_random_uuid() $$;

insert into auth.users(id) values
('00000000-0000-0000-0000-000000000001'),
('00000000-0000-0000-0000-000000000002'),
('00000000-0000-0000-0000-000000000003'),
('00000000-0000-0000-0000-000000000004');
insert into public.workspaces(id) values
('10000000-0000-0000-0000-000000000001'),
('10000000-0000-0000-0000-000000000002');
insert into public.workspace_members(workspace_id,user_id,role) values
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','admin'),
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','reception'),
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','viewer'),
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','technician');

insert into public.workspace_app_state(workspace_id,user_id,state,updated_at) values
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
 '{"patients":[{"document":"111","name":"Ana","fromAdmin":true},{"name":"Ana","note":"admin-sin-id"},{"document":"222","name":"Ana"}],"settings":{"one":1}}',
 '2026-11-01T10:00:00Z'),
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',
 '{"patients":[{"document":"111","name":"Ana","fromReception":true},{"name":"Ana","note":"recepcion-sin-id"},{"document":"333","name":"Ana"}],"settings":{"two":2}}',
 '2026-11-02T10:00:00Z');

\echo 'Aplicando migración bajo prueba'
\i supabase/migrations/20261109080000_shared_workspace_app_state.sql

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select * from public.get_workspace_shared_app_state('10000000-0000-0000-0000-000000000001');
reset role;

do $
declare v_state jsonb; v_count integer; v_result record;
begin
  select state into v_state from public.workspace_shared_app_state
  where workspace_id='10000000-0000-0000-0000-000000000001';
  select jsonb_array_length(v_state->'patients') into v_count;
  if v_count <> 5 then raise exception 'Esperaba 5 pacientes distintos; recibí %',v_count; end if;
  if not exists(select 1 from jsonb_array_elements(v_state->'patients') p
    where p->>'document'='111' and p->>'fromAdmin'='true' and p->>'fromReception'='true') then
    raise exception 'No se combinaron los campos complementarios del mismo documento';
  end if;
  if (select count(*) from public.workspace_app_state) <> 2 then
    raise exception 'Los snapshots históricos fueron modificados o eliminados';
  end if;
  if has_table_privilege('authenticated','public.workspace_shared_app_state','select') then
    raise exception 'La tabla compartida quedó expuesta directamente';
  end if;
  if has_function_privilege('authenticated','public.reset_workspace_completely(uuid,text)','execute') then
    raise exception 'El reinicio total quedó habilitado';
  end if;
  if has_function_privilege('authenticated','private.reset_workspace_completely(uuid,text)','execute') then
    raise exception 'La función privada de reinicio total quedó habilitada';
  end if;
end $;
set role authenticated;

-- Dos cuentas autorizadas leen el mismo estado; el control optimista acepta solo la primera escritura.
select * from public.save_workspace_shared_app_state(
 '10000000-0000-0000-0000-000000000001','{"shared":"admin-write"}'::jsonb,1
);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select * from public.get_workspace_shared_app_state('10000000-0000-0000-0000-000000000001');
select * from public.save_workspace_shared_app_state(
 '10000000-0000-0000-0000-000000000001','{"shared":"stale-write"}'::jsonb,1
);
do $$
declare v_saved boolean; v_revision integer;
begin
  select saved,revision into v_saved,v_revision from public.save_workspace_shared_app_state(
    '10000000-0000-0000-0000-000000000001','{"shared":"stale-write"}'::jsonb,1
  );
  if v_saved or v_revision <> 2 then raise exception 'El bloqueo optimista no rechazó una revisión obsoleta'; end if;
end $$;

-- Viewer puede leer pero no escribir.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select * from public.get_workspace_shared_app_state('10000000-0000-0000-0000-000000000001');
do $$
begin
  begin
    perform * from public.save_workspace_shared_app_state(
      '10000000-0000-0000-0000-000000000001','{}'::jsonb,2
    );
    raise exception 'Viewer pudo escribir';
  exception when others then
    if sqlerrm='Viewer pudo escribir' then raise; end if;
    if sqlerrm not like '%No tienes permiso para modificar%' then raise; end if;
  end;
end $$;

-- Técnico no recibe acceso al estado general; tampoco se permite leer otro workspace.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
do $$
begin
  begin
    perform * from public.get_workspace_shared_app_state('10000000-0000-0000-0000-000000000001');
    raise exception 'Técnico pudo leer el estado general';
  exception when others then
    if sqlerrm='Técnico pudo leer el estado general' then raise; end if;
    if sqlerrm not like '%No tienes permiso para consultar%' then raise; end if;
  end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $$
begin
  begin
    perform * from public.get_workspace_shared_app_state('10000000-0000-0000-0000-000000000002');
    raise exception 'Se filtró información de otro workspace';
  exception when others then
    if sqlerrm='Se filtró información de otro workspace' then raise; end if;
    if sqlerrm not like '%No tienes permiso para consultar%' then raise; end if;
  end;
end $$;
reset role;
\echo 'OK: migración PostgreSQL, consolidación, aislamiento, permisos y concurrencia'
