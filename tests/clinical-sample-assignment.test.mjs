import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [html,js,css,sw,cloud]=await Promise.all([
 read('index.html'),read('clinical-sample-assignment.js'),
 read('clinical-sample-assignment.css'),read('service-worker.js'),
 read('clinical-cloud-sync.js')
]);
test('Configuración conserva el SELECT de tipos conectado al guardado y a Supabase',()=>{
 for(const id of ['clinicalStudySamples','clinicalStudyEditId','clinicalStudySampleSpecs','clinicalConfigTabs'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/function saveClinicalStudy\(\)/);
 assert.match(html,/sampleTypeIds:Array.from\(document.getElementById\('clinicalStudySamples'\)\.selectedOptions\)/);
 assert.match(html,/function clinicalStudySampleSpecsFromForm\(\)/);
 assert.match(js,/native\.selectedOptions/);
 assert.match(js,/option\.selected=ids\.has/);
 assert.match(js,/window\.renderClinicalStudySampleSpecs\(\)/);
});
test('Casillas táctiles para asignar tipos, búsqueda y enlace al catálogo',()=>{
 assert.match(js,/const native=document\.getElementById\('clinicalStudySamples'\)/);
 assert.match(js,/input\.type='checkbox'/);
 assert.match(js,/input\.checked=selected/);
 assert.match(js,/input\.disabled=!editable\|\|\(!active&&!selected\)/);
 assert.match(js,/window\.selectClinicalConfig\('sampleTypes'\)/);
 assert.match(js,/query=search\.value/);
 assert.match(js,/group\.activeIds\[0\]\|\|group\.ids\[0\]/);
 assert.match(css,/\.crx-type-grid/);
 assert.match(css,/@media screen and \(max-width:640px\)/);
});
test('No se pierden selecciones ni especificaciones mientras cambia el catálogo',()=>{
 for(const symbol of ['function captureSpecs()','function restoreSpecs()','function syncDraft()','last.dirty=true','last.ids=selectedIds()'])
  assert.ok(js.includes(symbol),symbol);
 assert.match(js,/window\.renderClinicalStudies=function/);
 assert.match(js,/window\.resetClinicalStudyForm=function/);
 assert.match(js,/window\.editClinicalStudy=function/);
 assert.match(js,/new MutationObserver\(\(\)=>render\(\)\)/);
 assert.doesNotMatch(js,/native\.dispatchEvent\(new Event\('change'/);
});
test('La capa visual no modifica datos directamente',()=>{
 assert.doesNotThrow(()=>new Function(js));
 assert.match(cloud,/async function saveConfiguration\(\)/);
 assert.match(cloud,/for\(const type of linkedTypes\)await saveSampleType/);
 for(const forbidden of ['localStorage','sessionStorage','client.from(','.insert(','.update(','.rpc(', 'deleteClinicalStudy'])
  assert.ok(!js.includes(forbidden),forbidden);
});
test('Publicación y caché PWA v309',()=>{
 assert.match(html,/clinical-sample-assignment\.css\?v=20261113-sample1/);
 assert.match(html,/clinical-sample-assignment\.js\?v=20261113-sample1/);
 assert.match(sw,/fleboreport-shell-v315/);
 assert.ok(sw.includes("'./clinical-sample-assignment.css'"));
 assert.ok(sw.includes("'./clinical-sample-assignment.js'"));
});