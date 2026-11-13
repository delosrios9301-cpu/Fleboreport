import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const css=await readFile(new URL('../jornada-premium.css',import.meta.url),'utf8');
const js=await readFile(new URL('../jornada-premium.js',import.meta.url),'utf8');
const sw=await readFile(new URL('../service-worker.js',import.meta.url),'utf8');
const p1=html.indexOf('function normalizePatientDocument(value)');
const p2=html.indexOf('function syncJourneyFormFromState()',p1);
assert.ok(p1>0&&p2>p1);
const registerSource=html.slice(p1,p2);
test('Nombres, apellidos, cédula única, fecha de nacimiento y sexo en Jornada',()=>{
 for(const id of ['journeyPatientName','journeyPatientLastName','journeyPatientId','journeyPatientBirth','journeyPatientSex'])
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.match(html,/id="journeyPatientLastName"/);
 assert.match(html,/id="journeyPatientBirth" type="date"/);
 assert.match(html,/id="journeyPatientLookupHint"/);
 assert.match(html,/onclick="registerJourneyPatient\(\)"/);
});
test('Identificación de paciente permanece dentro del formulario y desplazamiento de jornada es lateral',()=>{
 assert.doesNotMatch(js,/identityContent\.appendChild\(idField\)/);
 assert.match(js,/active\.addEventListener\('click',\(\)=>openWorkspace\('overview'\)\)/);
 assert.match(js,/layout\.scrollTo\(\{left:next\*layout\.clientWidth/);
 assert.doesNotMatch(js,/scrollIntoView\(/);
 assert.match(js,/jpSwipePrev/);assert.match(js,/jpSwipeNext/);
 assert.match(css,/scroll-snap-type:x mandatory/);
 assert.match(css,/scroll-snap-align:start/);
 assert.match(css,/overflow-x:auto!important;overflow-y:hidden/);
 assert.match(css,/\.journey-patient-fields/);
});
test('Se conservan identificación y demografía en el borrador de la jornada',()=>{
 for(const x of ['lastName','birthDate','sex','selectedTestIds'])
  assert.ok(html.includes(x),x);
 assert.match(html,/function lookupExistingJourneyPatient\(\)/);
 assert.match(html,/normalizePatientDocument\(p\.document\|\|p\.cedula\)===docKey/);
});
function register(opts={}){
 const elements={
  journeyPatientName:{value:opts.firstName??'Ana'},
  journeyPatientLastName:{value:opts.lastName??'Pérez'},
  journeyPatientId:{value:opts.document??'8-123-456'},
  journeyPatientBirth:{value:opts.birth??'1992-06-20'},
  journeyPatientSex:{value:opts.sex??'Femenino'},
  journeyPatientTestSearch:{value:''},journeyPatientLookupHint:{textContent:''}
 };
 const state={patients:opts.patients??[],journeyEntries:[],journey:{id:'j-1',date:'2026-11-12'},selected:[],catalog:[{id:'hcg',active:true}]};
 let saves=0,notice='';
 const ctx={state,$:id=>elements[id],document:{querySelectorAll:()=>[]},readJourneyDraft:()=>({selectedTestIds:opts.selectedTestIds??['hcg']}),
  journeySnapshot:()=>JSON.stringify(state),touchJourney:()=>{},save:()=>{saves++;return true},
  restoreJourneySnapshot:()=>{},clearJourneyDraft:()=>{},renderAll:()=>{},toast:t=>{notice=t},
  persistJourneyDraft:()=>{}};
 vm.runInNewContext(registerSource,ctx);
 ctx.registerJourneyPatient();
 return{state,saves,notice,elements};
}
test('Nuevo paciente registra todas las propiedades y las pruebas',()=>{
 const x=register(),p=x.state.patients[0];
 assert.equal(x.state.patients.length,1);
 assert.equal(p.name,'Ana Pérez');assert.equal(p.firstName,'Ana');assert.equal(p.lastName,'Pérez');
 assert.equal(p.document,'8-123-456');assert.equal(p.birthDate,'1992-06-20');assert.equal(p.sex,'Femenino');
 assert.equal(x.state.journeyEntries.length,1);assert.equal(x.state.journeyEntries[0].patientId,p.id);
 assert.equal(x.state.selected[0].testId,'hcg');assert.equal(x.saves,1);
 assert.equal(x.elements.journeyPatientLastName.value,'');
});
test('Misma cédula en distinta presentación reutiliza el expediente',()=>{
 const patient={id:'p1',name:'Ana Pérez',document:'8-123-456',birthDate:'1992-06-20',sex:'Femenino'};
 const x=register({document:'8123456',patients:[patient]});
 assert.equal(x.state.patients.length,1);
 assert.equal(x.state.journeyEntries[0].patientId,'p1');
});
test('No se sobrescribe silenciosamente fecha de nacimiento contradictoria',()=>{
 const patient={id:'p1',name:'Ana Pérez',document:'8-123-456',birthDate:'1992-06-20',sex:'Femenino'};
 const x=register({document:'8123456',birth:'1987-01-04',patients:[patient]});
 assert.equal(x.state.journeyEntries.length,0);
 assert.equal(x.saves,0);
 assert.match(x.notice,/no coincide/);
});
test('v296 carga JS CSS renovados sin modificar exportación de jornada',()=>{
 assert.match(html,/jornada-premium\.js\?v=20261113-jornada7/);
 assert.match(html,/jornada-premium\.css\?v=20261113-jornada8" media="screen"/);
 assert.match(sw,/fleboreport-shell-v317/);
 assert.match(html,/function completeJourneyAfterExport\(\)/);
 assert.match(html,/function openJourneyReportSetup\(\)/);
 assert.doesNotThrow(()=>new Function(js));
});
