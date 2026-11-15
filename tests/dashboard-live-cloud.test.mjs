import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const get=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [source,styles,html,worker]=await Promise.all([
 get('dashboard-live-cloud.js'),get('dashboard-live-cloud.css'),
 get('index.html'),get('service-worker.js')
]);
const sandbox={module:{exports:{}}};
vm.runInNewContext(source,sandbox,{filename:'dashboard-live-cloud.js'});
const core=sandbox.module.exports;

test('Cuenta domicilios archivados finalizados y no multiplica pacientes atendidos',()=>{
 const result=core.calculate({
  home:[
   {id:'v1',status:'completed',patient_id:'p1',completed_at:'2026-11-14T19:00:00Z',archived_at:'2026-11-15T08:00:00Z'},
   {id:'v2',status:'completed',patient_id:'p1',completed_at:'2026-11-15T18:00:00Z',archived_at:null},
   {id:'v3',status:'accepted',patient_id:'p2',scheduled_at:'2026-11-16T18:00:00Z',archived_at:null}
  ],
  patients:[{id:'p1'},{id:'p2'},{id:'p3'}],
  homeTests:[{id:'t1',status:'collected',quantity:2,test_name:'Hemograma'},{id:'t2',status:'pending',quantity:1,test_name:'Glucosa'}],
  attentions:[{id:'a1',patient_id:'p3'}],attentionTests:[],
  studies:2,samples:[{id:'s1',status:'Almacenada',workflow_status:'CONGELADOR_DEFINITIVO',processed_at:'2026-11-13T10:00:00Z'}],
  journeys:[],reports:0,companies:1,invoices:[],
  sharedLegacy:{companies:1,reports:0,journeys:0,participations:0}
 },new Date('2026-11-15T21:00:00Z'));
 assert.equal(result.patients,3);
 assert.equal(result.attended,2);
 assert.equal(result.homeTotal,3);
 assert.equal(result.homeCompleted,2);
 assert.equal(result.homeArchived,1);
 assert.equal(result.homeActive,1);
 assert.equal(result.homeToday,1);
 assert.equal(result.homeMonth,2);
 assert.equal(result.homeTestsCollected,2);
 assert.equal(result.homeTestsPending,1);
 assert.equal(result.testsTaken,2);
 assert.equal(result.studies,2);
 assert.equal(result.processed,1);
 assert.equal(result.definitive,1);
 assert.equal(result.journeys,0);
 assert.equal(result.revenue,0);
 assert.equal(result.homeStatuses.completed,2);
 assert.equal(result.homeDates.reduce((n,x)=>n+x.count,0),2);
});

test('Una tabla no disponible deja el KPI sin verificar en vez de usar cero',()=>{
 const x=core.calculate({home:null,patients:null,homeTests:null,attentions:null,attentionTests:null,
  samples:null,studies:null,journeys:null,reports:null,companies:null,invoices:null});
 assert.equal(x.patients,null);
 assert.equal(x.homeCompleted,null);
 assert.equal(x.attended,null);
 assert.equal(x.testsTaken,null);
 assert.equal(x.revenue,null);
 assert.equal(x.homeStatuses,null);
});

test('Reconcilia empresa, jornadas y reportes de ambos formatos en la nube sin duplicar',()=>{
 const legacy=core.legacyFromState({
  companies:[{id:'c1',active:true}],
  reportHistory:[
   {id:'r1',snapshot:{journeyDate:'2026-11-13',start:'09:00',end:'10:00',clientName:'Empresa A'}},
   {id:'r2',snapshot:{journeyDate:'2026-11-13',start:'09:00',end:'10:00',clientName:'Empresa A'}},
   {id:'r3',snapshot:{journeyDate:'2026-11-14',start:'09:00',end:'10:00',clientName:'Empresa A'}},
   {id:'r4',snapshot:{journeyDate:'2026-11-14',start:'09:00',end:'10:00',clientName:'Empresa A'}},
   {id:'r5',snapshot:{journeyDate:'2026-11-15',start:'09:00',end:'10:00',clientName:'Empresa A'}}
  ],
  journeyEntries:[{id:'p1',journeyId:'j1'},{id:'p2',journeyId:'j2'},{id:'p3',journeyId:'j3'},{id:'p4',journeyId:'j3',removedAt:'2026-11-15'}]
 });
 assert.equal(legacy.companies,1);
 assert.equal(legacy.reports,5);
 assert.equal(legacy.journeys,3);
 assert.equal(legacy.participations,3);
 const calc=core.calculate({home:[],patients:[],homeTests:[],attentions:[],attentionTests:[],samples:[],
  studies:2,journeys:[],reports:0,companies:0,invoices:[],sharedLegacy:legacy});
 assert.equal(calc.companies,1);
 assert.equal(calc.reports,5);
 assert.equal(calc.journeys,3);
 assert.equal(calc.participations,3);
 assert.equal(core.cloudCount(5,5),5);
 assert.equal(core.cloudCount(0,null),null,'El cero en tabla no oculta una fuente modular sin verificar');
});

test('Fecha de Panamá usa zona local clínica y no fecha UTC',()=>{
 assert.equal(core.day('2026-11-16T02:00:00Z'),'2026-11-15');
 assert.equal(core.day('2026-11-15T04:59:00Z'),'2026-11-14');
});

