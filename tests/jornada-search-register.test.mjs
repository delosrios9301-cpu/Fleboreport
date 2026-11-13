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
 assert.match(html,/jornada-premium\.css\?v=20261113-jornada8/);
 assert.match(html,/jornada-premium\.js\?v=20261113-jornada7/);
 assert.match(sw,/fleboreport-shell-v321/);
 assert.doesNotThrow(()=>new Function(ui));
});
test('Búsqueda se adapta al viewport visual cuando aparece el teclado móvil',()=>{
 const start=ui.indexOf(' function updateLookupViewport(){');
 const end=ui.indexOf(' const normalized=value=>',start);
 assert.ok(start>=0&&end>start,'No se encontró el adaptador de teclado');
 const layout=ui.slice(start,end);
 function simulate({innerHeight=830,visualHeight=330,offsetTop=8,offsetLeft=0,baseline=830,focused=true}={}){
  const styles={};const classes=new Set();
  const lookupInput={},lookup={
   hidden:false,
   style:{setProperty:(key,value)=>{styles[key]=value;}},
   classList:{toggle:(key,enabled)=>{if(enabled)classes.add(key);else classes.delete(key);}}
  };
  const context={
   lookup,lookupInput,lookupBaselineHeight:baseline,
   document:{activeElement:focused?lookupInput:{}},
   window:{innerHeight,innerWidth:400,visualViewport:{
    height:visualHeight,width:400,offsetTop,offsetLeft
   }},
   Math
  };
  vm.runInNewContext(layout,context);
  context.updateLookupViewport();
  return {styles,classes};
 }
 const normal=simulate({innerHeight:830,visualHeight:830,offsetTop:0,focused:false});
 assert.equal(normal.styles['--jp-lookup-height'],'830px');
 assert.equal(normal.classes.has('jp-lookup-keyboard'),false);
 const keyboard=simulate();
 assert.equal(keyboard.styles['--jp-lookup-top'],'8px');
 assert.equal(keyboard.styles['--jp-lookup-height'],'330px');
 assert.equal(keyboard.styles['--jp-lookup-width'],'400px');
 assert.equal(keyboard.classes.has('jp-lookup-keyboard'),true);
 assert.equal(keyboard.classes.has('jp-lookup-tight'),true);
 const larger=simulate({visualHeight:440});
 assert.equal(larger.classes.has('jp-lookup-keyboard'),true);
 assert.equal(larger.classes.has('jp-lookup-tight'),false);
 const unfocused=simulate({focused:false});
 assert.equal(unfocused.classes.has('jp-lookup-keyboard'),false);
});
test('El cuadro permanece desplazable, legible y se restaura al cerrar el teclado',()=>{
 assert.match(ui,/window\.visualViewport\.addEventListener\('resize',updateLookupViewport/);
 assert.match(ui,/window\.visualViewport\.addEventListener\('scroll',updateLookupViewport/);
 assert.match(ui,/window\.addEventListener\('resize',updateLookupViewport/);
 assert.match(ui,/lookupInput\.addEventListener\('focus'/);
 assert.match(ui,/lookupInput\.focus\(\{preventScroll:true\}\)/);
 assert.match(ui,/lookup\.style\.removeProperty\(key\)/);
 assert.match(css,/top:var\(--jp-lookup-top,0px\)!important/);
 assert.match(css,/height:var\(--jp-lookup-height,100dvh\)!important/);
 assert.match(css,/\.jp-lookup-overlay\.jp-lookup-keyboard:not\(\[hidden\]\)/);
 assert.match(css,/\.jp-lookup-overlay\.jp-lookup-tight:not\(\[hidden\]\)/);
 assert.match(css,/overflow-x:hidden!important;overflow-y:auto!important/);
 assert.match(css,/touch-action:pan-y!important/);
 assert.doesNotMatch(ui,/clearJourneyDraft\(\)/);
});
