-- FleboReport initial workspace schema for Supabase/PostgreSQL.
-- Never place a service_role key in the browser or GitHub Pages.
create extension if not exists pgcrypto;

create table if not exists public.workspaces(
 id uuid primary key default gen_random_uuid(),
 name text not null,
 owner_user_id uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now()
);
create table if not exists public.profiles(
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '',
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path=''
as $$ begin insert into public.profiles(user_id,display_name) values(new.id,coalesce(new.raw_user_meta_data->>'name','')) on conflict(user_id) do nothing; return new; end $$;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users for each row execute function public.handle_new_auth_user();

create table if not exists public.workspace_members(
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('admin','clinician','technician','reception','viewer')),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 primary key(workspace_id,user_id)
);

create or replace function public.is_workspace_member(target uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.workspace_members m where m.workspace_id=target and m.user_id=(select auth.uid()) and m.active) $$;
create or replace function public.has_workspace_role(target uuid, allowed text[])
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.workspace_members m where m.workspace_id=target and m.user_id=(select auth.uid()) and m.active and m.role=any(allowed)) $$;
create or replace function public.create_workspace(workspace_name text)
returns uuid language plpgsql security definer set search_path=''
as $$ declare new_id uuid; actor uuid; begin actor:=auth.uid(); if actor is null then raise exception 'Authentication required'; end if; if length(trim(coalesce(workspace_name,'')))<2 then raise exception 'Workspace name is required'; end if; insert into public.workspaces(name,owner_user_id) values(trim(workspace_name),actor) returning id into new_id; insert into public.workspace_members(workspace_id,user_id,role) values(new_id,actor,'admin'); return new_id; end $$;
revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.has_workspace_role(uuid,text[]) from public;
revoke all on function public.create_workspace(text) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.has_workspace_role(uuid,text[]) to authenticated;
grant execute on function public.create_workspace(text) to authenticated;

create table if not exists public.companies(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null,ruc text,phone text,email text,address text,city text,contact_name text,logo_path text,status text not null default 'active',created_at timestamptz not null default now(),
 unique(workspace_id,id),unique(workspace_id,name)
);
create table if not exists public.journeys(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 company_id uuid,journey_date date not null default current_date,location text,responsible text,start_time time,end_time time,status text not null default 'planned' check(status in('planned','in_progress','completed','cancelled')),notes text,created_by uuid references auth.users(id),created_at timestamptz not null default now(),
 unique(workspace_id,id),foreign key(workspace_id,company_id) references public.companies(workspace_id,id) on delete restrict
);
create table if not exists public.patients(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 document_number text,first_name text not null,last_name text not null,birth_date date,sex text,phone text,email text,address text,company_id uuid,emergency_contact text,emergency_phone text,notes text,created_by uuid references auth.users(id),created_at timestamptz not null default now(),
 unique(workspace_id,id),foreign key(workspace_id,company_id) references public.companies(workspace_id,id) on delete restrict
);
create unique index if not exists patients_document_per_workspace on public.patients(workspace_id,lower(document_number)) where nullif(trim(document_number),'') is not null;
create table if not exists public.professionals(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null,specialty text,phone text,email text,signature_path text,active boolean not null default true,created_at timestamptz not null default now(),unique(workspace_id,id)
);
create table if not exists public.services(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 code text,name text not null,category text,price numeric(12,2) not null default 0 check(price>=0),duration_minutes integer check(duration_minutes is null or duration_minutes>=0),description text,fields jsonb not null default '{}'::jsonb,active boolean not null default true,created_at timestamptz not null default now(),unique(workspace_id,id)
);
create table if not exists public.service_packages(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,name text not null,description text,price numeric(12,2) not null default 0 check(price>=0),active boolean not null default true,created_at timestamptz not null default now(),unique(workspace_id,id)
);
create table if not exists public.service_package_items(
 workspace_id uuid not null references public.workspaces(id) on delete cascade,package_id uuid not null,service_id uuid not null,quantity integer not null default 1 check(quantity>0),primary key(workspace_id,package_id,service_id),foreign key(workspace_id,package_id) references public.service_packages(workspace_id,id) on delete cascade,foreign key(workspace_id,service_id) references public.services(workspace_id,id) on delete restrict
);

