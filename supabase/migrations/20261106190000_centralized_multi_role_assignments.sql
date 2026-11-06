-- Centralized professional cargo catalog and additive assignments.
create table if not exists public.workspace_roles (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 role_key text not null,
 display_name text not null,
 description text not null default '',
 area_key text not null default 'general',
 is_system boolean not null default false,
 active boolean not null default true,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(workspace_id,role_key),
 unique(workspace_id,id),
 check(role_key ~ '^[a-z][a-z0-9_]{1,63}$')
);
create table if not exists public.workspace_member_roles (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 user_id uuid not null,
 role_key text not null,
 is_primary boolean not null default false,
 assigned_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 foreign key(workspace_id,user_id) references public.workspace_members(workspace_id,user_id) on delete cascade,
 foreign key(workspace_id,role_key) references public.workspace_roles(workspace_id,role_key) on delete restrict,
 unique(workspace_id,user_id,role_key)
);
create unique index if not exists workspace_member_roles_one_primary on public.workspace_member_roles(workspace_id,user_id) where is_primary;
create index if not exists workspace_member_roles_user_idx on public.workspace_member_roles(workspace_id,user_id);
create index if not exists workspace_member_roles_role_idx on public.workspace_member_roles(workspace_id,role_key);

create or replace function private.seed_workspace_role_catalog()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 insert into public.workspace_roles(workspace_id,role_key,display_name,description,area_key,is_system)
 values
 (new.id,'admin','Administrador','Administración integral del espacio.','coordination',true),
 (new.id,'clinician','Supervisor clínico','Supervisión clínica y coordinación.','coordination',true),
 (new.id,'reception','Recepción / Agenda','Recepción y agenda.','reception',true),
 (new.id,'technician','Flebotomista','Flebotomía y toma de muestras.','phlebotomy',true),
 (new.id,'viewer','Solo consulta','Acceso de lectura.','general',true),
 (new.id,'role_custom','Personalizado','Perfil sin privilegios automáticos.','general',true)
 on conflict(workspace_id,role_key) do nothing;
 return new;
end $$;
drop trigger if exists seed_workspace_role_catalog on public.workspaces;
create trigger seed_workspace_role_catalog after insert on public.workspaces
for each row execute function private.seed_workspace_role_catalog();

insert into public.workspace_roles(workspace_id,role_key,display_name,description,area_key,is_system)
select w.id,r.role_key,r.display_name,r.description,r.area_key,true
from public.workspaces w
cross join (values
 ('admin','Administrador','Administración integral del espacio.','coordination'),
 ('clinician','Supervisor clínico','Supervisión clínica y coordinación.','coordination'),
 ('reception','Recepción / Agenda','Recepción y agenda.','reception'),
 ('technician','Flebotomista','Flebotomía y toma de muestras.','phlebotomy'),
 ('viewer','Solo consulta','Acceso de lectura.','general'),
 ('role_custom','Personalizado','Perfil sin privilegios automáticos.','general')
) r(role_key,display_name,description,area_key)
on conflict(workspace_id,role_key) do nothing;

insert into public.workspace_member_roles(workspace_id,user_id,role_key,is_primary)
select workspace_id,user_id,role,true from public.workspace_members
on conflict(workspace_id,user_id,role_key) do update set is_primary=true;

create or replace function private.sync_primary_workspace_role()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 update public.workspace_member_roles set is_primary=false
 where workspace_id=new.workspace_id and user_id=new.user_id and is_primary=true;
 insert into public.workspace_member_roles(workspace_id,user_id,role_key,is_primary)
 values(new.workspace_id,new.user_id,new.role,true)
 on conflict(workspace_id,user_id,role_key) do update set is_primary=true;
 return new;
end $$;
drop trigger if exists sync_primary_workspace_role on public.workspace_members;
create trigger sync_primary_workspace_role after insert or update of role on public.workspace_members
for each row execute function private.sync_primary_workspace_role();

create or replace function private.member_has_workspace_role(p_workspace_id uuid,p_user_id uuid,p_allowed_roles text[])
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(select 1 from public.workspace_members wm
 where wm.workspace_id=p_workspace_id and wm.user_id=p_user_id and wm.active
 and (wm.role=any(p_allowed_roles) or exists(
  select 1 from public.workspace_member_roles wmr
  where wmr.workspace_id=wm.workspace_id and wmr.user_id=wm.user_id and wmr.role_key=any(p_allowed_roles)
 )));
