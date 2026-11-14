import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [ui,sql,html,worker]=await Promise.all([
 read('domicilios-volunteer-ui.js'),
 read('supabase/migrations/20261114160000_volunteer_only_today_panama.sql'),
 read('index.html'),read('service-worker.js')
]);
test('Las ofertas visibles corresponden solo al día civil de Panamá',()=>{
 assert.match(ui,/function panamaCalendarDay\(value\)/);
 assert.match(ui,/timeZone:'America\/Panama'/);
 assert.match(ui,/formatToParts\(d\)/);
 assert.match(ui,/function isScheduledToday\(value\)/);
 assert.match(ui,/offers=\(data\|\|\[\]\)\.filter\(v=>v\.visit_id&&v\.scheduled_at&&isScheduledToday\(v\.scheduled_at\)\)/);
 assert.match(ui,/if\(!isScheduledToday\(offer\.scheduled_at\)\)/);
 assert.match(ui,/setInterval\(/);
 assert.match(ui,/observedPanamaDay/);
});
test('La base de datos impide reclamar otros días y programa nuevos avisos',()=>{
 assert.match(sql,/create or replace function public\.list_available_home_visits/i);
 assert.match(sql,/create or replace function public\.volunteer_home_visit/i);
 assert.match(sql,/create or replace function private\.notify_open_home_visit/i);
 assert.match(sql,/create or replace function private\.publish_today_unassigned_home_visit_alerts/i);
 assert.match(sql,/scheduled_at at time zone 'America\/Panama'/i);
 assert.match(sql,/v_visit\.scheduled_at at time zone 'America\/Panama'/i);
 assert.match(sql,/new\.scheduled_at at time zone 'America\/Panama'/i);
 assert.match(sql,/where public\.workflow_sla_alerts\.resolved_at is not null/i);
 assert.match(sql,/fleboreport-volunteer-domicilios-today/);
 assert.match(sql,/select cron\.schedule/);
 assert.doesNotMatch(sql,/delete from public\.home_visits/);
 assert.match(html,/domicilios-volunteer-ui\.js\?v=20261114-vol3/);
 assert.match(worker,/día programado según hora de Panamá v333/);
 assert.doesNotThrow(()=>new Function(ui));
});