create table if not exists public.attention_templates(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null,attention_type text not null,visible_fields jsonb not null default '{}'::jsonb,required_fields jsonb not null default '[]'::jsonb,allowed_service_ids uuid[] not null default '{}',required_documents jsonb not null default '[]'::jsonb,active boolean not null default true,updated_at timestamptz not null default now(),unique(workspace_id,id)
);
create table if not exists public.attentions(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 patient_id uuid not null,company_id uuid,journey_id uuid,professional_id uuid,attention_type text not null,attention_date date not null default current_date,start_time time,end_time time,reason text,clinical_data jsonb not null default '{}'::jsonb,status text not null default 'open',notes text,conclusions text,recommendations text,checked_in_at timestamptz,checked_out_at timestamptz,check_in_lat double precision,check_in_lng double precision,check_out_lat double precision,check_out_lng double precision,created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(workspace_id,id),foreign key(workspace_id,patient_id) references public.patients(workspace_id,id) on delete restrict,foreign key(workspace_id,company_id) references public.companies(workspace_id,id) on delete restrict,foreign key(workspace_id,journey_id) references public.journeys(workspace_id,id) on delete restrict,foreign key(workspace_id,professional_id) references public.professionals(workspace_id,id) on delete restrict
);
create index if not exists attentions_recent_idx on public.attentions(workspace_id,attention_date desc,created_at desc);
create table if not exists public.attention_tests(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 attention_id uuid not null,service_id uuid,result text,status text not null default 'pending',notes text,conclusion text,performed_at timestamptz,created_at timestamptz not null default now(),
 foreign key(workspace_id,attention_id) references public.attentions(workspace_id,id) on delete cascade,foreign key(workspace_id,service_id) references public.services(workspace_id,id) on delete restrict
);
create table if not exists public.evidences(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 attention_id uuid not null,file_type text not null,file_name text not null,storage_path text not null,created_by uuid references auth.users(id),created_at timestamptz not null default now(),foreign key(workspace_id,attention_id) references public.attentions(workspace_id,id) on delete cascade
);
create table if not exists public.signatures(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 attention_id uuid not null,signer_type text not null default 'patient',storage_path text not null,signed_at timestamptz not null default now(),created_by uuid references auth.users(id),foreign key(workspace_id,attention_id) references public.attentions(workspace_id,id) on delete cascade
);
create table if not exists public.reports(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 attention_id uuid,journey_id uuid,report_type text not null,storage_path text,format text not null check(format in('pdf','png','csv','xlsx')),generated_by uuid references auth.users(id),generated_at timestamptz not null default now(),metadata jsonb not null default '{}'::jsonb,foreign key(workspace_id,attention_id) references public.attentions(workspace_id,id) on delete restrict,foreign key(workspace_id,journey_id) references public.journeys(workspace_id,id) on delete restrict
);
create table if not exists public.invoices(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 attention_id uuid not null,invoice_number text not null,subtotal numeric(12,2) not null default 0 check(subtotal>=0),tax numeric(12,2) not null default 0 check(tax>=0),total numeric(12,2) not null default 0 check(total>=0),currency text not null default 'USD',status text not null default 'pending' check(status in('pending','partial','paid','void')),issued_at timestamptz not null default now(),unique(workspace_id,id),unique(workspace_id,invoice_number),foreign key(workspace_id,attention_id) references public.attentions(workspace_id,id) on delete restrict
);
create table if not exists public.payments(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 invoice_id uuid not null,amount numeric(12,2) not null check(amount>0),method text not null,reference text,paid_at timestamptz not null default now(),recorded_by uuid references auth.users(id),foreign key(workspace_id,invoice_id) references public.invoices(workspace_id,id) on delete restrict
);
create table if not exists public.appointments(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 patient_id uuid,service_id uuid,scheduled_at timestamptz not null,address text,latitude double precision,longitude double precision,status text not null default 'pending' check(status in('pending','confirmed','en_route','attended','cancelled')),notes text,created_by uuid references auth.users(id),created_at timestamptz not null default now(),foreign key(workspace_id,patient_id) references public.patients(workspace_id,id) on delete restrict,foreign key(workspace_id,service_id) references public.services(workspace_id,id) on delete restrict
);
create table if not exists public.reminders(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 patient_id uuid,attention_id uuid,message text not null,scheduled_at timestamptz not null,status text not null default 'pending' check(status in('pending','sent','cancelled')),sent_at timestamptz,created_by uuid references auth.users(id),created_at timestamptz not null default now(),foreign key(workspace_id,patient_id) references public.patients(workspace_id,id) on delete restrict,foreign key(workspace_id,attention_id) references public.attentions(workspace_id,id) on delete restrict
);
create table if not exists public.inventory_items(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null,category text,unit text not null default 'unidad',quantity numeric(12,3) not null default 0 check(quantity>=0),minimum_quantity numeric(12,3) not null default 0 check(minimum_quantity>=0),active boolean not null default true,created_at timestamptz not null default now(),unique(workspace_id,id)
);
create table if not exists public.inventory_movements(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 item_id uuid not null,attention_id uuid,movement_type text not null check(movement_type in('entry','exit','adjustment')),quantity numeric(12,3) not null check(quantity<>0 and (movement_type='adjustment' or quantity>0)),notes text,recorded_by uuid references auth.users(id),created_at timestamptz not null default now(),foreign key(workspace_id,item_id) references public.inventory_items(workspace_id,id) on delete restrict,foreign key(workspace_id,attention_id) references public.attentions(workspace_id,id) on delete restrict
);

