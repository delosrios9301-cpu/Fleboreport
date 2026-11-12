import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const sql=await readFile(new URL('../supabase/migrations/20261112210506_restrict_private_function_execution.sql',import.meta.url),'utf8');
const indexes=await readFile(new URL('../supabase/migrations/20261112210509_targeted_assignment_indexes.sql',import.meta.url),'utf8');
test('direct invocation of internal private functions is restricted',()=>{
 for(const name of ['notify_clinical_sample_pending','notify_clinical_sample_registered',
 'track_workspace_shared_state_keys','generate_coagulation_alerts','reset_workspace_operational_data'])
  assert.match(sql,new RegExp(name));
 assert.match(sql,/revoke all on function %s from public, anon, authenticated/);
 assert.doesNotMatch(sql,/has_workspace_permission\(\)|member_has_workspace_role\(\)/);
});
test('indexes target invite and latest-assignment reads only',()=>{
 assert.match(indexes,/home_visit_assignments_invited_preview_idx/);
 assert.match(indexes,/home_visit_assignments_recent_status_idx/);
 assert.doesNotMatch(indexes,/drop index|drop table|truncate|delete from/i);
});