$$;
create or replace function public.has_workspace_role(target uuid,allowed text[])
returns boolean language sql stable security definer set search_path=''
as $$ select private.member_has_workspace_role(target,(select auth.uid()),allowed) $$;

create or replace function private.has_workspace_permission(p_workspace_id uuid,p_module_key text,p_action_key text,p_site_id uuid default null)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(select 1 from public.workspace_members wm
 where wm.workspace_id=p_workspace_id and wm.user_id=(select auth.uid()) and wm.active
 and (private.member_has_workspace_role(p_workspace_id,(select auth.uid()),array['admin']::text[])
 or coalesce(
  (select mp.allowed from public.member_permissions mp
   where mp.workspace_id=p_workspace_id and mp.user_id=(select auth.uid())
   and mp.module_key=p_module_key and mp.action_key=p_action_key
   and (mp.site_id is null or mp.site_id=p_site_id)
   order by (mp.site_id is not null) desc limit 1),
  (select bool_or(rp.allowed) from public.workspace_member_roles wmr
   join public.role_permissions rp on rp.workspace_id=wmr.workspace_id and rp.role_key=wmr.role_key
   where wmr.workspace_id=p_workspace_id and wmr.user_id=(select auth.uid())
   and rp.module_key=p_module_key and rp.action_key=p_action_key),
  (select rp.allowed from public.role_permissions rp
   where rp.workspace_id=p_workspace_id and rp.role_key=wm.role
   and rp.module_key=p_module_key and rp.action_key=p_action_key limit 1),
  false)));
$$;

drop policy if exists role_permissions_member_read on public.role_permissions;
create policy role_permissions_member_read on public.role_permissions for select to authenticated
using(public.has_workspace_role(workspace_id,array['admin']::text[]) or exists(
 select 1 from public.workspace_member_roles wmr
 where wmr.workspace_id=role_permissions.workspace_id and wmr.user_id=(select auth.uid())
 and wmr.role_key=role_permissions.role_key));

alter table public.workspace_roles enable row level security;
alter table public.workspace_member_roles enable row level security;
create policy workspace_roles_member_read on public.workspace_roles for select to authenticated
using(public.is_workspace_member(workspace_id) and active);
create policy workspace_roles_admin_insert on public.workspace_roles for insert to authenticated
with check(public.has_workspace_role(workspace_id,array['admin']::text[]));
create policy workspace_roles_admin_update on public.workspace_roles for update to authenticated
using(public.has_workspace_role(workspace_id,array['admin']::text[]))
with check(public.has_workspace_role(workspace_id,array['admin']::text[]));
create policy workspace_member_roles_self_or_admin_read on public.workspace_member_roles for select to authenticated
using(user_id=(select auth.uid()) or public.has_workspace_role(workspace_id,array['admin']::text[]));
create policy workspace_member_roles_admin_insert on public.workspace_member_roles for insert to authenticated
with check(public.has_workspace_role(workspace_id,array['admin']::text[]));
create policy workspace_member_roles_admin_update on public.workspace_member_roles for update to authenticated
using(public.has_workspace_role(workspace_id,array['admin']::text[]))
with check(public.has_workspace_role(workspace_id,array['admin']::text[]));
create policy workspace_member_roles_admin_delete on public.workspace_member_roles for delete to authenticated
using(public.has_workspace_role(workspace_id,array['admin']::text[]));

grant select,insert,update on public.workspace_roles to authenticated;
grant select,insert,update,delete on public.workspace_member_roles to authenticated;
revoke all on public.workspace_roles,public.workspace_member_roles from anon;
revoke update on public.workspace_roles from authenticated;
grant update(display_name,description,area_key,active,updated_at) on public.workspace_roles to authenticated;
revoke update on public.workspace_member_roles from authenticated;
grant update(is_primary,assigned_by) on public.workspace_member_roles to authenticated;
revoke all on function private.seed_workspace_role_catalog() from public,anon,authenticated;
revoke all on function private.sync_primary_workspace_role() from public,anon,authenticated;
revoke all on function private.member_has_workspace_role(uuid,uuid,text[]) from public,anon;
grant execute on function private.member_has_workspace_role(uuid,uuid,text[]) to authenticated,service_role;
revoke all on function private.has_workspace_permission(uuid,text,text,uuid) from public;
grant execute on function private.has_workspace_permission(uuid,text,text,uuid) to authenticated;
revoke all on function public.has_workspace_role(uuid,text[]) from public;
grant execute on function public.has_workspace_role(uuid,text[]) to authenticated;
