-- Sincronización del estado de FleboReport por cuenta y espacio de trabajo.
-- Los datos de cada usuario se sincronizan entre sus propios dispositivos.
create table if not exists public.workspace_app_state (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  revision integer not null default 0 check (revision >= 0),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint workspace_app_state_pkey primary key (workspace_id,user_id)
);
alter table public.workspace_app_state enable row level security;

drop policy if exists workspace_app_state_read on public.workspace_app_state;
create policy workspace_app_state_read on public.workspace_app_state
for select to authenticated
using (user_id=auth.uid() and has_workspace_role(workspace_id,array['admin','clinician','reception','viewer']::text[]));

drop policy if exists workspace_app_state_insert on public.workspace_app_state;
create policy workspace_app_state_insert on public.workspace_app_state
for insert to authenticated
with check (user_id=auth.uid() and has_workspace_role(workspace_id,array['admin','clinician','reception','viewer']::text[]));

drop policy if exists workspace_app_state_update on public.workspace_app_state;
create policy workspace_app_state_update on public.workspace_app_state
for update to authenticated
using (user_id=auth.uid() and has_workspace_role(workspace_id,array['admin','clinician','reception','viewer']::text[]))
with check (user_id=auth.uid() and has_workspace_role(workspace_id,array['admin','clinician','reception','viewer']::text[]));

grant select,insert,update on public.workspace_app_state to authenticated;

create or replace function public.save_workspace_app_state(
  p_workspace_id uuid,p_state jsonb,p_expected_revision integer
)
returns table(saved boolean,revision integer)
language plpgsql security invoker set search_path=public
as $$
declare
  v_revision integer;
  v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'Se requiere una sesión autenticada'; end if;
  if not has_workspace_role(p_workspace_id,array['admin','clinician','reception','viewer']::text[]) then
    raise exception 'No tienes permiso para sincronizar este espacio de trabajo';
  end if;
  if p_state is null or jsonb_typeof(p_state)<>'object' then
    raise exception 'El estado de la aplicación debe ser un objeto JSON';
  end if;
  select s.revision into v_revision from public.workspace_app_state s
    where s.workspace_id=p_workspace_id and s.user_id=v_uid for update;
  if not found then
    if coalesce(p_expected_revision,0)<>0 then return query select false,0; return; end if;
    insert into public.workspace_app_state(workspace_id,user_id,state,revision,updated_by,updated_at)
      values(p_workspace_id,v_uid,p_state,1,v_uid,now())
      on conflict(workspace_id,user_id) do nothing;
    if found then return query select true,1; return; end if;
    select s.revision into v_revision from public.workspace_app_state s
      where s.workspace_id=p_workspace_id and s.user_id=v_uid for update;
  end if;
  if p_expected_revision is distinct from v_revision then
    return query select false,v_revision; return;
  end if;
  update public.workspace_app_state set state=p_state,revision=v_revision+1,
    updated_by=v_uid,updated_at=now()
    where workspace_id=p_workspace_id and user_id=v_uid;
  return query select true,v_revision+1;
end;
$$;
grant execute on function public.save_workspace_app_state(uuid,jsonb,integer) to authenticated;

do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
    and schemaname='public' and tablename='workspace_app_state') then
    alter publication supabase_realtime add table public.workspace_app_state;
  end if;
end $$;