create or replace function public.apply_inventory_movement()
returns trigger language plpgsql security definer set search_path=''
as $$ declare current_qty numeric(12,3); delta numeric(12,3); begin if tg_op<>'INSERT' then raise exception 'Los movimientos de inventario son inmutables; registra un ajuste compensatorio'; end if; select quantity into current_qty from public.inventory_items where id=new.item_id and workspace_id=new.workspace_id for update; if current_qty is null then raise exception 'Producto de inventario no encontrado'; end if; delta:=case new.movement_type when 'entry' then new.quantity when 'exit' then -new.quantity else new.quantity end; if current_qty+delta<0 then raise exception 'La existencia no puede quedar negativa'; end if; update public.inventory_items set quantity=current_qty+delta where id=new.item_id and workspace_id=new.workspace_id; return new; end $$;
create trigger inventory_movement_apply after insert on public.inventory_movements for each row execute function public.apply_inventory_movement();
create or replace function public.reject_inventory_movement_mutation()
returns trigger language plpgsql set search_path=''
as $$ begin raise exception 'Los movimientos no se editan ni eliminan; registra un movimiento compensatorio'; end $$;
create trigger inventory_movements_immutable before update or delete on public.inventory_movements for each row execute function public.reject_inventory_movement_mutation();

create or replace function public.refresh_invoice_status()
returns trigger language plpgsql security definer set search_path=''
as $$ declare invoice_key uuid; workspace_key uuid; due numeric; paid numeric; begin invoice_key:=coalesce(new.invoice_id,old.invoice_id); workspace_key:=coalesce(new.workspace_id,old.workspace_id); select total into due from public.invoices where id=invoice_key and workspace_id=workspace_key; select coalesce(sum(amount),0) into paid from public.payments where invoice_id=invoice_key and workspace_id=workspace_key; update public.invoices set status=case when paid=0 then 'pending' when paid<due then 'partial' else 'paid' end where id=invoice_key and workspace_id=workspace_key and status<>'void'; return coalesce(new,old); end $$;
create trigger payment_refresh_invoice after insert or update or delete on public.payments for each row execute function public.refresh_invoice_status();

