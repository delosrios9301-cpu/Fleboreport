import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const p=new URL('../supabase/migrations/20261114141500_volunteer_notification_permission_scope.sql',import.meta.url);
const sql=await readFile(p,'utf8');
test('Ofertas y confirmaciones se envían únicamente a cuentas activas con permiso',()=>{
 assert.match(sql,/private\.can_member_view_home_visit/);
 assert.match(sql,/wm\.active/);
 assert.match(sql,/mp\.allowed/);
 assert.match(sql,/rp\.allowed/);
 assert.match(sql,/member_has_workspace_role/);
 assert.match(sql,/volunteer_available/);
 assert.match(sql,/volunteer_claimed/);
 assert.match(sql,/revoke all on function private\.can_member_view_home_visit/);
});
