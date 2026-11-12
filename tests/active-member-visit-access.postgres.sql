-- An inactive assignee must no longer read accepted visit detail.
\set ON_ERROR_STOP on
create or replace function public.is_workspace_member(target uuid)
returns boolean language sql stable security definer set search_path=''
as $membership$
 select exists(select 1 from public.workspace_members m
  where m.workspace_id=target and m.user_id=auth.uid() and m.active);
$membership$;
\i supabase/migrations/20261112210511_require_active_visit_assignee.sql
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
do $active$
begin
 if (select count(*) from public.home_visits where id='e1111111-1111-4111-8111-111111111111')<>1 then
  raise exception 'Active technician lost accepted visit';end if;
end $active$;
reset role;
update public.workspace_members set active=false where workspace_id='10000000-0000-0000-0000-000000000001'
 and user_id='00000000-0000-0000-0000-000000000004';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
do $inactive$
begin
 if (select count(*) from public.home_visits where id='e1111111-1111-4111-8111-111111111111')<>0 then
  raise exception 'Inactive technician still sees an accepted visit';end if;
end $inactive$;
reset role;
update public.workspace_members set active=true where workspace_id='10000000-0000-0000-0000-000000000001'
 and user_id='00000000-0000-0000-0000-000000000004';
\echo 'OK: revoked membership removes access to accepted home visits'