test('Consultas por workspace con RLS, solo lectura, sin registros ficticios',()=>{
 assert.match(source,/\.eq\('workspace_id',ws\)/);
 assert.match(source,/\.is\('archived_at',null\)/);
 assert.match(source,/from\(table\)\.select/);
 assert.match(source,/home:rows\(client,ws,'home_visits'/);
 assert.match(source,/homeTests:rows\(client,ws,'home_visit_tests'/);
 assert.match(source,/patients:rows\(client,ws,'patients'/);
 assert.match(source,/studies:count\(client,ws,'clinical_studies'/);
 assert.match(source,/samples:rows\(client,ws,'clinical_samples'/);
 assert.match(source,/invoices:rows\(client,ws,'invoices'/);
 assert.match(source,/reports:count\(client,ws,'reports'/);
 assert.match(source,/companies:count\(client,ws,'companies'/);
 assert.match(source,/get_workspace_shared_app_state_meta/);
 assert.match(source,/get_workspace_modular_snapshot/);
 assert.match(source,/get_workspace_shared_app_state/);
 assert.match(source,/sharedLegacy:legacyCloudCounts\(client,ws\)/);
 assert.doesNotMatch(source,/\.upsert\(|\.insert\(|\.delete\(|localStorage|sessionStorage|FleboAppState/);
 assert.match(source,/window\.refreshDashboard=function\(\)/);
 assert.match(source,/flebo:home-history-changed/);
 assert.match(source,/dl-cloud-dashboard/);
});

test('Panel Inicio reemplaza visualizaciones locales con estado y gráficos reales',()=>{
 assert.match(source,/setKpi\(0,'Pacientes totales'/);
 assert.match(source,/setKpi\(6,'Atenciones domiciliarias'/);
 assert.match(source,/Estado de los domicilios/);
 assert.match(source,/Domicilios finalizados · últimos 7 días/);
 assert.match(source,/Estado de muestras clínicas/);
 assert.match(source,/Pruebas tomadas en domicilios/);
 assert.match(source,/Jornadas consolidadas de la nube/);
 assert.match(styles,/#view-home\.dl-cloud-dashboard \.hp-trend-group/);
 assert.match(styles,/@media\(max-width:760px\)/);
 assert.match(html,/dashboard-live-cloud\.js\?v=20261115-cloud1/);
 assert.match(html,/dashboard-live-cloud\.css\?v=20261115-cloud1/);
 assert.match(worker,/'\.\/dashboard-live-cloud\.js'/);
 assert.match(worker,/'\.\/dashboard-live-cloud\.css'/);
});


test('Inicio compacto: cuatro cifras principales y detalles plegados sin decenas de tarjetas',()=>{
 assert.match(source,/dlLiveHighlights/);
 for(const id of ['dlQuickPatients','dlQuickHomes','dlQuickTests','dlQuickProcessed'])assert.ok(source.includes(id),id);
 assert.match(source,/dlLiveDetails/);
 assert.match(source,/el\('details','dl-live-more'\)/);
 assert.match(source,/el\('summary','','Ver todos los indicadores'\)/);
 assert.doesNotMatch(source,/el\('article','dl-live-card'\)/);
 assert.match(source,/dl-live-metric/);
 assert.match(styles,/\.dl-live-highlights/);
 assert.match(styles,/\.dl-live-metrics/);
 assert.match(styles,/body\.fr2-app-authorized\.cm-workspace\.vc-compact\.hp-dashboard #view-home\.dl-cloud-dashboard \.vc-kpi-stage/);
 assert.match(styles,/display:none!important/);
});

test('Gráficos interactivos adaptados a móvil, tablet y PC con circular y barras',()=>{
 for(const tab of ['overview','home','clinical']){
  assert.match(source,new RegExp("'"+tab+"'"));
 }
 for(const name of ['Resumen','Domicilios','Clínico'])assert.ok(source.includes(name),name);
 assert.match(source,/setAttribute\('aria-selected',active\?'true':'false'\)/);
 assert.match(source,/button\.addEventListener\('keydown'/);
 assert.match(source,/chartBox\('Estado de los domicilios','dlLiveStatuses'\)/);
 assert.match(source,/chartBox\('Actividad por módulo','dlLiveModules'\)/);
 assert.match(source,/chartBox\('Domicilios finalizados · últimos 7 días','dlLiveDays'\)/);
 assert.match(source,/chartBox\('Estado de muestras clínicas','dlLiveClinical'\)/);
 assert.match(source,/function donutChart\(/);
 assert.match(source,/conic-gradient\(/);
 assert.match(source,/function paintDailyChart\(/);
 assert.match(source,/function chartRows\(/);
 assert.match(styles,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(styles,/@media\(max-width:1000px\)/);
 assert.match(styles,/@media\(max-width:760px\)/);
 assert.match(styles,/@media\(max-width:355px\)/);
 assert.match(styles,/prefers-reduced-motion:reduce/);
 assert.match(styles,/dl-live-tab-panel\[hidden\]/);
});

test('Accesos directos siguen disponibles sin ocupar la pantalla del teléfono',()=>{
 assert.match(source,/el\('details','dl-live-access-details'\)/);
 assert.match(source,/Accesos rápidos a módulos/);
 assert.match(source,/launch\.insertAdjacentElement\('beforebegin',access\)/);
 assert.match(source,/access\.append\(launch\)/);
 assert.match(styles,/\.dl-live-access-details:not\(\[open\]\)>\.cm-launchpad\{display:none!important\}/);
 assert.match(source,/min-width:1050px/);
});

