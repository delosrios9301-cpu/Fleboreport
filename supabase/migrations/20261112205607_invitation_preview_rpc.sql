-- Minimal pre-acceptance invitation view. No patient/address/phone/clinical
-- data is returned, even when the caller knows the UUID of the visit.
create or replace function public.list_home_visit_invitation_previews(
 p_workspace_id uuid
) returns table(
 visit_id uuid,workspace_id uuid,scheduled_at timestamptz,priority text,
 assignment_id uuid,professional_id uuid,assigned_user_id uuid,assigned_at timestamptz
)
language plpgsql stable security definer set search_path=''
as $preview$
declare v_uid uuid:=(select auth.uid());
begin
 if v_uid is null or not exists(
  select 1 from public.workspace_members m
  where m.workspace_id=p_workspace_id and m.user_id=v_uid and m.active
 ) then
  raise exception 'Acceso denegado a las invitaciones';
 end if;
 return query
 select v.id,v.workspace_id,v.scheduled_at,v.priority,
        a.id,a.professional_id,a.assigned_user_id,a.assigned_at
 from public.home_visit_assignments a
 join public.home_visits v
  on v.workspace_id=a.workspace_id and v.id=a.home_visit_id
 where a.workspace_id=p_workspace_id
  and a.assigned_user_id=v_uid
  and a.status='invited'
  and v.status='pending_acceptance'
  and a.id=(
    select a2.id from public.home_visit_assignments a2
    where a2.workspace_id=a.workspace_id and a2.home_visit_id=a.home_visit_id
    order by a2.assigned_at desc,a2.id desc limit 1
  )
 order by v.scheduled_at,a.id;
end;
$preview$;
revoke all on function public.list_home_visit_invitation_previews(uuid) from public,anon;
grant execute on function public.list_home_visit_invitation_previews(uuid)
 to authenticated,service_role;
