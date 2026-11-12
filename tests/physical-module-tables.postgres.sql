-- Physical partition, conservative data retention and transactional legacy bridge.
\set ON_ERROR_STOP on
\i supabase/migrations/20261112202121_private_module_tables.sql
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $test$
declare
 ws uuid:='10000000-0000-0000-0000-000000000001';
 legacy jsonb;
 combined jsonb:='{}'::jsonb;
 one jsonb;
 rev integer;
 saved boolean;
 next_rev integer;
 company_before jsonb;
 journey_after jsonb;
 company_rev integer;
 company_rev_after integer;
 module text;
begin
 select state,revision into legacy,rev from public.get_workspace_shared_app_state(ws);
 select payload into one from private.fr_module_patients where workspace_id=ws;
 -- Direct access must never be granted to authenticated role.
 raise exception 'Module table leaked to client';
exception when insufficient_privilege then
 null;
end $test$;
reset role;
do $backfill$
declare
 ws uuid:='10000000-0000-0000-0000-000000000001';
 legacy jsonb;
 reconstructed jsonb:='{}'::jsonb;
 item jsonb;
 module text;
 old_report int;
 new_report int;
 state_updated jsonb;
 old_rev integer;
 saved boolean;
 new_rev integer;
begin
 select state,revision into legacy,old_rev from public.workspace_shared_app_state where workspace_id=ws;
 for module in select unnest(array['patients','journeys','companies','reports','catalog','attentions','clinical','settings','extras']::text[]) loop
  execute format('select payload from private.%I where workspace_id=$1','fr_module_'||module)
   into item using ws;
  if item is null then raise exception 'Missing migrated module %',module;end if;
  reconstructed:=reconstructed||item;
 end loop;
 if reconstructed is distinct from legacy then raise exception 'Data parity mismatch';end if;
 select module_revision into old_report from private.fr_module_reports where workspace_id=ws;
 -- Test a single simulated edit in an isolated transaction with a rollback.
 -- The outer integration test transaction must not modify any real records.
end $backfill$;
begin;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select * from public.save_workspace_shared_app_state_patch(
 '10000000-0000-0000-0000-000000000001',
 '{"journey":{"id":"synthetic-only"}}'::jsonb,
 (select revision from public.get_workspace_shared_app_state('10000000-0000-0000-0000-000000000001') limit 1));
reset role;
do $assert$
declare ws uuid:='10000000-0000-0000-0000-000000000001';
begin
 if (select payload->'journey'->>'id' from private.fr_module_journeys where workspace_id=ws)<>'synthetic-only'
 then raise exception 'Legacy write was not forwarded to physical Journey';end if;
end $assert$;
rollback;
do $security$
begin
 if has_table_privilege('authenticated','private.fr_module_patients','select')
 or has_table_privilege('anon','private.fr_module_reports','select')
 then raise exception 'Raw module table exposed';end if;
end $security$;

-- A protected reset removes the compatibility row; its module tables must
-- disappear in the same transaction and reappear only when state is rebuilt.
begin;
delete from public.workspace_shared_app_state
 where workspace_id='10000000-0000-0000-0000-000000000001';
do $reset_test$
declare w uuid:='10000000-0000-0000-0000-000000000001';
begin
 if exists(select 1 from private.fr_module_patients where workspace_id=w)
 or exists(select 1 from private.fr_module_journeys where workspace_id=w)
 or exists(select 1 from private.fr_module_reports where workspace_id=w)
 or exists(select 1 from private.fr_module_extras where workspace_id=w) then
  raise exception 'Reset left orphaned physical modules';
 end if;
end $reset_test$;
rollback;

\echo 'OK: physical module backfill, legacy bridge and access checks'
