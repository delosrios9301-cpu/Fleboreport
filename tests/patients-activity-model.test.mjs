import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [source,ui,css,html,sw]=await Promise.all([
 read('patients-activity-model.js'),read('patients-activity-ui.js'),read('patients-activity-ui.css'),
 read('index.html'),read('service-worker.js')
]);
const context={module:{exports:{}},Date,Map,Set,String,Number,Array};
vm.runInNewContext(source,context);
const {build,normalizeDocument,statusTaken}=context.module.exports;
const testState={
 patients:[
  {id:'p-1',name:'Ejemplo Test',document:'8-111-222',birthDate:'1990-01-01',attentions:[],
   journeyHistory:[{id:'e1',journeyId:'j1',patientId:'p-1',journeyDate:'2026-11-10',testIds:['hcg','glucose'],testStatuses:{hcg:'tomada',glucose:'pendiente'},updatedAt:'2026-11-10T11:10:00Z'}]},
  {id:'p-2',name:'Ejemplo Test',document:'8111222',attentions:[{id:'a1',date:'2026-11-11',type:'Atención particular',tests:[{name:'Hemograma',status:'Registrada',result:'7'}]}]}
 ],
 catalog:[{id:'hcg',name:'HCG'},{id:'glucose',name:'Glucosa'}],
 journeyEntries:[{id:'e1',journeyId:'j1',patientId:'p-1',journeyDate:'2026-11-10',
  testIds:['hcg','glucose'],testStatuses:{hcg:'tomada',glucose:'pendiente'},
  updatedAt:'2026-11-10T11:10:00Z'}],
 reportHistory:[],journey:{id:'j2',date:'2026-11-13'},companies:[]
};
test('Unifica pacientes por cédula y todos los IDs sin alterar los datos de origen',()=>{
 const before=JSON.stringify(testState),m=build(testState);
 assert.equal(m.summary.totalPatients,1);
 assert.equal(m.patients[0].records.length,2);
 assert.equal(m.byId('p-1'),m.byId('p-2'));
 assert.equal(m.byId('8-111-222'),m.patients[0]);
 assert.equal(m.patients[0].name,'Ejemplo Test');
 assert.equal(JSON.stringify(testState),before);
});
test('Cuenta únicamente muestras tomadas de Jornadas y pruebas de atenciones registradas',()=>{
 const m=build(testState),p=m.patients[0];
 assert.equal(p.testsPerformed,2);
 assert.equal(p.visits,2);
 assert.equal(p.results,1);
 assert.equal(p.recurrent,true);
 assert.equal(p.lastDate,'2026-11-11');
 assert.equal(m.summary.testsPerformed,2);
 assert.equal(m.summary.returning,1);
 const journey=p.records.find(r=>r.source==='journey');
 assert.equal(journey.status,'Toma parcial');
 assert.equal(JSON.stringify(journey.tests.map(t=>t.performed)),JSON.stringify([true,false]));
});
test('Jornada sin ninguna muestra tomada no aumenta atenciones ni pruebas realizadas',()=>{
 const copy=JSON.parse(JSON.stringify(testState));
 copy.patients=[{id:'p',name:'Registro',document:'1234',attentions:[]}];
 copy.journeyEntries=[{id:'e',journeyId:'j',patientId:'p',journeyDate:'2026-11-12',
  testIds:['hcg'],testStatuses:{hcg:'pendiente'}}];
 const p=build(copy).patients[0];
 assert.equal(p.visits,0);assert.equal(p.testsPerformed,0);
 assert.equal(p.records.length,1);assert.equal(p.records[0].status,'Pendiente de toma');
});
test('No revive registros eliminados que sigan presentes como historial histórico',()=>{
 const copy=JSON.parse(JSON.stringify(testState));
 copy.journeyEntries[0].removedAt='2026-11-12T13:00:00Z';
 copy.journeyEntries[0].updatedAt='2026-11-12T13:00:00Z';
 const p=build(copy).patients[0];
 assert.equal(p.records.filter(r=>r.source==='journey').length,0);
 assert.equal(p.testsPerformed,1);
});
test('Estado actual prevalece sobre copia de journeyHistory y evita doble conteo',()=>{
 const copy=JSON.parse(JSON.stringify(testState));
 copy.journeyEntries[0].testStatuses.glucose='tomada';
 copy.journeyEntries[0].updatedAt='2026-11-12T11:00:00Z';
 const p=build(copy).patients[0];
 assert.equal(p.records.filter(r=>r.source==='journey').length,1);
 assert.equal(p.testsPerformed,3);
 assert.equal(p.records.find(r=>r.source==='journey').status,'Muestras tomadas');
});
test('Nombres de pruebas archivadas provienen de reportes guardados, nunca se inventan',()=>{
 const copy=JSON.parse(JSON.stringify(testState));copy.catalog=[];
 copy.reportHistory=[{snapshot:{journeyId:'j1',journeyDate:'2026-11-10',
  clientName:'Empresa registrada',tests:[{id:'hcg',name:'HCG archivada'}]}}];
 const journey=build(copy).patients[0].records.find(r=>r.source==='journey');
 assert.equal(journey.tests[0].name,'HCG archivada');
 assert.equal(journey.company,'Empresa registrada');
 assert.equal(journey.tests[1].name,'Prueba sin nombre en el catálogo');
});
test('La cédula se normaliza y el estado tomada es explícito',()=>{
 assert.equal(normalizeDocument('8-111-222'),'8111222');
 assert.equal(statusTaken('tomada'),true);
 assert.equal(statusTaken('pendiente'),false);
});
test('Vista de Pacientes y expediente utilizan agregador real, no la tabla de atenciones vacía',()=>{
 assert.match(ui,/window\.FleboPatientActivity\?\.build\?\./);
 assert.match(ui,/model\(\)/);
 assert.match(ui,/person\.visits/);
 assert.match(ui,/person\.records/);
 assert.match(ui,/p\.testsPerformed/);
 assert.match(ui,/p\.records/);
 assert.match(ui,/test\.performed/);
 assert.match(ui,/record\.source==='journey'/);
 assert.match(ui,/window\.FleboPatientsPremium\?\.openPatientRecord\?\.\(person\.id\)/);
 assert.match(ui,/pp-search-panel/);
 assert.match(ui,/pp-patient-visits/);
 assert.doesNotMatch(ui,/\.patients\.push|\.journeyEntries\.push|\.rpc\(|localStorage\.setItem\(/);
 assert.doesNotThrow(()=>new Function(ui));
});
test('Visual aprobado: KPI 2x2, búsqueda fuera del listado, filas horizontales y ficha flotante',()=>{
 assert.match(css,/grid-template-areas:"heading" "metrics" "search" "directory" "advanced"/);
 assert.match(css,/\.pp-search-panel/);
 assert.match(css,/\.pp-patient-visits/);
 assert.match(css,/\.pp-event-card/);
 assert.match(css,/\.pp-activity-test/);
 assert.match(css,/@media screen and \(max-width:760px\)/);
 assert.match(css,/@media screen and \(max-width:360px\)/);
 assert.match(html,/patients-activity-model\.js\?v=20261113-patient7/);
 assert.match(html,/patients-activity-ui\.js\?v=20261113-patient7/);
 assert.match(html,/patients-activity-ui\.css\?v=20261113-patient7/);
 assert.match(sw,/fleboreport-shell-v322/);
 for(const path of ['patients-activity-model.js','patients-activity-ui.js','patients-activity-ui.css'])
  assert.ok(sw.includes("'./"+path+"'"),'Falta precache '+path);
});
