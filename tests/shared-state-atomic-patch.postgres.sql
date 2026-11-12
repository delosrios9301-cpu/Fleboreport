-- Synthetic two-user concurrency, patient retention and permissions.
\set ON_ERROR_STOP on
\i supabase/migrations/20261112182000_shared_state_atomic_patch.sql
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $test$
declare
 v_old jsonb;
 v_rev integer;
 v_saved boolean;
 v_next int;
 v_new jsonb;
begin
 select state,revision into v_old,v_rev from public.get_workspace_shared_app_state(
  '10000000-0000-0000-0000-000000000001');
 select saved,revision into v_saved,v_next
 from public.save_workspace_shared_app_state_patch('10000000-0000-0000-0000-000000000001',
  '{"journey":{"id":"from-admin"}}'::jsonb,v_rev);
 if not v_saved or v_next<>v_rev+1 then raise exception 'Admin module patch failed'; end if;
 -- A stale write (other device) must fail without erasing anything.
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
 select saved,revision into v_saved,v_next
 from public.save_workspace_shared_app_state_patch('10000000-0000-0000-0000-000000000001',
  '{"companies":[{"id":"reception"}]}'::jsonb,v_rev);
 if v_saved or v_next<>v_rev+1 then raise exception 'Stale patch was accepted'; end if;
 select saved,revision into v_saved,v_next
 from public.save_workspace_shared_app_state_patch('10000000-0000-0000-0000-000000000001',
  '{"companies":[{"id":"reception"}]}'::jsonb,v_next);
 if not v_saved or v_next<>v_rev+2 then raise exception 'Retry after conflict failed'; end if;
 select state into v_new from public.get_workspace_shared_app_state('10000000-0000-0000-0000-000000000001');
 if v_new->'journey'->>'id'<>'from-admin' or v_new->'companies'->0->>'id'<>'reception' then
  raise exception 'Different module patches overwrote each other';
 end if;
 if v_new->'patients' is distinct from v_old->'patients' then
  raise exception 'Unchanged patient records were overwritten';
 end if;
 select saved,revision into v_saved,v_next
 from public.save_workspace_shared_app_state_patch('10000000-0000-0000-0000-000000000001',
   '{"companies":[{"id":"reception"}]}'::jsonb,v_next);
 if not v_saved or v_next<>v_rev+2 then raise exception 'Identical patch changed revision'; end if;
 begin
  perform * from public.save_workspace_shared_app_state_patch('10000000-0000-0000-0000-000000000001',
   '{"patients":[]}'::jsonb,v_next);
  raise exception 'Unauthorized patient deletion accepted';
 exception when others then
  if sqlerrm='Unauthorized patient deletion accepted' then raise; end if;
  if sqlerrm not like '%No se pueden retirar expedientes%' then raise; end if;
 end;
end $test$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
do $deny$
begin
 begin
  perform * from public.save_workspace_shared_app_state_patch(
   '10000000-0000-0000-0000-000000000001','{"journey":{"id":"viewer"}}'::jsonb,5);
  raise exception 'Viewer could write';
 exception when others then
  if sqlerrm='Viewer could write' then raise; end if;
  if sqlerrm not like '%No tienes permiso para modificar%' then raise; end if;
 end;
end $deny$;
reset role;
do $grants$
begin
 if has_function_privilege('anon','public.save_workspace_shared_app_state_patch(uuid,jsonb,integer)','execute') then
  raise exception 'Anonymous role can invoke patch';
 end if;
end $grants$;
\echo 'OK: atomic module patches, CAS, patient safety and viewer isolation'
