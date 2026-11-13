import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const file=async name=>readFile(new URL('../'+name,import.meta.url),'utf8');
const [html,css,js,old,processing,sw]=await Promise.all([
 file('index.html'),file('clinical-reference-panels.css'),file('clinical-reference-panels.js'),
 file('clinical-cloud-sync.js'),file('clinical-processing-simple.js'),file('service-worker.js')
]);
test('El rediseño se carga después del procesamiento original y se publica en PWA',()=>{
 assert.match(html,/clinical-reference-panels\.css\?v=20261113-clinical4/);
 assert.match(html,/clinical-reference-panels\.js\?v=20261113-clinical6/);
 assert.ok(html.lastIndexOf('clinical-reference-panels.js')>html.lastIndexOf('clinical-processing-simple.js'));
 assert.ok(html.lastIndexOf('clinical-reference-panels.css')>html.lastIndexOf('inicio-premium.css'));
 assert.match(sw,/fleboreport-shell-v317/);
 assert.ok(sw.includes("'./clinical-reference-panels.css'"));
 assert.ok(sw.includes("'./clinical-reference-panels.js'"));
});
test('Se preservan los componentes de recepción, revisión, procesamiento e historial',()=>{
 for(const id of ['view-clinical-studies','clinicalProcessStudy','clinicalProcessSubject','clinicalProcessVisit',
  'clinicalSampleType','clinicalTubeCount','clinicalReviewPanel','clinicalReviewRows','clinicalReviewCount',
  'view-clinical-processing','clinicalQueueRows','clinicalQueueStudy','clinicalQueueStatus',
  'clinicalQueueSearch','clinicalQueueKpiReceived','clinicalQueueKpiPending',
  'clinicalQueueKpiProcessed','clinicalQueueKpiStored','clinicalSampleHistoryRows']){
  assert.ok(html.includes('id="'+id+'"'),'ID de módulo preexistente: '+id);
 }
 for(const state of ['PENDIENTE_PROCESO','PROCESANDO','ALMACENAMIENTO_TEMPORAL','CONGELADOR_DEFINITIVO']){
  assert.ok(processing.includes(state),'Estado existente: '+state);
  assert.ok(js.includes(state),'Tarjeta adaptada al estado: '+state);
 }
 assert.match(js,/original\.click\(\)/);
 assert.match(js,/function pickStudy\(id\)/);
 assert.match(js,/function renderReviewCards\(\)/);
 assert.match(js,/function renderProcessingCards\(\)/);
 assert.match(js,/function refreshSamples\(\)/);
});
test('Las dos referencias son tarjetas premium y no tablas visibles en móvil',()=>{
 assert.match(css,/\.crx-study-card/);
 assert.match(css,/\.crx-processing-card/);
 assert.match(css,/\.crx-process-kpis/);
 assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
 assert.match(css,/\.crx-card::after/);
 assert.match(css,/\.crx-card-emblem/);
 assert.match(css,/\.crx-study-toolbar/);
 assert.match(css,/\.crx-study-tabs/);
 assert.match(css,/\.crx-process-filters/);
 assert.match(css,/\.crx-process-listhead/);
 assert.match(css,/@media screen and \(max-width:760px\)/);
 assert.match(css,/env\(safe-area-inset-bottom,0px\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});
test('Los datos mostrados se obtienen del sistema; no se escriben estados ni se alteran permisos',()=>{
 assert.doesNotThrow(()=>new Function(js));
 assert.ok(js.includes('FleboAppState'));
 assert.ok(js.includes('clinicalSamples'));
 assert.ok(js.includes('clinicalStudies'));
 assert.ok(js.includes('renderClinicalStudies'));
 assert.ok(js.includes('clinicalQueueRows'));
 for(const phrase of ['insert(','update(','upsert(','delete(','localStorage','sessionStorage',
  'client.rpc','setClinicalSampleStatus=','processClinicalSample=','finalizeClinicalSampleStorage='])
  assert.ok(!js.includes(phrase),'No redefinir escritura clínica ni persistencia: '+phrase);
 assert.ok(old.includes('transition_clinical_sample'));
 assert.ok(processing.includes('await cloud.transition'));
 assert.ok(!js.includes('MST-004872'),'No se deben usar datos ficticios');
});
test('Recepción terminada abre Revisión; sincronizaciones externas no interrumpen el formulario',()=>{
 assert.match(js,/review\.classList\.contains\('clinical-review-highlight'\)/);
 assert.match(js,/currentStudyTab\('revision'\)/);
 assert.ok(!js.includes('count>lastCount'));
 assert.match(js,/original\.isConnected/);
});
test('No se permite registrar en protocolos inactivos',()=>{
 assert.match(js,/hit\.disabled=!active/);
 assert.match(js,/crx-unavailable/);
});
