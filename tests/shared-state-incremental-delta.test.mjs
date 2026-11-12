import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const sql=await readFile(new URL('../supabase/migrations/20261112181852_shared_state_incremental_deltas.sql',import.meta.url),'utf8');
const cloud=await readFile(new URL('../cloud-state-sync.js',import.meta.url),'utf8');
test('legacy full writes track per-section versions and deletion tombstones',()=>{
 assert.match(sql,/add column if not exists key_versions jsonb/);
 assert.match(sql,/before update of state on public\.workspace_shared_app_state/);
 assert.match(sql,/old\.state->v_key is distinct from new\.state->v_key/);
 assert.match(sql,/jsonb_object_keys\(s\.state\)/);
 assert.match(sql,/v_removed:=array_append\(v_removed,v_key\)/);
});
test('reader respects RLS-equivalent role projection and stale revision fallback',()=>{
 assert.match(sql,/private\.member_has_workspace_role\(/);
 assert.match(sql,/v_key not in \('reportHistory','reportHistoryLogos'\)/);
 assert.match(sql,/v_reports_allowed/);
 assert.match(sql,/p_since_revision>v_rev/);
 assert.match(cloud,/fetchRemoteDelta\(revision\)/);
 assert.match(cloud,/!pendingLocalChanges&&!dirtyAgain/);
 assert.match(cloud,/delta\.removed_keys/);
 assert.doesNotThrow(()=>new Function(cloud));
});


test('confirmed revision fingerprints are computed from applied client view',()=>{
 assert.match(cloud,/hashState\(app\(\)\|\|remote\.state\)/);
 assert.match(cloud,/applyCloudState\(candidate\);\s*const h=await hashState\(app\(\)\|\|candidate\)/);
 assert.match(cloud,/applyCloudState\(merged\);const h=await hashState\(app\(\)\|\|merged\)/);
});
