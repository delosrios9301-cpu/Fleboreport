import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const load=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [ui,css,html,sw]=await Promise.all([
 load('jornada-premium.js'),load('jornada-premium.css'),
 load('index.html'),load('service-worker.js')
]);
function extract(a,b){
 const start=ui.indexOf(a),end=ui.indexOf(b,start+a.length);
 assert.ok(start>=0&&end>start,'No existe '+a);
 return ui.slice(start,end);
}
const helpers=extract(' const normalized=value=>',' function ensureLookup(){');
const select=extract(' function openMatchedPatient(p){',' function renderLookup(){');
test('Jornada diferencia Buscar, Registrar y seguimiento, sin tarjetas repetidas',()=>{
 assert.match(ui,/makeCard\(openPatientLookup,'Buscar paciente'/);
 assert.match(ui,/makeCard\(\(\)=>openWorkspace\('patient'\),'Registrar paciente'/);
 assert.match(ui,/makeCard\(\(\)=>openWorkspace\('patients'\),'Pacientes en toma'/);
 assert.doesNotMatch(ui,/actions\.appendChild\(identity\)/);
 assert.doesNotMatch(ui,/actions\.appendChild\(tests\)/);
});
test('Buscador independiente por nombre y cédula con límite y accesibilidad',()=>{
 assert.match(ui,/lookupInput\.addEventListener\('input',renderLookup\)/);
 assert.match(ui,/normalized\(personName\(p\)\)\.includes\(term\)/);
 assert.match(ui,/documentKey\(p\.document\|\|p\.cedula\)\.includes\(doc\)/);
 assert.match(ui,/if\(term\.length<2&&doc\.length<2\)/);
 assert.match(ui,/\.slice\(0,25\)/);
 assert.match(ui,/role="dialog" aria-modal="true"/);
 assert.match(css,/\.jp-lookup-overlay/);
});
test('Deduplica por cédula y conserva personas homónimas',()=>{
 const patients=[
 {id:'a',name:'Ana Rivera',document:'8-123-456',updatedAt:'2026-11-10T12:00:00Z'},
 {id:'b',name:'Ana Rivera',document:'8-123-456',updatedAt:'2026-11-12T12:00:00Z'},
 {id:'c',name:'Ana Rivera',document:'7-001-099',updatedAt:'2026-11-11T12:00:00Z'},
 {id:'d',name:'Sin Documento'}
 ];
 const ctx={window:{FleboAppState:{get:()=>({patients})}},Map,Array,Date,String};
 vm.runInNewContext(helpers,ctx);
 const found=vm.runInNewContext('patientRecords()',ctx);
 assert.equal(found.length,2);
 assert.equal(found.find(p=>p.document==='8-123-456').id,'b');
 assert.equal(vm.runInNewContext("normalized('ÁNA RÍVERA')",ctx),'ana rivera');
 assert.equal(vm.runInNewContext("documentKey('8-123-456')",ctx),'8123456');
});
test('Al seleccionar expediente llena el formulario sin registrar ni duplicar',()=>{
 const fields=Object.fromEntries(['journeyPatientName','journeyPatientLastName','journeyPatientId',
 'journeyPatientBirth','journeyPatientSex','journeyPatientTestSearch','journeyPatientLookupHint']
 .map(x=>[x,{value:'',textContent:''}]));
 let saved=null,moved='',closed=false;
 const state={patients:[],journeyEntries:[],journey:{id:'j1'}};
 const ctx={window:{FleboAppState:{get:()=>state},confirm:()=>true,
 persistJourneyDraft:patch=>{saved=patch;},readJourneyDraft:()=>({selectedTestIds:['hcg']}),
 lookupExistingJourneyPatient:()=>{},renderJourneyPatientChoices:()=>{}},
 byId:id=>fields[id],closeLookup:()=>{closed=true;},openWorkspace:mode=>{moved=mode;},Map,Array,String,Date};
 vm.runInNewContext(helpers+'\n'+select,ctx);
 vm.runInNewContext("openMatchedPatient({id:'p1',firstName:'Carlos',lastName:'Ruiz',document:'8-999-22',birthDate:'1990-01-10',sex:'Masculino'})",ctx);
 assert.equal(fields.journeyPatientName.value,'Carlos');
 assert.equal(fields.journeyPatientLastName.value,'Ruiz');
 assert.equal(fields.journeyPatientId.value,'8-999-22');
 assert.equal(fields.journeyPatientBirth.value,'1990-01-10');
 assert.equal(fields.journeyPatientSex.value,'Masculino');
 assert.equal(moved,'tests');assert.deepEqual(Array.from(saved.selectedTestIds),[]);
 assert.equal(state.patients.length,0);assert.ok(closed);
});
test('Conserva guardado real, cédula única y PWA con diseño táctil',()=>{
 assert.match(html,/onclick="registerJourneyPatient\(\)"/);
 assert.match(html,/normalizePatientDocument\(p\.document\|\|p\.cedula\)===docKey/);
 assert.equal((html.match(/class="btn primary journey-register-button"/g)||[]).length,1);
 assert.match(css,/@media screen and \(max-width:760px\)/);
 assert.match(html,/jornada-premium\.css\?v=20261113-jornada7/);
 assert.match(html,/jornada-premium\.js\?v=20261113-jornada6/);
 assert.match(sw,/fleboreport-shell-v312/);
 assert.doesNotThrow(()=>new Function(ui));
});