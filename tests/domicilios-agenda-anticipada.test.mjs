import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261122223000_schedule_direct_assignment_future.sql');
const client=read('domicilios.js');
const edge=read('supabase/functions/domicilios-notifications/index.ts');
const html=read('index.html');
const sw=read('service-worker.js');

test('agenda previa se confirma por backend solo para una fecha futura de Panamá',()=>{
 assert.match(sql,/at time zone 'America\/Panama'\)::date\s*>\s*\(clock_timestamp\(\) at time zone 'America\/Panama'\)::date/);
 assert.match(sql,/if v_future then[\s\S]*status='accepted',responded_at=clock_timestamp\(\),response_note='assigned_schedule_future'/i);
 assert.match(sql,/update public\.home_visits set status='accepted'/i);
 assert.match(sql,/elsif v_visit\.status='pending_assignment' then[\s\S]*set status='pending_acceptance'/i);
 assert.doesNotMatch(sql,/update public\.home_visits set status='accepted'\s+where[^;]*scheduled_at\s*::date\s*=/i);
});

test('resguardos de servidor exigen autenticación, permisos y transacción identificada',()=>{
 assert.match(sql,/private\.has_workspace_permission\(v_visit\.workspace_id,'domicilios','assign'\)/);
 assert.match(sql,/m\.active\)/);
 assert.match(sql,/flebo\.planned_assignment_visit/);
 assert.match(sql,/flebo\.planned_assignment_user/);
 assert.match(sql,/to_jsonb\(new\)-'status'-'updated_at'/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.assign_home_visit_member\(uuid,uuid\) FROM PUBLIC,anon/);
});

test('fecha local estricta diferencia agenda de mañana de los extras de hoy',()=>{
 const today='2026-11-22';
 const planned=date=>date>today;
 assert.equal(planned('2026-11-23'),true);
 assert.equal(planned('2026-12-01'),true);
 assert.equal(planned('2026-11-22'),false);
 assert.equal(planned('2026-11-21'),false);
 assert.match(client,/canonicalHomeVisitDate\(v\.scheduledDate\)>today\(\)/);
 assert.match(client,/assignmentStatus=plannedSchedule\?'accepted':'invited'/);
 assert.match(client,/if\(plannedSchedule\)v\.status='Aceptado'/);
});

test('invitaciones pendientes conservan privacidad y las visitas de agenda muestran ficha completa',()=>{
 assert.match(client,/assignment\.response_note==='assigned_schedule_future'/);
 assert.match(client,/const plannedNotice=v\.autoAssigned/);
 assert.match(client,/v\.assignmentStatus==='invited'&&v\.status==='Pendiente de aceptación'/);
 assert.match(client,/patient_id:null,patient_phone:null,address:'',latitude:null,longitude:null,notes:null/);
 assert.doesNotThrow(()=>new Function(client));
});

test('avisos distinguen programados y extras y actualización PWA carga script nuevo',()=>{
 assert.match(edge,/const scheduledDirect = assignment\.status === "accepted"/);
 assert.match(edge,/scheduledDirect \? "scheduled" : "same_day_extra"/);
 assert.match(edge,/Ya forma parte de tu agenda y no necesitas aceptarlo/);
 assert.match(edge,/Abre TALCSYS Lab para aceptar o rechazar el domicilio/);
 assert.match(html,/domicilios\.js\?v=20261122-agenda-anticipada-v1/);
 assert.match(sw,/fleboreport-shell-v333-20261122-agenda-anticipada/);
});
