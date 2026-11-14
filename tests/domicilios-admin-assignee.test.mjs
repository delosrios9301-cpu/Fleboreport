import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const f=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [js,html]=await Promise.all([f('domicilios.js'),f('index.html')]);
test('Administrador y miembros activos se eligen por directorio de laboratorio',()=>{
 assert.match(js,/list_domicile_assignable_members/);
 assert.match(js,/assign_home_visit_member/);
 assert.match(js,/selectedProfessional\?\.user_id/);
 assert.match(js,/assignedUserId:v\.assignedUserId/);
 assert.match(html,/domicilios\.js\?v=20261114-vol1/);
});
test('Admin asignado tiene controles de campo solo para su propia asignación',()=>{
 assert.match(js,/function isMyAssignedDomicile\(v\)/);
 assert.match(js,/v\.assignedUserId===cloud\.user\.id/);
 assert.match(js,/cloud\.role==='technician'\|\|isMyAssignedDomicile\(v\)/);
 assert.match(js,/if\(cloud\.role==='technician'\|\|isMyAssignedDomicile\(v\)\)return technicianFieldScreen\(v\)/);
 assert.doesNotThrow(()=>new Function(js));
});
