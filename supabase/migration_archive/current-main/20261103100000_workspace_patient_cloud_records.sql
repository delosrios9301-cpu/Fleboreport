-- Expediente maestro de pacientes compartido por todos los módulos del mismo espacio de trabajo.
alter table public.patients
  add column if not exists legacy_id text,
  add column if not exists app_data jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists patients_legacy_id_per_workspace
  on public.patients(workspace_id,legacy_id)
  where legacy_id is not null and legacy_id <> '';

create or replace function public.sync_workspace_patient(
  p_workspace_id uuid,
  p_legacy_id text,
  p_data jsonb
)
returns table(
  patient_id uuid,
  document_number text,
  first_name text,
  last_name text,
  birth_date date,
  sex text,
  phone text,
  email text,
  address text,
  legacy_id text,
  app_data jsonb,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_id uuid;
  v_doc text;
  v_name text;
  v_first text;
  v_last text;
  v_birth date;
  v_sex text;
  v_phone text;
  v_email text;
  v_address text;
begin
  if auth.uid() is null then raise exception 'Se requiere una sesión autenticada'; end if;
  if not has_workspace_role(p_workspace_id,array['admin','clinician','reception']::text[]) then
    raise exception 'No tienes permiso para sincronizar expedientes de pacientes';
  end if;
  if p_data is null or jsonb_typeof(p_data)<>'object' then
    raise exception 'Los datos del paciente no tienen un formato válido';
  end if;

  v_doc:=nullif(btrim(coalesce(p_data->>'document',p_data->>'cedula',p_data->>'document_number','')),'');
  v_name:=btrim(coalesce(nullif(p_data->>'fullName',''),nullif(p_data->>'name',''),nullif(p_data->>'first_name','')||' '||coalesce(p_data->>'last_name','')));
  v_first:=coalesce(nullif(p_data->>'first_name',''),nullif(p_data->>'firstName',''),nullif(split_part(v_name,' ',1),''));
  v_last:=coalesce(nullif(p_data->>'last_name',''),nullif(p_data->>'lastName',''),nullif(btrim(substr(v_name,length(split_part(v_name,' ',1))+1)),''));
  if v_first is null then v_first:='Paciente'; end if;
  if v_last is null then v_last:=' '; end if;
  v_birth:=nullif(coalesce(p_data->>'birthDate',p_data->>'birth_date',''),'')::date;
  v_sex:=nullif(coalesce(p_data->>'sex',''),'');
  v_phone:=nullif(coalesce(p_data->>'phone',''),'');
  v_email:=nullif(coalesce(p_data->>'email',''),'');
  v_address:=nullif(coalesce(p_data->>'address',''),'');

  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||coalesce(lower(v_doc),p_legacy_id,''),0));

  if v_doc is not null then
    select p.id into v_id from public.patients p
    where p.workspace_id=p_workspace_id and lower(btrim(p.document_number))=lower(v_doc)
    limit 1 for update;
  end if;
  if v_id is null and nullif(p_legacy_id,'') is not null then
    select p.id into v_id from public.patients p
    where p.workspace_id=p_workspace_id and p.legacy_id=p_legacy_id
    limit 1 for update;
  end if;

  if v_id is null then
    insert into public.patients(
      workspace_id,document_number,first_name,last_name,birth_date,sex,phone,email,address,
      created_by,legacy_id,app_data,updated_at
    ) values (
      p_workspace_id,v_doc,v_first,v_last,v_birth,v_sex,v_phone,v_email,v_address,
      auth.uid(),nullif(p_legacy_id,''),p_data,now()
    ) returning id into v_id;
  else
    update public.patients p set
      document_number=coalesce(v_doc,p.document_number),
      first_name=coalesce(v_first,p.first_name),
      last_name=coalesce(v_last,p.last_name),
      birth_date=coalesce(v_birth,p.birth_date),
      sex=coalesce(v_sex,p.sex),
      phone=coalesce(v_phone,p.phone),
      email=coalesce(v_email,p.email),
      address=coalesce(v_address,p.address),
      legacy_id=coalesce(p.legacy_id,nullif(p_legacy_id,'')),
      app_data=coalesce(p.app_data,'{}'::jsonb)||p_data,
      updated_at=now()
    where p.id=v_id and p.workspace_id=p_workspace_id;
  end if;

  return query
  select p.id,p.document_number,p.first_name,p.last_name,p.birth_date,p.sex,p.phone,p.email,
         p.address,p.legacy_id,p.app_data,p.updated_at
  from public.patients p where p.id=v_id and p.workspace_id=p_workspace_id;
end;
$$;

grant execute on function public.sync_workspace_patient(uuid,text,jsonb) to authenticated;

do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
    and schemaname='public' and tablename='patients') then
    alter publication supabase_realtime add table public.patients;
  end if;
end $$;