create table if not exists public.clinical_studies(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 protocol_code text not null,name text not null,client_name text,sponsor text,cro text,principal_investigator text,status text not null default 'Activo' check(status in('Activo','Cerrado','Suspendido')),color text,starts_on date,ends_on date,notes text,created_at timestamptz not null default now(),unique(workspace_id,id),unique(workspace_id,protocol_code)
);
create table if not exists public.clinical_visits(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 study_id uuid not null,code text,name text not null,sort_order integer not null default 0,scheduled_day integer,active boolean not null default true,unique(workspace_id,id),foreign key(workspace_id,study_id) references public.clinical_studies(workspace_id,id) on delete cascade
);
create table if not exists public.clinical_sample_types(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 study_id uuid not null,code text,name text not null,tube text,volume text,processing_protocol text,color text,description text,active boolean not null default true,unique(workspace_id,id),foreign key(workspace_id,study_id) references public.clinical_studies(workspace_id,id) on delete cascade
);
create table if not exists public.clinical_samples(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 study_id uuid not null,subject_code text not null,visit_id uuid not null,sample_type_id uuid not null,collection_at timestamptz not null,received_at timestamptz not null,received_by uuid references auth.users(id),container_count integer not null default 1 check(container_count>0),status text not null default 'Recibida' check(status in('Recibida','En revisión','Pendiente de procesamiento','Procesada','Almacenada','Descartada')),primary_aliquots integer not null default 0 check(primary_aliquots>=0),backup_aliquots integer not null default 0 check(backup_aliquots>=0),processed_by uuid references auth.users(id),processed_at timestamptz,notes text,created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(workspace_id,id),foreign key(workspace_id,study_id) references public.clinical_studies(workspace_id,id) on delete restrict,foreign key(workspace_id,visit_id) references public.clinical_visits(workspace_id,id) on delete restrict,foreign key(workspace_id,sample_type_id) references public.clinical_sample_types(workspace_id,id) on delete restrict
);
create index if not exists clinical_samples_queue_idx on public.clinical_samples(workspace_id,status,received_at desc);
create index if not exists clinical_samples_subject_idx on public.clinical_samples(workspace_id,study_id,subject_code,collection_at desc);
create table if not exists public.clinical_sample_events(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 sample_id uuid not null,previous_status text,next_status text not null,notes text,actor_id uuid references auth.users(id),occurred_at timestamptz not null default now(),foreign key(workspace_id,sample_id) references public.clinical_samples(workspace_id,id) on delete cascade
);

-- Physical freezer tree: each freezer receives 4 drawers; each rack receives 5 trays; every tray exposes 4 box slots.
create table if not exists public.clinical_freezers(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,name text not null,description text,target_min_c numeric(5,2),target_max_c numeric(5,2),active boolean not null default true,created_at timestamptz not null default now(),unique(workspace_id,id),unique(workspace_id,name)
);
create table if not exists public.clinical_freezer_temperature_logs(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,freezer_id uuid not null,temperature_c numeric(5,2) not null,recorded_at timestamptz not null default now(),recorded_by uuid references auth.users(id),notes text,within_configured_range boolean,foreign key(workspace_id,freezer_id) references public.clinical_freezers(workspace_id,id) on delete restrict
);
create index if not exists freezer_temperature_recent_idx on public.clinical_freezer_temperature_logs(workspace_id,freezer_id,recorded_at desc);
create or replace function public.check_freezer_temperature()
returns trigger language plpgsql security definer set search_path=''
as $$ declare low numeric; high numeric; begin select target_min_c,target_max_c into low,high from public.clinical_freezers where id=new.freezer_id and workspace_id=new.workspace_id; new.within_configured_range:=case when low is null or high is null then null else new.temperature_c between low and high end; return new; end $$;
drop trigger if exists freezer_temperature_range on public.clinical_freezer_temperature_logs;
create trigger freezer_temperature_range before insert or update on public.clinical_freezer_temperature_logs for each row execute function public.check_freezer_temperature();

