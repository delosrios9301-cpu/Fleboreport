CREATE OR REPLACE FUNCTION public.restore_home_visit_previous_closure(p_home_visit_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 v public.home_visits%rowtype;
 e public.home_visit_events%rowtype;
 previous_close timestamptz;
 original_event timestamptz;
begin
 if auth.uid() is null then raise exception 'Se requiere una sesión autenticada' using errcode='42501'; end if;
 select * into v from public.home_visits where id=p_home_visit_id for update;
 if not found or v.archived_at is not null or v.status<>'at_home' or v.completed_at is not null then
  raise exception 'El domicilio no está disponible para restaurar el cierre';
 end if;
 if not public.is_current_home_visit_assignee(v.workspace_id,v.id,auth.uid(),array['accepted']::text[]) then
  raise exception 'Solo el responsable vigente puede restaurar el cierre' using errcode='42501';
 end if;
 select * into e from public.home_visit_events where workspace_id=v.workspace_id and home_visit_id=v.id order by occurred_at desc,id desc limit 1;
 if not found or e.event_type<>'Domicilio reabierto' or e.from_status is distinct from 'Finalizado' or e.to_status is distinct from 'En domicilio' then
  raise exception 'Existen movimientos posteriores a la reapertura o falta la auditoría original';
 end if;
 if v.updated_at>e.occurred_at then raise exception 'El domicilio fue modificado después de la reapertura'; end if;
 previous_close := substring(e.description from 'Cierre anterior: ([0-9T:.+Z-]+)')::timestamptz;
 select max(occurred_at) into original_event from public.home_visit_events where workspace_id=v.workspace_id and home_visit_id=v.id and to_status in ('Finalizado','completed') and occurred_at<e.occurred_at;
 if previous_close is null or original_event is null or previous_close>original_event or original_event-previous_close>interval '5 minutes' then
  raise exception 'No se pudo verificar la fecha de cierre anterior';
 end if;
 perform 1 from public.home_visit_tests where workspace_id=v.workspace_id and home_visit_id=v.id for update;
 if not exists(select 1 from public.home_visit_tests where workspace_id=v.workspace_id and home_visit_id=v.id) or exists(select 1 from public.home_visit_tests where workspace_id=v.workspace_id and home_visit_id=v.id and (status not in ('collected','not_collected') or updated_at>v.updated_at or added_at>v.updated_at)) then
  raise exception 'Las pruebas cambiaron o tienen resultados pendientes. Revisa el expediente antes de cerrarlo.';
 end if;
 update public.home_visits set status='completed',completed_at=previous_close where id=v.id and workspace_id=v.workspace_id and status='at_home' and completed_at is null;
 if not found then raise exception 'No se confirmó la restauración'; end if;
 insert into public.home_visit_events(workspace_id,home_visit_id,event_type,from_status,to_status,description,actor_user_id,metadata)
 values(v.workspace_id,v.id,'Cierre anterior restaurado','En domicilio','Finalizado','Se revierte la reapertura accidental sin modificar pruebas. Cierre original: '||previous_close::text,auth.uid(),jsonb_build_object('reopen_event_id',e.id,'previous_completed_at',previous_close));
 return previous_close;
end;
$function$
;
revoke all on function public.restore_home_visit_previous_closure(uuid) from public,anon;
grant execute on function public.restore_home_visit_previous_closure(uuid) to authenticated;
