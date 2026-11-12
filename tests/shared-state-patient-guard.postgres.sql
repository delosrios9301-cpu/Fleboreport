-- PostgreSQL 17 synthetic test for granular deletion guard.
\set ON_ERROR_STOP on
create or replace function private.has_workspace_permission(p_workspace_id uuid,p_module_key text,p_action_key text,p_site_id uuid default null)
returns boolean language sql stable security definer set search_path=''
as $allowed$
 select (p_module_key='patients' and p_action_key='delete' and exists(
   select 1 from public.workspace_members wm
    where wm.workspace_id=p_workspace_id and wm.user_id=auth.uid() and wm.role='admin' and wm.active
 )) or (p_module_key='reports' and p_action_key='view');
$allowed$;
\i supabase/migrations/20261112160710_preserve_patient_identities_on_shared_sync.sql
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $guard$
declare v_revision integer; v_state jsonb; v_result record; v_doc text;
begin
 select revision,state into v_revision,v_state from public.get_workspace_shared_app_state('10000000-0000-0000-0000-000000000001');
 begin
  perform * from public.save_workspace_shared_app_state('10000000-0000-0000-0000-000000000001',v_state-'patients',v_revision);
  raise exception 'Unauthorized patient omission was accepted';
 exception when others then
  if sqlerrm='Unauthorized patient omission was accepted' then raise; end if;
  if sqlerrm not like '%No se pueden retirar expedientes%' then raise; end if;
 end;
 -- A normal reception change that preserves all patients still works.
 select saved,revision into v_result from public.save_workspace_shared_app_state(
  '10000000-0000-0000-0000-000000000001',
  v_state||jsonb_build_object('journey',jsonb_build_object('id','synthetic-journey')),
  v_revision
 );
 if not v_result.saved then raise exception 'Normal authorized edit unexpectedly blocked'; end if;
end $guard$;
reset role;
\echo 'OK: normal shared updates work; unauthorized patient removal is rejected'