create table if not exists public.clinical_freezer_drawers(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,freezer_id uuid not null,drawer_no smallint not null check(drawer_no between 1 and 4),name text,unique(workspace_id,id),unique(workspace_id,freezer_id,drawer_no),foreign key(workspace_id,freezer_id) references public.clinical_freezers(workspace_id,id) on delete cascade
);
create or replace function public.seed_freezer_drawers()
returns trigger language plpgsql security definer set search_path=''
as $$ begin insert into public.clinical_freezer_drawers(workspace_id,freezer_id,drawer_no,name) select new.workspace_id,new.id,n,'Gaveta '||n from generate_series(1,4) n; return new; end $$;
drop trigger if exists clinical_freezer_seed_drawers on public.clinical_freezers;
create trigger clinical_freezer_seed_drawers after insert on public.clinical_freezers for each row execute function public.seed_freezer_drawers();
create table if not exists public.clinical_racks(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,drawer_id uuid not null,name text not null,created_at timestamptz not null default now(),unique(workspace_id,id),foreign key(workspace_id,drawer_id) references public.clinical_freezer_drawers(workspace_id,id) on delete restrict
);
create or replace function public.limit_racks_per_drawer()
returns trigger language plpgsql set search_path=''
as $$ declare count_racks integer; begin perform 1 from public.clinical_freezer_drawers where id=new.drawer_id and workspace_id=new.workspace_id for update; select count(*) into count_racks from public.clinical_racks where drawer_id=new.drawer_id and workspace_id=new.workspace_id and id is distinct from new.id; if count_racks>=4 then raise exception 'Cada gaveta admite hasta 4 racks'; end if; return new; end $$;
drop trigger if exists clinical_racks_limit on public.clinical_racks;
create trigger clinical_racks_limit before insert or update of drawer_id on public.clinical_racks for each row execute function public.limit_racks_per_drawer();
create table if not exists public.clinical_rack_trays(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,rack_id uuid not null,tray_no smallint not null check(tray_no between 1 and 5),name text,unique(workspace_id,id),unique(workspace_id,rack_id,tray_no),foreign key(workspace_id,rack_id) references public.clinical_racks(workspace_id,id) on delete cascade
);
create or replace function public.seed_rack_trays()
returns trigger language plpgsql security definer set search_path=''
as $$ begin insert into public.clinical_rack_trays(workspace_id,rack_id,tray_no,name) select new.workspace_id,new.id,n,'Bandeja '||n from generate_series(1,5) n; return new; end $$;
drop trigger if exists clinical_rack_seed_trays on public.clinical_racks;
create trigger clinical_rack_seed_trays after insert on public.clinical_racks for each row execute function public.seed_rack_trays();
create table if not exists public.clinical_boxes(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,tray_id uuid not null,slot_no smallint not null check(slot_no between 1 and 4),box_code text not null,storage_stage text not null check(storage_stage in('temporal','definitivo')),aliquot_capacity integer not null check(aliquot_capacity>0),active boolean not null default true,created_at timestamptz not null default now(),unique(workspace_id,id),unique(workspace_id,tray_id,slot_no),unique(workspace_id,box_code),foreign key(workspace_id,tray_id) references public.clinical_rack_trays(workspace_id,id) on delete restrict
);
create table if not exists public.clinical_cryovials(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,sample_id uuid not null,barcode text not null,kind text not null check(kind in('principal','backup')),status text not null check(status in('Almacenamiento temporal','Almacenamiento definitivo','Descartado')),box_id uuid,position_no integer,created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(workspace_id,id),foreign key(workspace_id,sample_id) references public.clinical_samples(workspace_id,id) on delete restrict,foreign key(workspace_id,box_id) references public.clinical_boxes(workspace_id,id) on delete restrict,check((status='Descartado' and box_id is null and position_no is null) or (status<>'Descartado' and box_id is not null and position_no is not null))
);
create unique index if not exists clinical_vial_barcode_unique on public.clinical_cryovials(workspace_id,lower(barcode));
create unique index if not exists clinical_box_position_unique on public.clinical_cryovials(workspace_id,box_id,position_no) where status<>'Descartado';
create or replace function public.validate_cryovial_position()
returns trigger language plpgsql set search_path=''
as $$ declare cap integer; stage text; begin if new.status='Descartado' then return new; end if; select aliquot_capacity,storage_stage into cap,stage from public.clinical_boxes where id=new.box_id and workspace_id=new.workspace_id for update; if cap is null or new.position_no<1 or new.position_no>cap then raise exception 'Posición fuera de la capacidad de la caja'; end if; if (new.status='Almacenamiento temporal' and stage<>'temporal') or (new.status='Almacenamiento definitivo' and stage<>'definitivo') then raise exception 'La etapa del criovial debe coincidir con el tipo de caja'; end if; return new; end $$;
drop trigger if exists clinical_cryovial_validate_position on public.clinical_cryovials;
create trigger clinical_cryovial_validate_position before insert or update on public.clinical_cryovials for each row execute function public.validate_cryovial_position();
create or replace function public.validate_clinical_sample_scope()
returns trigger language plpgsql security definer set search_path=''
as $$ declare visit_study uuid; type_study uuid; begin select study_id into visit_study from public.clinical_visits where id=new.visit_id and workspace_id=new.workspace_id; select study_id into type_study from public.clinical_sample_types where id=new.sample_type_id and workspace_id=new.workspace_id; if visit_study is distinct from new.study_id or type_study is distinct from new.study_id then raise exception 'La visita y el tipo de muestra deben pertenecer al estudio seleccionado'; end if; return new; end $$;
create trigger clinical_sample_scope_check before insert or update of study_id,visit_id,sample_type_id on public.clinical_samples for each row execute function public.validate_clinical_sample_scope();
create or replace function public.validate_cryovial_quota()
returns trigger language plpgsql security definer set search_path=''
as $$ declare allowed_count integer; current_count integer; begin if new.status='Descartado' then return new; end if; select case new.kind when 'principal' then primary_aliquots else backup_aliquots end into allowed_count from public.clinical_samples where id=new.sample_id and workspace_id=new.workspace_id for update; select count(*) into current_count from public.clinical_cryovials where sample_id=new.sample_id and workspace_id=new.workspace_id and kind=new.kind and status<>'Descartado' and id is distinct from new.id; if current_count>=coalesce(allowed_count,0) then raise exception 'Se excedió la cantidad de crioviales procesados para esta categoría'; end if; return new; end $$;
create trigger clinical_cryovial_quota_check before insert or update of sample_id,kind,status on public.clinical_cryovials for each row execute function public.validate_cryovial_quota();
create or replace function public.sync_sample_final_storage()
returns trigger language plpgsql security definer set search_path=''
as $$ declare sid uuid; expected_total integer; actual_total integer; all_final boolean; current_status text; begin sid:=coalesce(new.sample_id,old.sample_id); select primary_aliquots+backup_aliquots,status into expected_total,current_status from public.clinical_samples where id=sid and workspace_id=coalesce(new.workspace_id,old.workspace_id); select count(*),coalesce(bool_and(status='Almacenamiento definitivo'),false) into actual_total,all_final from public.clinical_cryovials where sample_id=sid and workspace_id=coalesce(new.workspace_id,old.workspace_id) and status<>'Descartado'; if expected_total>0 and actual_total=expected_total and all_final then update public.clinical_samples set status='Almacenada',updated_at=now() where id=sid and workspace_id=coalesce(new.workspace_id,old.workspace_id); elsif current_status='Almacenada' then update public.clinical_samples set status='Procesada',updated_at=now() where id=sid and workspace_id=coalesce(new.workspace_id,old.workspace_id); end if; return null; end $$;
create trigger clinical_sync_sample_storage after insert or update or delete on public.clinical_cryovials for each row execute function public.sync_sample_final_storage();

