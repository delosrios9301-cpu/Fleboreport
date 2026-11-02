-- FleboReport: configuración administrativa híbrida, permisos granulares y doble autorización.
-- Migración aditiva: no elimina ni modifica datos clínicos existentes.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

alter table public.workspace_members
  drop constraint if exists workspace_members_role_check;
alter table public.workspace_members
  add constraint workspace_members_role_check
  check (role = any (array['admin','clinician','technician','reception','viewer','role_custom']::text[]));

create table if not exists public.sedes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  code text not null,
  name text not null,
  address text,
  phone text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,code)
);

create table if not exists public.user_sedes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  site_id uuid not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint user_sedes_site_fk foreign key(workspace_id,site_id)
    references public.sedes(workspace_id,id) on delete cascade,
  constraint user_sedes_member_fk foreign key(workspace_id,user_id)
    references public.workspace_members(workspace_id,user_id) on delete cascade
);
create unique index if not exists user_sedes_unique_assignment
  on public.user_sedes(workspace_id,user_id,site_id);
create unique index if not exists user_sedes_one_primary
  on public.user_sedes(workspace_id,user_id) where is_primary;

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  role_key text not null,
  module_key text not null,
  action_key text not null,
  allowed boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique(workspace_id,role_key,module_key,action_key)
);

create table if not exists public.member_permissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  module_key text not null,
  action_key text not null,
  allowed boolean not null,
  site_id uuid,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint member_permissions_member_fk foreign key(workspace_id,user_id)
    references public.workspace_members(workspace_id,user_id) on delete cascade,
  constraint member_permissions_site_fk foreign key(workspace_id,site_id)
    references public.sedes(workspace_id,id) on delete cascade
);
create unique index if not exists member_permissions_unique_scope
  on public.member_permissions(workspace_id,user_id,module_key,action_key,coalesce(site_id,'00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists public.workspace_security_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  primary_admin_user_id uuid not null references auth.users(id) on delete restrict,
  primary_admin_protected boolean not null default true,
  site_mode text not null default 'hybrid' check(site_mode='hybrid'),
  local_data_mode text not null default 'hybrid' check(local_data_mode='hybrid'),
  dual_authorization_enabled boolean not null default true,
  approval_expiry_hours integer not null default 24 check(approval_expiry_hours between 1 and 168),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete restrict,
  module_key text not null,
  action_key text not null,
  entity_table text not null,
  entity_id text,
  reason text not null,
  request_payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check(status in ('pending','approved','rejected','expired','cancelled')),
  decision_note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  expires_at timestamptz not null default (now()+interval '24 hours'),
  constraint approval_no_self_approval check(approved_by is null or approved_by <> requested_by)
);

create table if not exists public.sync_devices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_key text not null,
  device_label text not null default 'Dispositivo',
  last_seen_at timestamptz not null default now(),
  last_sync_at timestamptz,
  sync_status text not null default 'online' check(sync_status in ('online','offline','pending','error')),
  created_at timestamptz not null default now(),
  unique(workspace_id,user_id,device_key),
  constraint sync_devices_member_fk foreign key(workspace_id,user_id)
    references public.workspace_members(workspace_id,user_id) on delete cascade
);

alter table public.audit_logs
  add column if not exists site_id uuid,
  add column if not exists details jsonb not null default '{}'::jsonb;
do $$
begin
  if not exists(select 1 from pg_constraint where conname='audit_logs_site_fk') then
    alter table public.audit_logs add constraint audit_logs_site_fk
      foreign key(site_id) references public.sedes(id) on delete set null;
  end if;
end $$;

create or replace function private.has_workspace_permission(
  p_workspace_id uuid, p_module_key text, p_action_key text, p_site_id uuid default null
) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id=p_workspace_id
      and wm.user_id=(select auth.uid())
      and wm.active=true
      and (
        wm.role='admin'
        or coalesce(
          (
            select mp.allowed
            from public.member_permissions mp
            where mp.workspace_id=p_workspace_id
              and mp.user_id=(select auth.uid())
              and mp.module_key=p_module_key
              and mp.action_key=p_action_key
              and (mp.site_id is null or mp.site_id=p_site_id)
            order by (mp.site_id is not null) desc
            limit 1
          ),
          (
            select rp.allowed
            from public.role_permissions rp
            where rp.workspace_id=p_workspace_id
              and rp.role_key=wm.role
              and rp.module_key=p_module_key
              and rp.action_key=p_action_key
            limit 1
          ),
          false
        )
      )
  );
