
create or replace function public.flebo_notify_user(
  p_workspace_id uuid,
  p_home_visit_id uuid,
  p_recipient_user_id uuid,
  p_title text,
  p_message text,
  p_event text,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_recipient_user_id is null then return; end if;
  insert into public.home_visit_notifications
    (workspace_id, home_visit_id, recipient_user_id, channel, template_name,
     status, message_body, metadata, sent_at, created_at, updated_at)
  values
    (p_workspace_id, p_home_visit_id, p_recipient_user_id, 'in_app', p_event,
     'sent', left(coalesce(p_title,'Notificación') || E'\n' || coalesce(p_message,''), 2000),
     coalesce(p_metadata,'{}'::jsonb) || jsonb_build_object('title',coalesce(p_title,'Notificación'),'event',p_event,'destination','domicilios'),
     now(), now(), now());
end;
$$;

create or replace function public.flebo_notify_workspace_staff(
  p_workspace_id uuid,
  p_home_visit_id uuid,
  p_title text,
  p_message text,
  p_event text,
  p_metadata jsonb default '{}'::jsonb,
  p_exclude_user uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare m record;
begin
  for m in
    select wm.user_id
    from public.workspace_members wm
    where wm.workspace_id=p_workspace_id
      and wm.active=true
      and wm.role in ('admin','clinician','reception')
      and (p_exclude_user is null or wm.user_id <> p_exclude_user)
  loop
    perform public.flebo_notify_user(p_workspace_id,p_home_visit_id,m.user_id,p_title,p_message,p_event,p_metadata);
  end loop;
end;
$$;

create or replace function public.flebo_notify_assignment_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v record; t text; msg text; ev text;
begin
  select scheduled_at into v from public.home_visits
  where id=new.home_visit_id and workspace_id=new.workspace_id;

  if tg_op='INSERT' then
    t := 'Nuevo domicilio asignado';
    msg := 'Tienes un domicilio pendiente de aceptar. Fecha: ' ||
      coalesce(to_char(v.scheduled_at at time zone 'America/Panama','DD/MM/YYYY HH24:MI'),'por confirmar') || '.';
    ev := 'assignment_created';
    perform public.flebo_notify_user(new.workspace_id,new.home_visit_id,new.assigned_user_id,t,msg,ev,
      jsonb_build_object('assignment_id',new.id,'status',new.status));
    perform public.flebo_notify_workspace_staff(new.workspace_id,new.home_visit_id,
      'Domicilio asignado','Se asignó un nuevo domicilio a un flebotomista.',ev,
      jsonb_build_object('assignment_id',new.id,'status',new.status),new.assigned_user_id);
  elsif old.status is distinct from new.status then
    t := case
      when lower(new.status) in ('accepted','aceptado') then 'Domicilio aceptado'
      when lower(new.status) in ('rejected','rechazado') then 'Domicilio rechazado'
      else 'Actualización de asignación' end;
    msg := 'El estado de la asignación cambió a: ' || new.status || '.';
    ev := 'assignment_status_changed';
    perform public.flebo_notify_workspace_staff(new.workspace_id,new.home_visit_id,t,msg,ev,
      jsonb_build_object('assignment_id',new.id,'status',new.status),new.assigned_user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_flebo_notify_assignment_changes on public.home_visit_assignments;
create trigger trg_flebo_notify_assignment_changes
after insert or update of status on public.home_visit_assignments
for each row execute function public.flebo_notify_assignment_changes();

create or replace function public.flebo_notify_visit_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare a record; t text; msg text;
begin
  if old.status is not distinct from new.status then return new; end if;
  t := 'Actualización de domicilio';
  msg := 'El domicilio cambió de estado: ' || old.status || ' → ' || new.status || '.';
  select assigned_user_id into a from public.home_visit_assignments
    where workspace_id=new.workspace_id and home_visit_id=new.id
    order by assigned_at desc limit 1;
  perform public.flebo_notify_workspace_staff(new.workspace_id,new.id,t,msg,'visit_status_changed',
    jsonb_build_object('from_status',old.status,'to_status',new.status),a.assigned_user_id);
  perform public.flebo_notify_user(new.workspace_id,new.id,a.assigned_user_id,t,msg,'visit_status_changed',
    jsonb_build_object('from_status',old.status,'to_status',new.status));
  return new;
end;
$$;

drop trigger if exists trg_flebo_notify_visit_status on public.home_visits;
create trigger trg_flebo_notify_visit_status
after update of status on public.home_visits
for each row execute function public.flebo_notify_visit_status();

drop policy if exists home_visit_notifications_read_own on public.home_visit_notifications;
create policy home_visit_notifications_read_own
on public.home_visit_notifications for select to authenticated
using (recipient_user_id = auth.uid() and public.is_workspace_member(workspace_id));

drop policy if exists home_visit_notifications_update_own on public.home_visit_notifications;
create policy home_visit_notifications_update_own
on public.home_visit_notifications for update to authenticated
using (recipient_user_id = auth.uid() and public.is_workspace_member(workspace_id))
with check (recipient_user_id = auth.uid() and public.is_workspace_member(workspace_id));

create index if not exists home_visit_notifications_recipient_unread_idx
on public.home_visit_notifications (recipient_user_id, created_at desc)
where status <> 'read' and channel='in_app';

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='home_visit_notifications'
  ) then
    alter publication supabase_realtime add table public.home_visit_notifications;
  end if;
exception when duplicate_object then null;
end $$;
