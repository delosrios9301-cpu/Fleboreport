import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [html,cloud,patient]=await Promise.all([
 read('index.html'),read('cloud-state-sync.js'),read('patient-cloud-sync.js')
]);
function segment(source,begin,end){
 const from=source.indexOf(begin),to=source.indexOf(end,from+begin.length);
 assert.ok(from>=0&&to>from,'No se encontró '+begin);
 return source.slice(from,to);
}
const listSource=segment(html,'function patientsForJourney(){','function updateJourneySummary(){');
const deletionSource=segment(html,'function deletePatient(id){','function setStyle(style)');
const dedupeSource=segment(cloud,'function dedupeJourneyEntries(items){','function normalizePatientState(state)');
function base(){
 return {
  journey:{id:'j1',date:'2026-11-13'},
  patients:[
   {id:'p1',name:'Paciente Uno',document:'A',journeyHistory:[
    {id:'e1',journeyId:'j1',patientId:'p1',testIds:['glucosa','hcg'],updatedAt:'2026-11-13T09:00:00Z'}
   ]},
   {id:'p2',name:'Paciente Dos',document:'B'},
   {id:'p3',name:'Paciente Tres',document:'C'}
  ],
  journeyEntries:[
   {id:'e1',journeyId:'j1',patientId:'p1',testIds:['glucosa','hcg'],testStatuses:{glucosa:'pendiente',hcg:'tomada'},updatedAt:'2026-11-13T09:00:00Z'},
   {id:'e2',journeyId:'j1',patientId:'p2',testIds:['glucosa'],testStatuses:{glucosa:'pendiente'},updatedAt:'2026-11-13T09:30:00Z'}
  ],
  selected:[{testId:'glucosa',count:2},{testId:'hcg',count:1}]
 };
}
function context(state,confirmResult=true){
 let saves=0,notices=[],audits=[],renders=0;
 const ctx={
  state,window:{FleboAuth:{user:{id:'actor-one'}}},
  confirm:()=>confirmResult,
  toast:v=>notices.push(v),
  journeySnapshot:()=>JSON.stringify({journey:state.journey,selected:state.selected,patients:state.patients,journeyEntries:state.journeyEntries}),
  restoreJourneySnapshot:()=>{},
  touchJourney:()=>{state.journey.updatedAt='2026-11-13T12:00:00Z'},
  save:()=>{saves++;return true},
  renderJourneyPatients:()=>{renders++},
  renderAll:()=>{renders++},
  auditAdd:(...args)=>audits.push(args)
 };
 vm.runInNewContext(listSource+'\n'+deletionSource,ctx);
 return {ctx,counts:()=>({saves,notices,audits,renders})};
}
test('El botón quita solo la participación elegida, sin borrar el expediente maestro',()=>{
 const s=base(),x=context(s);
 assert.equal(x.ctx.patientsForJourney().length,2);
 x.ctx.deletePatient('e1');
 assert.equal(s.patients.length,3);
 assert.equal(s.patients.find(p=>p.id==='p1').name,'Paciente Uno');
 assert.equal(s.journeyEntries.length,2);
 assert.ok(s.journeyEntries[0].removedAt);
 assert.ok(s.patients[0].journeyHistory[0].removedAt);
 assert.equal(x.ctx.patientsForJourney().length,1);
 assert.equal(x.ctx.patientsForJourney()[0].participantId,'e2');
 assert.equal(s.selected.length,1);
 assert.equal(s.selected[0].testId,'glucosa');
 assert.equal(s.selected[0].count,1);
 assert.equal(x.counts().saves,1);
 assert.equal(x.counts().audits.length,1);
 assert.match(x.counts().notices[0],/se conserva/);
});
test('Sin confirmación no cambia la jornada ni el expediente',()=>{
 const s=base(),before=JSON.stringify(s),x=context(s,false);
 x.ctx.deletePatient('e1');
 assert.equal(JSON.stringify(s),before);
 assert.equal(x.counts().saves,0);
});
test('Una referencia histórica antigua no restaura una participación retirada',()=>{
 const s=base(),x=context(s);
 x.ctx.deletePatient('e1');
 // Otro dispositivo aún conserva la entrada en el historial del paciente.
 s.patients[0].journeyHistory[0].removedAt=undefined;
 assert.deepEqual(Array.from(x.ctx.patientsForJourney()).map(p=>p.patientId),['p2']);
});
test('El marcado de baja prevalece en fusión remota; reingreso no recupera pruebas previas',()=>{
 const st=x=>new Date(x.updatedAt||x.createdAt||0).getTime()||0;
 const ctx={stamp:st,Map,Set,Array,Object,String,Date};
 vm.runInNewContext(dedupeSource,ctx);
 const before={id:'e1',journeyId:'j1',patientId:'p1',testIds:['hcg'],updatedAt:'2026-11-13T09:00:00Z'};
 const removed={...before,removedAt:'2026-11-13T10:00:00Z',updatedAt:'2026-11-13T10:00:00Z'};
 const merged=ctx.dedupeJourneyEntries([removed,before])[0];
 assert.equal(merged.removedAt,removed.removedAt);
 const readded={...removed,removedAt:null,testIds:['glucosa'],updatedAt:'2026-11-13T11:00:00Z'};
 const reopened=ctx.dedupeJourneyEntries([removed,readded])[0];
 assert.equal(reopened.removedAt,null);
 assert.deepEqual(Array.from(reopened.testIds),['glucosa']);
});
test('La acción táctil es delegada y las fusiones del paciente conservan bajas',()=>{
 assert.match(html,/host\.addEventListener\('click',function\(event\)/);
 assert.match(html,/event\.target\.closest\('\[data-journey-patient-delete\]'\)/);
 assert.match(html,/deletePatient\(b\.dataset\.journeyPatientDelete\)/);
 assert.match(html,/if\(entry&&entry\.removedAt\)/);
 assert.match(cloud,/if\(old\.removedAt\|\|entry\.removedAt\)/);
 assert.match(patient,/if\(old\.removedAt\|\|row\.removedAt\)/);
 assert.doesNotMatch(deletionSource,/state\.patients=state\.patients\.filter/);
});