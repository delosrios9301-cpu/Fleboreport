import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const migration=await readFile(new URL('../supabase/migrations/20261112205607_invitation_preview_rpc.sql',import.meta.url),'utf8');
const rls=await readFile(new URL('../supabase/migrations/20261112224000_hide_unaccepted_home_visit_rows.sql',import.meta.url),'utf8');
const client=await readFile(new URL('../domicilios.js',import.meta.url),'utf8');
test('preacceptance RPC exposes only minimal invitation fields',()=>{
 assert.match(migration,/list_home_visit_invitation_previews/);
 assert.match(migration,/a\.assigned_user_id=v_uid/);
 assert.match(migration,/a\.status='invited'/);
 assert.match(migration,/v\.status='pending_acceptance'/);
 assert.doesNotMatch(migration,/select v\.\*|select a\.\*|v\.address|v\.patient_phone|v\.notes|v\.patient_id/i);
 assert.match(migration,/revoke all on function/);
});
test('raw home visits require accepted assignment or manager permissions',()=>{
 assert.match(rls,/as restrictive for select to authenticated/);
 assert.match(rls,/private\.has_workspace_permission\(workspace_id,'domicilios','manage'\)/);
 assert.match(rls,/array\['accepted'\]::text\[\]/);
 assert.doesNotMatch(rls,/array\['invited'/);
});
test('client synthesizes no patient details and loads full visit only after accepting',()=>{
 assert.match(client,/function fetchInvitationPreviewRows/);
 assert.match(client,/list_home_visit_invitation_previews/);
 assert.match(client,/patient_id:null,patient_phone:null,address:'',latitude:null,longitude:null,notes:null/);
 assert.match(client,/home_visit_tests:\[\],home_visit_events:\[\],home_visit_documents:\[\]/);
 assert.match(client,/homeVisitSyncCursor=null;\s*try\{await loadCloudVisits\(\)/);
 assert.doesNotThrow(()=>new Function(client));
});
