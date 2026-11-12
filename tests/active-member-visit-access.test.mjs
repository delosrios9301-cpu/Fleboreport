import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const sql=await readFile(new URL('../supabase/migrations/20261112210511_require_active_visit_assignee.sql',import.meta.url),'utf8');
test('accepted home visit RLS also requires current active workspace membership',()=>{
 assert.match(sql,/alter policy home_visits_invitation_details_protection/);
 assert.match(sql,/public\.is_workspace_member\(workspace_id\)/);
 assert.match(sql,/array\['accepted'\]::text\[\]/);
 assert.doesNotMatch(sql,/invited/);
});