$$;
revoke all on function private.has_workspace_permission(uuid,text,text,uuid) from public;
grant execute on function private.has_workspace_permission(uuid,text,text,uuid) to authenticated;

create or replace function private.prevent_primary_admin_membership_change()
returns trigger language plpgsql security definer set search_path=''
as $$
declare owner_id uuid;
begin
  select w.owner_user_id into owner_id
  from public.workspaces w
  where w.id=old.workspace_id;
  if old.user_id=owner_id then
    if tg_op='DELETE' then
      raise exception 'La cuenta del administrador principal está protegida.';
    end if;
    if new.user_id<>old.user_id or new.workspace_id<>old.workspace_id
       or new.role<>'admin' or new.active is distinct from true then
      raise exception 'No se puede modificar, degradar ni desactivar al administrador principal.';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists protect_primary_admin_membership on public.workspace_members;
create trigger protect_primary_admin_membership
before update or delete on public.workspace_members
for each row execute function private.prevent_primary_admin_membership_change();

create or replace function private.prevent_primary_admin_settings_change()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.primary_admin_user_id is distinct from old.primary_admin_user_id
     or new.primary_admin_protected is distinct from true then
    raise exception 'La identidad y protección del administrador principal no se pueden modificar desde Configuración.';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_primary_admin_settings on public.workspace_security_settings;
create trigger protect_primary_admin_settings
before update on public.workspace_security_settings
for each row execute function private.prevent_primary_admin_settings_change();

create or replace function private.seed_workspace_configuration()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  insert into public.workspace_security_settings(workspace_id,primary_admin_user_id)
  values(new.id,new.owner_user_id)
  on conflict(workspace_id) do nothing;

  insert into public.role_permissions(workspace_id,role_key,module_key,action_key,allowed)
  select new.id,'admin',m.module_key,a.action_key,true
  from unnest(array['dashboard','users','permissions','sites','studies','domicilios','reception','processing','materials','reports','documents','notifications','audit','settings','approvals','journeys','companies','patients','catalog']::text[]) m(module_key)
  cross join unnest(array['view','create','edit','delete','approve','assign','export','print','manage','configure','request']::text[]) a(action_key)
  on conflict(workspace_id,role_key,module_key,action_key) do nothing;

  insert into public.role_permissions(workspace_id,role_key,module_key,action_key,allowed)
  select new.id,d.role_key,d.module_key,a.action_key,true
  from (values
    ('clinician','dashboard',array['view']::text[]),
    ('clinician','journeys',array['view','create','edit']::text[]),('clinician','companies',array['view','create','edit']::text[]),('clinician','patients',array['view','create','edit']::text[]),('clinician','catalog',array['view','create','edit']::text[]),
    ('clinician','users',array['view']::text[]),
    ('clinician','sites',array['view']::text[]),
    ('clinician','studies',array['view']::text[]),
    ('clinician','domicilios',array['view','create','edit','assign']::text[]),
    ('clinician','reception',array['view','create','edit']::text[]),
    ('clinician','processing',array['view','create','edit']::text[]),
    ('clinician','reports',array['view','export','print']::text[]),
    ('clinician','approvals',array['request']::text[]),
    ('reception','dashboard',array['view']::text[]),
    ('reception','journeys',array['view','create','edit']::text[]),('reception','companies',array['view','create','edit']::text[]),('reception','patients',array['view','create','edit']::text[]),('reception','catalog',array['view']::text[]),
    ('reception','sites',array['view']::text[]),
    ('reception','studies',array['view']::text[]),
    ('reception','domicilios',array['view','create','edit']::text[]),
    ('reception','reception',array['view','create','edit']::text[]),
    ('reception','reports',array['view','export','print']::text[]),
    ('technician','dashboard',array['view']::text[]),
    ('technician','patients',array['view']::text[]),
    ('technician','domicilios',array['view','edit']::text[]),
    ('technician','reports',array['view']::text[]),
    ('viewer','dashboard',array['view']::text[]),
    ('viewer','reports',array['view','export','print']::text[])
  ) d(role_key,module_key,actions)
  cross join unnest(d.actions) a(action_key)
  on conflict(workspace_id,role_key,module_key,action_key) do nothing;
  return new;
end;
$$;
drop trigger if exists initialize_workspace_configuration on public.workspaces;
create trigger initialize_workspace_configuration
after insert on public.workspaces
for each row execute function private.seed_workspace_configuration();

