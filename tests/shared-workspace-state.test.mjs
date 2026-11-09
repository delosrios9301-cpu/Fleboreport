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

test('la identidad de pacientes nunca fusiona registros distintos por nombre o código reutilizable', () => {
  const patientBranches = [...migration.matchAll(/case when v_key='patients' then([\\s\\S]*?)\\n\\s*else/g)];
  assert.equal(patientBranches.length, 2);
  for (const match of patientBranches) {
    const identity = match[1];
    assert.match(identity, /e\.value->>'document'/);
    assert.match(identity, /e\.value->>'id'/);
    assert.match(identity, /e\.value::text/);
    assert.doesNotMatch(identity, /e\.value->>'code'/);
    assert.doesNotMatch(identity, /e\.value->>'name'/);
  }
});

test('la migración no vuelve a habilitar el reinicio total deshabilitado', () => {
  assert.ok(migration.includes('revoke all on function public.reset_workspace_completely(uuid,text) from public,anon,authenticated,service_role;'));
  assert.ok(migration.includes('revoke all on function private.reset_workspace_completely(uuid,text) from public,anon,authenticated,service_role;'));
});
