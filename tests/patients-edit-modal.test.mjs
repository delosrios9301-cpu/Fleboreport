import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [premium,css,html,sw]=await Promise.all([
 read('patients-premium-reference.js'),read('patients-edit-modal.css'),
 read('index.html'),read('service-worker.js')
]);

test('Editar y nuevo paciente utilizan el formulario nativo en cuadro flotante',()=>{
 assert.match(premium,/function initPatientFormDialog\(\)/);
 assert.match(premium,/el\('dialog','pp-patient-form-dialog'\)/);
 assert.match(premium,/dialog\.append\(toolbar,form\)/);
 assert.match(premium,/form\.before\(dialog\)/);
 assert.match(premium,/dialog\.showModal\(\)/);
 assert.match(premium,/wrap\('openPatientForm',showPatientFormModal\)/);
 assert.match(premium,/wrap\('closePatientForm',\(\)=>dismissPatientFormModal\(false\)\)/);
 assert.match(premium,/wrap\('saveIndividualPatient'/);
 assert.match(premium,/if\(\$\('patientFormPanel'\)\?\.hidden===true\)dismissPatientFormModal\(true\)/);
 assert.match(premium,/formFromRecord=!!patientDialog\?\.open/);
 assert.match(premium,/if\(returning&&space\)/);
 assert.match(premium,/window\.renderPatientWorkspace\?\.\(\)/);
 assert.match(premium,/dialog\.addEventListener\('cancel'/);
 assert.doesNotThrow(()=>new Function(premium));
});

test('La edición conserva el expediente y sus operaciones reales',()=>{
 const start=html.indexOf('function editIndividualPatient(');
 const end=html.indexOf('function openPatient(',start);
 const nativeEdit=html.slice(start,end);
 assert.match(nativeEdit,/individualPatientId=p\.id/);
 assert.match(nativeEdit,/openPatientForm\(\)/);
 assert.match(nativeEdit,/populateIndividualCompanyOptions/);
 assert.match(nativeEdit,/document\.getElementById\('patientFormTitle'\)\.textContent='Editar paciente'/);
 assert.match(html,/function saveIndividualPatient\(\)/);
 assert.match(html,/if\(!save\(\)\)return/);
 assert.doesNotMatch(premium,/patients\.splice\(|\.from\('patients'\)/);
});

test('El cuadro flotante es responsive, con scroll, cancelar y guardar accesibles',()=>{
 assert.match(css,/dialog\.pp-patient-form-dialog\[open\]/);
 assert.match(css,/dialog\.pp-patient-form-dialog::backdrop/);
 assert.match(css,/#patientFormPanel>.panel-head/);
 assert.match(css,/\.form-actions/);
 assert.match(css,/overflow-y:auto!important/);
 assert.match(css,/@media screen and \(max-width:600px\)/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)!important/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(html,/patients-edit-modal\.css\?v=20261113-edit1/);
 assert.match(html,/patients-premium-reference\.js\?v=20261113-patient10/);
 assert.match(sw,/'\.\/patients-edit-modal\.css'/);
});
