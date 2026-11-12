-- PHYSICAL MODULE MIGRATION: additive only. No existing patient/clinical rows updated.
create or replace function private.fr_module_bucket(p_key text)
returns text language sql immutable set search_path=''
as $b$
 select case
 when p_key='patients' then 'patients'
 when p_key=any(array['journey','journeyEntries','selected','includeJourneyPatients']) then 'journeys'
 when p_key=any(array['company','companies']) then 'companies'
 when p_key=any(array['reportHistory','reportHistoryLogos']) then 'reports'
 when p_key=any(array['catalog','individualTestCatalog','individualServices','examPackages','individualTestPrices']) then 'catalog'
 when p_key='attentionTemplates' then 'attentions'
 when p_key like 'clinical%' then 'clinical'
 when p_key=any(array['billingSettings','style','auditOperator']) then 'settings'
 else 'extras' end
$b$;
revoke all on function private.fr_module_bucket(text) from public,anon,authenticated,service_role;

create table if not exists private.fr_module_patients(
 workspace_id uuid primary key references public.workspaces(id) on delete cascade,
 payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload)='object'),
 module_revision integer not null default 1 check(module_revision>0),
 shared_revision integer not null default 0,
 updated_by uuid,
 updated_at timestamptz not null default now()
);
alter table private.fr_module_patients enable row level security;
revoke all on table private.fr_module_patients from public,anon,authenticated,service_role;

create table if not exists private.fr_module_journeys(
 workspace_id uuid primary key references public.workspaces(id) on delete cascade,
 payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload)='object'),
 module_revision integer not null default 1 check(module_revision>0),
 shared_revision integer not null default 0,
 updated_by uuid,
 updated_at timestamptz not null default now()
);
alter table private.fr_module_journeys enable row level security;
revoke all on table private.fr_module_journeys from public,anon,authenticated,service_role;

create table if not exists private.fr_module_companies(
 workspace_id uuid primary key references public.workspaces(id) on delete cascade,
 payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload)='object'),
 module_revision integer not null default 1 check(module_revision>0),
 shared_revision integer not null default 0,
 updated_by uuid,
 updated_at timestamptz not null default now()
);
alter table private.fr_module_companies enable row level security;
revoke all on table private.fr_module_companies from public,anon,authenticated,service_role;

create table if not exists private.fr_module_reports(
 workspace_id uuid primary key references public.workspaces(id) on delete cascade,
 payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload)='object'),
 module_revision integer not null default 1 check(module_revision>0),
 shared_revision integer not null default 0,
 updated_by uuid,
 updated_at timestamptz not null default now()
);
alter table private.fr_module_reports enable row level security;
revoke all on table private.fr_module_reports from public,anon,authenticated,service_role;

create table if not exists private.fr_module_catalog(
 workspace_id uuid primary key references public.workspaces(id) on delete cascade,
 payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload)='object'),
 module_revision integer not null default 1 check(module_revision>0),
 shared_revision integer not null default 0,
 updated_by uuid,
 updated_at timestamptz not null default now()
);
alter table private.fr_module_catalog enable row level security;
revoke all on table private.fr_module_catalog from public,anon,authenticated,service_role;

create table if not exists private.fr_module_attentions(
 workspace_id uuid primary key references public.workspaces(id) on delete cascade,
 payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload)='object'),
 module_revision integer not null default 1 check(module_revision>0),
 shared_revision integer not null default 0,
 updated_by uuid,
 updated_at timestamptz not null default now()
);
alter table private.fr_module_attentions enable row level security;
revoke all on table private.fr_module_attentions from public,anon,authenticated,service_role;

create table if not exists private.fr_module_clinical(
 workspace_id uuid primary key references public.workspaces(id) on delete cascade,
 payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload)='object'),
 module_revision integer not null default 1 check(module_revision>0),
 shared_revision integer not null default 0,
 updated_by uuid,
 updated_at timestamptz not null default now()
);
alter table private.fr_module_clinical enable row level security;
revoke all on table private.fr_module_clinical from public,anon,authenticated,service_role;

create table if not exists private.fr_module_settings(
 workspace_id uuid primary key references public.workspaces(id) on delete cascade,
 payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload)='object'),
 module_revision integer not null default 1 check(module_revision>0),
 shared_revision integer not null default 0,
 updated_by uuid,
 updated_at timestamptz not null default now()
);
alter table private.fr_module_settings enable row level security;
revoke all on table private.fr_module_settings from public,anon,authenticated,service_role;

create table if not exists private.fr_module_extras(
 workspace_id uuid primary key references public.workspaces(id) on delete cascade,
 payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload)='object'),
 module_revision integer not null default 1 check(module_revision>0),
 shared_revision integer not null default 0,
 updated_by uuid,
 updated_at timestamptz not null default now()
);
alter table private.fr_module_extras enable row level security;
revoke all on table private.fr_module_extras from public,anon,authenticated,service_role;

create or replace function private.fr_sync_module_payloads(
 p_workspace_id uuid,p_state jsonb,p_shared_revision integer,p_updated_by uuid
) returns void language plpgsql security definer set search_path=''
as $body$
declare m text; p jsonb;
begin
 if p_workspace_id is null or jsonb_typeof(p_state)<>'object' then raise exception 'Invalid source state';end if;
 for m in select unnest(array['patients','journeys','companies','reports','catalog','attentions','clinical','settings','extras']::text[]) loop
  select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb) into p
   from jsonb_each(p_state) e(key,value)
   where private.fr_module_bucket(e.key)=m;
  execute format($sql$
   insert into private.%I as destination
    (workspace_id,payload,module_revision,shared_revision,updated_by,updated_at)
   values ($1,$2,1,$3,$4,now())
   on conflict(workspace_id) do update
    set payload=excluded.payload,
     module_revision=destination.module_revision+1,
     shared_revision=excluded.shared_revision,
     updated_by=excluded.updated_by,updated_at=now()
    where destination.payload is distinct from excluded.payload
  $sql$,'fr_module_'||m) using p_workspace_id,p,p_shared_revision,p_updated_by;
 end loop;
end $body$;
revoke all on function private.fr_sync_module_payloads(uuid,jsonb,integer,uuid)
 from public,anon,authenticated,service_role;

create or replace function private.fr_bridge_shared_state_to_modules()
returns trigger language plpgsql security definer set search_path=''
as $body$
declare m text;
begin
 if tg_op='DELETE' then
  for m in select unnest(array['patients','journeys','companies','reports','catalog','attentions','clinical','settings','extras']::text[]) loop
   execute format('delete from private.%I where workspace_id=$1','fr_module_'||m)
    using old.workspace_id;
  end loop;
  return old;
 end if;
 perform private.fr_sync_module_payloads(new.workspace_id,new.state,new.revision,new.updated_by);
 return new;
end $body$;
revoke all on function private.fr_bridge_shared_state_to_modules()
 from public,anon,authenticated,service_role;
drop trigger if exists fr_bridge_shared_state_to_modules on public.workspace_shared_app_state;
create trigger fr_bridge_shared_state_to_modules
 after insert or update of state or delete
 on public.workspace_shared_app_state
 for each row execute function private.fr_bridge_shared_state_to_modules();

-- Backfill touches ONLY new physical tables; old records remain untouched.
do $copy$
declare r record;
begin
 for r in select workspace_id,state,revision,updated_by
    from public.workspace_shared_app_state loop
  perform private.fr_sync_module_payloads(r.workspace_id,r.state,r.revision,r.updated_by);
 end loop;
end $copy$;