create table if not exists public.clinical_cryovial_events(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,cryovial_id uuid not null,action text not null,from_box_id uuid,from_position integer,to_box_id uuid,to_position integer,actor_id uuid references auth.users(id),notes text,occurred_at timestamptz not null default now(),foreign key(workspace_id,cryovial_id) references public.clinical_cryovials(workspace_id,id) on delete restrict,foreign key(workspace_id,from_box_id) references public.clinical_boxes(workspace_id,id) on delete restrict,foreign key(workspace_id,to_box_id) references public.clinical_boxes(workspace_id,id) on delete restrict
);

create table if not exists public.audit_logs(
 id bigint generated always as identity primary key,workspace_id uuid not null references public.workspaces(id) on delete cascade,actor_id uuid references auth.users(id),actor_name text not null default '',entity_table text not null,entity_id uuid,action text not null,changed_fields text[] not null default '{}',occurred_at timestamptz not null default now()
);
create index if not exists audit_logs_recent_idx on public.audit_logs(workspace_id,occurred_at desc);
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path=''
as $$ declare row_json jsonb; old_json jsonb; entity uuid; ws uuid; fields text[]; begin row_json:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end; old_json:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end; entity:=nullif(row_json->>'id','')::uuid; ws:=nullif(row_json->>'workspace_id','')::uuid; if tg_op='INSERT' then fields:=array(select jsonb_object_keys(row_json)); elsif tg_op='DELETE' then fields:=array(select jsonb_object_keys(old_json)); else fields:=array(select k from jsonb_object_keys(row_json) k where row_json->k is distinct from old_json->k); end if; if ws is not null then insert into public.audit_logs(workspace_id,actor_id,actor_name,entity_table,entity_id,action,changed_fields) values(ws,auth.uid(),coalesce((select display_name from public.profiles where user_id=auth.uid()),''),tg_table_name,entity,tg_op,fields); end if; if tg_op='DELETE' then return old; end if; return new; end $$;
create or replace function public.reject_audit_mutation()
returns trigger language plpgsql set search_path=''
as $$ begin raise exception 'Los eventos de auditoría no se pueden modificar ni borrar'; end $$;
drop trigger if exists audit_logs_immutable on public.audit_logs;
create trigger audit_logs_immutable before update or delete on public.audit_logs for each row execute function public.reject_audit_mutation();

