import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const cloud = await readFile(new URL('../cloud-state-sync.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261109080000_shared_workspace_app_state.sql', import.meta.url), 'utf8');

test('la sincronización general usa un único estado por espacio de trabajo', () => {
  assert.match(cloud, /get_workspace_shared_app_state_meta/);
  assert.match(cloud, /get_workspace_shared_app_state'/);
  assert.match(cloud, /save_workspace_shared_app_state/);
  assert.doesNotMatch(cloud, /from\('workspace_app_state'\)/);
  assert.doesNotThrow(() => new Function(cloud));
});

test('la migración consolida snapshots antiguos sin eliminarlos y restringe escrituras', () => {
  assert.match(migration, /workspace_shared_app_state/);
  assert.match(migration, /workspace_app_state s/);
  assert.match(migration, /member_has_workspace_role\(p_workspace_id,s\.user_id/);
  assert.match(migration, /private\.member_has_workspace_role/);
  assert.match(migration, /array\['admin','clinician','reception'\]/);
  assert.match(migration, /revoke all on public\.workspace_shared_app_state from anon, authenticated/i);
  assert.match(migration, /save_workspace_shared_app_state/);
  assert.match(migration, /create or replace function public\.reset_workspace_completely/i);
  assert.match(migration, /create or replace function public\.reset_workspace_operational_data/i);
});

test('la consolidación usa la cédula solo como identidad primaria de pacientes', () => {
  assert.equal((migration.match(/case when v_key='patients' then/g) || []).length, 2);
  assert.equal((migration.match(/nullif\(e\.value->>'id',''\)/g) || []).length >= 4, true);
  const patientBranch = migration.indexOf("case when v_key='patients' then");
  const otherBranch = migration.indexOf("else", patientBranch);
  const genericId = migration.indexOf("nullif(e.value->>'id','')", otherBranch);
  const genericDocument = migration.indexOf("regexp_replace", otherBranch);
  assert.ok(patientBranch >= 0 && otherBranch > patientBranch);
  assert.ok(genericId >= 0 && genericDocument > genericId);
});