insert into public.workspace_security_settings(workspace_id,primary_admin_user_id)
select w.id,w.owner_user_id from public.workspaces w
on conflict(workspace_id) do nothing;

insert into public.role_permissions(workspace_id,role_key,module_key,action_key,allowed)
select w.id,'admin',m.module_key,a.action_key,true
from public.workspaces w
cross join unnest(array['dashboard','users','permissions','sites','studies','domicilios','reception','processing','materials','reports','documents','notifications','audit','settings','approvals']::text[]) m(module_key)
cross join unnest(array['view','create','edit','delete','approve','assign','export','print','manage','configure','request']::text[]) a(action_key)
on conflict(workspace_id,role_key,module_key,action_key) do nothing;

insert into public.role_permissions(workspace_id,role_key,module_key,action_key,allowed)
select w.id,d.role_key,d.module_key,a.action_key,true
from public.workspaces w
cross join (values
  ('clinician','dashboard',array['view']::text[]),('clinician','journeys',array['view','create','edit']::text[]),('clinician','companies',array['view','create','edit']::text[]),('clinician','patients',array['view','create','edit']::text[]),('clinician','catalog',array['view','create','edit']::text[]),('clinician','users',array['view']::text[]),
  ('clinician','sites',array['view']::text[]),('clinician','studies',array['view']::text[]),
  ('clinician','domicilios',array['view','create','edit','assign']::text[]),
  ('clinician','reception',array['view','create','edit']::text[]),('clinician','processing',array['view','create','edit']::text[]),
  ('clinician','reports',array['view','export','print']::text[]),('clinician','approvals',array['request']::text[]),
  ('reception','dashboard',array['view']::text[]),('reception','journeys',array['view','create','edit']::text[]),('reception','companies',array['view','create','edit']::text[]),('reception','patients',array['view','create','edit']::text[]),('reception','catalog',array['view']::text[]),('reception','sites',array['view']::text[]),('reception','studies',array['view']::text[]),
  ('reception','domicilios',array['view','create','edit']::text[]),('reception','reception',array['view','create','edit']::text[]),
  ('reception','reports',array['view','export','print']::text[]),
  ('technician','dashboard',array['view']::text[]),('technician','patients',array['view']::text[]),('technician','domicilios',array['view','edit']::text[]),('technician','reports',array['view']::text[]),
  ('viewer','dashboard',array['view']::text[]),('viewer','reports',array['view','export','print']::text[])
) d(role_key,module_key,actions)
cross join unnest(d.actions) a(action_key)
on conflict(workspace_id,role_key,module_key,action_key) do nothing;

alter table public.sedes enable row level security;
alter table public.user_sedes enable row level security;
alter table public.role_permissions enable row level security;
alter table public.member_permissions enable row level security;
alter table public.workspace_security_settings enable row level security;
alter table public.approval_requests enable row level security;
alter table public.sync_devices enable row level security;

create policy sedes_member_read on public.sedes for select to authenticated
using(public.is_workspace_member(workspace_id));
create policy sedes_create_permission on public.sedes for insert to authenticated
with check(private.has_workspace_permission(workspace_id,'sites','create'));
create policy sedes_update_permission on public.sedes for update to authenticated
using(private.has_workspace_permission(workspace_id,'sites','edit'))
with check(private.has_workspace_permission(workspace_id,'sites','edit'));
create policy sedes_delete_permission on public.sedes for delete to authenticated
using(private.has_workspace_permission(workspace_id,'sites','delete'));

create policy user_sedes_read on public.user_sedes for select to authenticated
using(user_id=(select auth.uid()) or private.has_workspace_permission(workspace_id,'users','view'));
create policy user_sedes_manage on public.user_sedes for all to authenticated
using(private.has_workspace_permission(workspace_id,'users','manage'))
with check(private.has_workspace_permission(workspace_id,'users','manage'));

create policy role_permissions_admin_read on public.role_permissions for select to authenticated
using(public.has_workspace_role(workspace_id,array['admin']::text[]));
create policy role_permissions_admin_manage on public.role_permissions for all to authenticated
using(public.has_workspace_role(workspace_id,array['admin']::text[]))
with check(public.has_workspace_role(workspace_id,array['admin']::text[]));

