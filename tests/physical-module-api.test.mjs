import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const s=await readFile(new URL('../supabase/migrations/20261112202000_modular_api.sql',import.meta.url),'utf8');
test('modular APIs compare authoritative physical data and preserve patient guards',()=>{
 assert.match(s,/full_state:=full_state\|\|p/);
 assert.match(s,/full_state is distinct from original/);
 assert.match(s,/p_expected_module_revision is distinct from old_module_revision/);
 assert.match(s,/public\.save_workspace_shared_app_state\(/);
 assert.match(s,/private\.has_workspace_permission/);
 assert.match(s,/revoke all on function public\.get_workspace_modular_snapshot/);
});
