import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const s=await readFile(new URL('../supabase/migrations/20261112160710_preserve_patient_identities_on_shared_sync.sql',import.meta.url),'utf8');
test('sync shared state preserves patients unless role has granular delete permission',()=>{
  assert.match(s,/private\.has_workspace_permission\(p_workspace_id,'patients','delete'\)/);
  assert.match(s,/jsonb_array_elements\(v_previous->'patients'\)/);
  assert.match(s,/jsonb_array_elements\(/);
  assert.match(s,/regexp_replace\(lower\(btrim\(/);
  assert.match(s,/or \(\s*nullif\(previous_patient\.value->>'id'/);
  assert.match(s,/raise exception 'No se pueden retirar expedientes/);
  assert.match(s,/for update/);
});