-- Server-side audit events on all mutable business records (no clinical values are copied into the audit log).
do $$ declare t text; begin
 foreach t in array array['companies','journeys','patients','professionals','services','service_packages','service_package_items','attention_templates','attentions','attention_tests','evidences','signatures','reports','invoices','payments','appointments','reminders','inventory_items','inventory_movements','clinical_studies','clinical_visits','clinical_sample_types','clinical_samples','clinical_sample_events','clinical_freezers','clinical_freezer_temperature_logs','clinical_freezer_drawers','clinical_racks','clinical_rack_trays','clinical_boxes','clinical_cryovials','clinical_cryovial_events'] loop
 execute format('drop trigger if exists audit_%I on public.%I',t,t);
 execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.audit_row_change()',t,t);
 end loop;
end $$;

alter table public.profiles enable row level security;
create policy profiles_self_read on public.profiles for select to authenticated using(user_id=(select auth.uid()));
create policy profiles_self_update on public.profiles for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
alter table public.workspaces enable row level security;
create policy workspaces_member_read on public.workspaces for select to authenticated using(public.is_workspace_member(id));
alter table public.workspace_members enable row level security;
create policy members_workspace_read on public.workspace_members for select to authenticated using(public.is_workspace_member(workspace_id));
create policy members_admin_insert on public.workspace_members for insert to authenticated with check(public.has_workspace_role(workspace_id,array['admin']));
create policy members_admin_update on public.workspace_members for update to authenticated using(public.has_workspace_role(workspace_id,array['admin'])) with check(public.has_workspace_role(workspace_id,array['admin']));
create policy members_admin_delete on public.workspace_members for delete to authenticated using(public.has_workspace_role(workspace_id,array['admin']));

