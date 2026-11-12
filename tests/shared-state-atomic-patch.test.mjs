import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const cloud=await readFile(new URL('../cloud-state-sync.js',import.meta.url),'utf8');
const sql=await readFile(new URL('../supabase/migrations/20261112182000_shared_state_atomic_patch.sql',import.meta.url),'utf8');

test('only changed top-level workspace keys are sent to the patch RPC',()=>{
 const match=cloud.match(/function changedStateFields\(payload,baseline\)\{[\s\S]*?\n\}/);
 assert.ok(match,'Pure patch helper exists');
 const diff=new Function(match[0]+';return changedStateFields;')();
 const huge='very-big-logo'.repeat(5000);
 const before={company:{logo:huge},reportHistoryLogos:{logo:huge},patients:[{id:'one'}],journey:{id:'old'}};
 const after={...before,journey:{id:'new'}};
 assert.deepEqual(diff(after,before),{journey:{id:'new'}});
 assert.ok(JSON.stringify(diff(after,before)).length<JSON.stringify(after).length/10);
 assert.deepEqual(diff(before,before),{});
});
test('patch API preserves legacy permissions, patient deletion guard and CAS',()=>{
 assert.match(sql,/private\.member_has_workspace_role\(p_workspace_id,v_uid/);
 assert.match(sql,/p_expected_revision is distinct from v_revision/);
 assert.match(sql,/public\.save_workspace_shared_app_state\(/);
 assert.match(sql,/coalesce\(v_state,'\{\}'::jsonb\)\|\|p_patch/);
 assert.match(sql,/revoke all on function public\.save_workspace_shared_app_state_patch/);
 assert.doesNotMatch(sql,/update public\.patients|delete from public\./);
 assert.match(cloud,/partial\?'save_workspace_shared_app_state_patch':'save_workspace_shared_app_state'/);
 assert.doesNotThrow(()=>new Function(cloud));
});
