import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const sql=await readFile(new URL('../supabase/migrations/20261112160713_technician_patient_clinical_read_scope.sql',import.meta.url),'utf8');
test('patient access requires current accepted assignment for technician',()=>{
 assert.match(sql,/create or replace function private\.technician_has_accepted_patient/);
 assert.match(sql,/a\.assigned_user_id=\(select auth\.uid\(\)\) and a\.status='accepted'/);
 assert.match(sql,/order by x\.assigned_at desc,x\.id desc/);
 assert.match(sql,/as restrictive for select to authenticated/);
});
test('clinical records require explicit studies or processing view permission',()=>{
 assert.match(sql,/clinical_technician_module_read_guard/);
 assert.match(sql,/private\.has_workspace_permission\(workspace_id,'studies','view'\)/);
 assert.match(sql,/private\.has_workspace_permission\(workspace_id,'processing','view'\)/);
});
