import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const js=readFileSync(new URL('../domicilios.js',import.meta.url),'utf8');
const sql=readFileSync(new URL('../supabase/migrations/20261114135500_voluntary_home_visit_claim_admin_and_alerts.sql',import.meta.url),'utf8');
const ui=js.match(/function canAssignUnassignedVisit\(v\)\{[\s\S]*?\n\}/);
assert.ok(ui,'Falta la validación de permisos en la ficha');
function allowed(role,grants,visit){
 const cloud={role,ready:true,user:{id:'staff-1'},workspaceId:'work-1'};
 const window={fleboCan:(module,action)=>module==='domicilios'&&action==='assign'&&grants};
 return runInNewContext(ui[0]+'\ncanAssignUnassignedVisit(v)',{v:visit,cloud,window});
}
const unassigned={
 status:'Pendiente de asignación',assignmentStatus:null,archivedAt:null,
 scheduledDate:'2026-11-29'
};
test('Asignación administrativa de visita ya creada funciona para cualquier fecha',()=>{
 for(const scheduledDate of ['2026-11-22','2026-11-23','2026-11-29','2026-12-15'])
  assert.equal(allowed('admin',false,{...unassigned,scheduledDate}),true);
 assert.equal(allowed('coordinator',true,unassigned),true);
 assert.equal(allowed('technician',false,unassigned),false);
});
test('No permite reemplazar a un responsable ya invitado o aceptado',()=>{
 for(const assignmentStatus of ['invited','accepted']){
  assert.equal(allowed('admin',true,{...unassigned,assignmentStatus}),false);
 }
 assert.equal(allowed('admin',true,{...unassigned,archivedAt:'2026-11-22'}),false);
 assert.equal(allowed('admin',true,{...unassigned,status:'En camino'}),false);
 assert.equal(allowed('admin',true,{...unassigned,status:'Finalizado'}),false);
});
test('La interfaz expone el botón y usa directorio autorizado y RPC sin tomar el domicilio voluntariamente',()=>{
 assert.match(js,/class="hv-ref-manage-assign" data-hv-assign="/);
 assert.match(js,/openHomeVisitAssignment\(target\.dataset\.hvAssign\)/);
 assert.match(js,/list_domicile_assignable_members/);
 assert.match(js,/client\.rpc\('assign_home_visit_member',\{p_home_visit_id:visit\.id,p_user_id:chosen\}\)/);
 assert.match(js,/invokeDomicileNotifications\(\{action:'dispatch',assignment_id:data\}\)/);
 assert.match(js,/loadCloudVisits\(\{forceFull:true\}\)/);
 assert.match(sql,/create or replace function public\.assign_home_visit_member/i);
 const start=sql.indexOf('CREATE OR REPLACE FUNCTION public.assign_home_visit_member');
 const end=sql.indexOf('CREATE OR REPLACE FUNCTION ',start+1);
 const body=sql.slice(start,end>0?end:undefined);
 assert.match(body,/has_workspace_permission.*'domicilios','assign'/);
 assert.match(body,/p_user_id/);
 assert.doesNotMatch(body,/scheduled_at at time zone|'America\/Panama'|current_date/);
});
