import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [html,js,css,sw]=await Promise.all([
 read('index.html'),read('patients-premium-reference.js'),
 read('patients-premium-reference.css'),read('service-worker.js')
]);
test('Pantalla Pacientes conserva funciones reales y elimina espacios innecesarios',()=>{
 for(const id of ['patientsHome','individualPatientsTotal','individualMonthlyVisits','individualTestsTotal',
  'individualReturning','patientSearch','patientDateFilter','patientList','patientCount',
  'patientFormPanel','patientWorkspace','patientWorkspaceName']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 for(const fn of ['openPatientForm','saveIndividualPatient','renderPatients',
 'editIndividualPatient','openPatient','closePatientWorkspace','renderPatientWorkspace']){
  assert.match(html,new RegExp('function '+fn+'\\('));
 }
 assert.match(js,/grid\.after\(directory\)/);
 assert.match(js,/const finance=home\.querySelector/);
 assert.match(js,/advanced\.append\(section\)/);
 assert.match(css,/\.pp-home-kpis/);
 assert.match(css,/\.pp-directory-card/);
 assert.match(css,/\.pp-advanced/);
 assert.doesNotThrow(()=>new Function(js));
});
test('Ver expediente abre la misma ficha y muestra pestañas del diseño aprobado',()=>{
 for(const tab of ['Historial','Pruebas','Resultados','Documentos','Notas'])
  assert.ok(js.includes("'"+tab+"'"),tab);
 assert.match(js,/window\.showPatientTab\?\.\('history'\)/);
 assert.match(js,/nativeCall\('closePatientWorkspace'\)/);
 assert.match(js,/nativeCall\('editIndividualPatient'\)/);
 assert.match(js,/nativeCall\('showPatientTab',key\)/);
 assert.match(js,/window\[fn\]=function\(\.\.\.args\)/);
 assert.match(js,/nativeForm\.before\(footer\)/);
 for(const id of ['patient-tab-history','patient-tab-visits','patient-tab-personal',
  'patient-tab-tests','patient-tab-evidence','patient-tab-reports'])assert.ok(html.includes(id),id);
 assert.match(css,/\.pp-profile-card/);
 assert.match(css,/\.pp-record-kpis/);
 assert.match(css,/\.pp-record-tabs/);
});
test('Nuevas tarjetas no crean resultados, estatus, pacientes o documentos ficticios',()=>{
 assert.match(js,/const resultTests=tests\.filter/);
 assert.match(js,/String\(t\.result\|\|''\)\.trim\(\)\.length/);
 assert.match(js,/!String\(t\.result\|\|''\)\.trim\(\)/);
 assert.match(js,/Este expediente no tiene resultados registrados/);
 assert.match(js,/p\.generalNotes/);
 assert.match(js,/a\.notes/);
 assert.match(js,/a\.conclusions/);
 assert.match(js,/timeline\.classList\.add\('pp-native-timeline'\)/);
 assert.match(html,/function editAttention\(id\)/);
 assert.match(js,/localDate\(a\.date\)/);
 assert.doesNotMatch(js,/Completada|Validada|Resultado positivo|Resultado negativo/);
 assert.doesNotMatch(js,/state\.patients\.push|state\.patients\.splice|localStorage\.setItem|supabase\.from|\.rpc\(/);
});
test('Los accesos de la vista siguen utilizando las acciones originales, con confirmación de privacidad al compartir',()=>{
 assert.match(js,/nativeCall\('openAttentionForm'\)/);
 assert.match(js,/nativeCall\('printPatientHistory'\)/);
 assert.match(js,/nativeCall\('sharePatientReport'\)/);
 assert.match(js,/window\.confirm\('Compartir enviará el nombre y la cédula/);
 assert.match(js,/originalEdit\.disabled\|\|originalEdit\.hidden/);
 assert.match(js,/window\.getComputedStyle\(originalEdit\)\.display==='none'/);
 assert.match(html,/function printPatientHistory\(attentionId\)/);
 assert.match(html,/function sharePatientReport\(attentionId\)/);
 assert.match(html,/function exportPatientCSV\(\)/);
 assert.match(html,/function showAttentionDetail\(id\)/);
});
test('Los filtros del directorio son funcionales y distinguen pacientes recurrentes de recientes',()=>{
 assert.match(js,/directoryMode==='returning'&&visits<=1/);
 assert.match(js,/directoryMode==='recent'&&!recentPatient\(patient\)/);
 assert.match(js,/el\('div','pp-patient-cards'\)/);
 assert.match(js,/openPatientRecord\(id\)/);
 assert.doesNotMatch(js,/openButton\?\.click\(\)/);
 const from=js.indexOf(' function recentPatient(record){'),end=js.indexOf(' function renderDirectory(){',from);
 assert.ok(from>=0&&end>from);
 const code=js.slice(from,end);
 const context={Date,Array,String,Number};
 vm.runInNewContext(code,context);
 const d=new Date();d.setDate(d.getDate()-2);
 const recent=d.toISOString().slice(0,10);
 assert.equal(context.recentPatient({attentions:[{date:recent}]}),true);
 assert.equal(context.recentPatient({attentions:[{date:'2020-01-01'}]}),false);
 assert.equal(context.recentPatient({attentions:[]}),false);
});
test('Layout horizontal y móvil oculta información antigua repetida sin afectar el modo impresión',()=>{
 assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(css,/@media screen and \(max-width:760px\)/);
 assert.match(css,/@media screen and \(max-width:420px\)/);
 assert.match(css,/@media print/);
 assert.match(css,/#patientWorkspace>\.panel-head/);
 assert.match(css,/#patientWorkspace>\.stats-grid/);
 assert.match(css,/\.pp-timeline-row/);
 assert.match(css,/\.pp-directory \.table-wrap/);
 assert.match(css,/touch-action:pan-x!important/);
 assert.match(css,/word-break:normal!important/);
});
test('Servicio PWA v319 carga los dos archivos del expediente premium',()=>{
 assert.match(html,/patients-premium-reference\.css\?v=20261113-patient2/);
 assert.match(html,/patients-premium-reference\.js\?v=20261113-patient2/);
 assert.match(sw,/fleboreport-shell-v319/);
 assert.match(sw,/'\.\/patients-premium-reference\.css'/);
 assert.match(sw,/'\.\/patients-premium-reference\.js'/);
});

test('Ver expediente llama directamente con ID real y cambia la vista visible',()=>{
 const begin=js.indexOf(' function openPatientRecord(id){');
 const end=js.indexOf(' function recentPatient(record){',begin);
 assert.ok(begin>=0&&end>begin);
 const code=js.slice(begin,end);
 const elements={
  patientsHome:{hidden:false},patientWorkspace:{hidden:true},patientFormPanel:{hidden:false}
 };
 const events=[];let selected=null;
 const ctx={
  $,window:{openPatient:id=>{selected=id;events.push('native:'+id)},
   renderPatientWorkspace:()=>events.push('render'),
   showPatientTab:key=>events.push('tab:'+key),
   toast:message=>events.push('error:'+message)},
  findPatient:()=>selected?{id:selected}:null,
  renderWorkspace:()=>events.push('premium'),
  document:{querySelector:()=>({scrollTo:()=>events.push('scroll')})},String
 };
 ctx.$=id=>elements[id];
 vm.runInNewContext(code,ctx);
 assert.equal(ctx.openPatientRecord('patient-123'),true);
 assert.equal(selected,'patient-123');
 assert.equal(elements.patientsHome.hidden,true);
 assert.equal(elements.patientFormPanel.hidden,true);
 assert.equal(elements.patientWorkspace.hidden,false);
 assert.ok(events.includes('render'));
 assert.ok(events.includes('premium'));
 assert.ok(events.includes('tab:history'));
 assert.ok(events.includes('scroll'));
});
test('La estructura compacta no deja cuadrícula fantasma, duplica encabezados ni esconde expediente abierto',()=>{
 assert.match(css,/grid-template-areas:"heading" "metrics" "directory" "advanced"!important/);
 assert.match(css,/grid-template-rows:auto auto auto auto!important/);
 assert.match(css,/grid-auto-rows:min-content!important/);
 assert.match(css,/#cmContextBar\[data-area="patients"\]/);
 assert.match(css,/\.page-heading\[data-fr5-area="patient-heading"\]/);
 assert.match(css,/\.pp-directory>\.panel-head/);
 assert.match(css,/#patientWorkspace:not\(\[hidden\]\)/);
 assert.match(css,/#patientWorkspace\[hidden\]/);
 assert.match(js,/home\.classList\.add\('pp-strict-layout'\)/);
 assert.match(js,/const id=match\?\.\[1\]/);
 assert.match(js,/const selected=findPatient\(\)/);
});