-- All authenticated workspace users can read workspace data. Write/delete privileges differ by role and module.
do $$ declare t text; policy_role text; begin
 foreach t in array array['companies','journeys','patients','professionals','services','service_packages','service_package_items','attention_templates','attentions','attention_tests','evidences','signatures','reports','invoices','payments','appointments','reminders','inventory_items','inventory_movements','clinical_studies','clinical_visits','clinical_sample_types','clinical_samples','clinical_sample_events','clinical_freezers','clinical_freezer_temperature_logs','clinical_freezer_drawers','clinical_racks','clinical_rack_trays','clinical_boxes','clinical_cryovials','clinical_cryovial_events','audit_logs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy workspace_read on public.%I for select to authenticated using(public.is_workspace_member(workspace_id))',t);
 if t='audit_logs' then
  execute format('create policy audit_admin_read on public.%I for select to authenticated using(public.has_workspace_role(workspace_id,array[''admin'']))',t);
  execute format('drop policy workspace_read on public.%I',t);
 else
  if t in('clinical_studies','clinical_visits','clinical_sample_types','professionals','services','service_packages','service_package_items','attention_templates','inventory_items','clinical_freezers','clinical_freezer_drawers','clinical_racks','clinical_rack_trays','clinical_boxes') then policy_role:='admin'; elsif t in('clinical_samples','clinical_sample_events','clinical_cryovials','clinical_cryovial_events','clinical_freezer_temperature_logs','inventory_movements') then policy_role:='admin,clinician,technician,reception'; else policy_role:='admin,clinician,reception'; end if;
  execute format('create policy workspace_insert on public.%I for insert to authenticated with check(public.has_workspace_role(workspace_id,string_to_array(%L,'','')))',t,policy_role);
  execute format('create policy workspace_update on public.%I for update to authenticated using(public.has_workspace_role(workspace_id,string_to_array(%L,'',''))) with check(public.has_workspace_role(workspace_id,string_to_array(%L,'','')))',t,policy_role,policy_role);
  execute format('create policy workspace_delete on public.%I for delete to authenticated using(public.has_workspace_role(workspace_id,array[''admin'']))',t);
 end if;
 end loop;
end $$;

-- Private file bucket. Object path begins with the workspace UUID.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('flebo-private','flebo-private',false,26214400,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create or replace function public.storage_workspace_member(object_name text)
returns boolean language plpgsql stable security definer set search_path=''
as $$ declare wid uuid; begin wid:=nullif((storage.foldername(object_name))[1],'')::uuid; return wid is not null and public.is_workspace_member(wid); exception when others then return false; end $$;
create policy flebo_private_read on storage.objects for select to authenticated using(bucket_id='flebo-private' and public.storage_workspace_member(name));
create policy flebo_private_insert on storage.objects for insert to authenticated with check(bucket_id='flebo-private' and public.storage_workspace_member(name) and public.has_workspace_role(((storage.foldername(name))[1])::uuid,array['admin','clinician','technician','reception']));
create policy flebo_private_update on storage.objects for update to authenticated using(bucket_id='flebo-private' and public.storage_workspace_member(name) and public.has_workspace_role(((storage.foldername(name))[1])::uuid,array['admin','clinician','technician','reception'])) with check(bucket_id='flebo-private' and public.storage_workspace_member(name) and public.has_workspace_role(((storage.foldername(name))[1])::uuid,array['admin','clinician','technician','reception']));
create policy flebo_private_delete on storage.objects for delete to authenticated using(bucket_id='flebo-private' and public.has_workspace_role(((storage.foldername(name))[1])::uuid,array['admin']));

revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select,insert,update,delete on public.workspaces,public.workspace_members,public.companies,public.journeys,public.patients,public.professionals,public.services,public.service_packages,public.service_package_items,public.attention_templates,public.attentions,public.attention_tests,public.evidences,public.signatures,public.reports,public.invoices,public.payments,public.appointments,public.reminders,public.inventory_items,public.inventory_movements,public.clinical_studies,public.clinical_visits,public.clinical_sample_types,public.clinical_samples,public.clinical_sample_events,public.clinical_freezers,public.clinical_freezer_temperature_logs,public.clinical_freezer_drawers,public.clinical_racks,public.clinical_rack_trays,public.clinical_boxes,public.clinical_cryovials,public.clinical_cryovial_events,public.audit_logs to authenticated;
grant select on public.profiles to authenticated;
grant update(display_name) on public.profiles to authenticated;