create policy member_permissions_read on public.member_permissions for select to authenticated
using(user_id=(select auth.uid()) or public.has_workspace_role(workspace_id,array['admin']::text[]));
create policy member_permissions_admin_manage on public.member_permissions for all to authenticated
using(public.has_workspace_role(workspace_id,array['admin']::text[]))
with check(public.has_workspace_role(workspace_id,array['admin']::text[]));

create policy workspace_security_member_read on public.workspace_security_settings for select to authenticated
using(public.is_workspace_member(workspace_id));
create policy workspace_security_admin_update on public.workspace_security_settings for update to authenticated
using(public.has_workspace_role(workspace_id,array['admin']::text[]))
with check(public.has_workspace_role(workspace_id,array['admin']::text[]));

create policy approval_read_related on public.approval_requests for select to authenticated
using(requested_by=(select auth.uid()) or approved_by=(select auth.uid()) or public.has_workspace_role(workspace_id,array['admin']::text[]));
create policy approval_create_request on public.approval_requests for insert to authenticated
with check(requested_by=(select auth.uid()) and approved_by is null and status='pending'
  and private.has_workspace_permission(workspace_id,'approvals','request'));
create policy approval_decide on public.approval_requests for update to authenticated
using(status='pending' and requested_by<>(select auth.uid())
  and private.has_workspace_permission(workspace_id,'approvals','approve'))
with check(status in ('approved','rejected') and approved_by=(select auth.uid())
  and requested_by<>(select auth.uid())
  and private.has_workspace_permission(workspace_id,'approvals','approve'));

create policy sync_devices_read on public.sync_devices for select to authenticated
using(user_id=(select auth.uid()) or public.has_workspace_role(workspace_id,array['admin']::text[]));
create policy sync_devices_self_insert on public.sync_devices for insert to authenticated
with check(user_id=(select auth.uid()) and public.is_workspace_member(workspace_id));
create policy sync_devices_self_update on public.sync_devices for update to authenticated
using(user_id=(select auth.uid()) or public.has_workspace_role(workspace_id,array['admin']::text[]))
with check(user_id=(select auth.uid()) or public.has_workspace_role(workspace_id,array['admin']::text[]));
create policy sync_devices_self_delete on public.sync_devices for delete to authenticated
using(user_id=(select auth.uid()) or public.has_workspace_role(workspace_id,array['admin']::text[]));

drop policy if exists members_admin_update on public.workspace_members;
create policy members_admin_update on public.workspace_members for update to authenticated
using(public.has_workspace_role(workspace_id,array['admin']::text[])
  and user_id<>(select owner_user_id from public.workspaces w where w.id=workspace_members.workspace_id))
with check(public.has_workspace_role(workspace_id,array['admin']::text[])
  and user_id<>(select owner_user_id from public.workspaces w where w.id=workspace_members.workspace_id));
drop policy if exists members_admin_delete on public.workspace_members;
create policy members_admin_delete on public.workspace_members for delete to authenticated
using(public.has_workspace_role(workspace_id,array['admin']::text[])
  and user_id<>(select owner_user_id from public.workspaces w where w.id=workspace_members.workspace_id));

drop policy if exists audit_logs_insert_member on public.audit_logs;
create policy audit_logs_insert_member on public.audit_logs for insert to authenticated
with check(actor_id=(select auth.uid()) and public.is_workspace_member(workspace_id));

revoke all on public.sedes,public.user_sedes,public.role_permissions,public.member_permissions,
  public.workspace_security_settings,public.approval_requests,public.sync_devices from anon;
grant select,insert,update,delete on public.sedes,public.user_sedes,public.role_permissions,
  public.member_permissions,public.workspace_security_settings,public.approval_requests,public.sync_devices
  to authenticated;
revoke update on public.sedes,public.role_permissions,public.member_permissions,public.workspace_security_settings,public.approval_requests,public.sync_devices from authenticated;
grant usage on schema public to authenticated;
grant select,insert on public.audit_logs to authenticated;
grant update(name,address,phone,active,updated_at) on public.sedes to authenticated;
grant update(allowed,updated_by,updated_at) on public.role_permissions to authenticated;
grant update(allowed,updated_by,updated_at) on public.member_permissions to authenticated;
grant update(dual_authorization_enabled,approval_expiry_hours,updated_by,updated_at) on public.workspace_security_settings to authenticated;
grant update(status,approved_by,decision_note,decided_at) on public.approval_requests to authenticated;
grant update(device_label,last_seen_at,last_sync_at,sync_status) on public.sync_devices to authenticated;
