import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const load=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [html,ui,css,cloud,sql,sw]=await Promise.all([
 load('index.html'),load('clinical-reference-panels.js'),
 load('clinical-reference-panels.css'),load('clinical-cloud-sync.js'),
 load('supabase/migrations/20261113094000_clinical_review_corrections_before_approval.sql'),
 load('service-worker.js')
]);
test('Revisión clínica presenta edición antes de aprobar sin abandonar el cuadro flotante',()=>{
 for(const p of ['function openClinicalReviewCard(sampleId)','Editar datos','Guardar correcciones',
 'Cancelar edición','Número de sujeto','Fecha y hora de toma','Fecha y hora de recepción',
 'Tipo de muestra','Visita','Cantidad de recipientes','Observaciones de la muestra']){
  assert.ok(ui.includes(p),'Falta '+p);
 }
 assert.match(ui,/const editor=node\('section','crx-review-editor'\)/);
 assert.match(ui,/scroll\.insertBefore\(editor,note\)/);
 assert.match(ui,/approve\.disabled=busy\|\|editMode/);
 assert.match(ui,/approve\.hidden=active/);
 assert.match(ui,/await cloud\.correctReviewSample\(fresh,/);
 assert.match(ui,/getReviewEditPermission\(\)/);
 assert.match(ui,/reason\.length<5/);
 assert.match(ui,/toggleEditor\(false\)/);
 assert.match(ui,/updateReadOnly\(\)/);
 assert.match(css,/\.crx-review-editor/);
 assert.match(css,/\.crx-review-edit-grid/);
 assert.match(css,/\.crx-review-approve\[hidden\]/);
});
test('Corrección está autenticada y audita los valores anteriores sin mover la muestra a proceso',()=>{
 assert.match(cloud,/async function getReviewEditPermission\(\)/);
 assert.match(cloud,/async function correctReviewSample\(sample,changes\)/);
 assert.match(cloud,/correct_clinical_sample_in_review/);
 assert.match(cloud,/await refreshSamples\(\)/);
 assert.match(sql,/if v_sample\.workflow_status not in \('REGISTRADO','EN_REVISION'\)/);
 assert.match(sql,/private\.has_workspace_permission\(p_workspace_id,'studies','edit',null\)/);
 assert.match(sql,/p_expected_updated_at/);
 assert.match(sql,/sample_review_corrected/);
 assert.match(sql,/workflow_status_preserved/);
 assert.match(sql,/v_sample\.workflow_status,v_sample\.workflow_status/);
 assert.match(sql,/sample_type_id=p_sample_type_id/);
 assert.match(sql,/coagulation_enabled=/);
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/from public,anon/);
 assert.doesNotMatch(sql,/\btruncate\b|\bdrop table\b|\bdelete from public\.clinical_samples\b/i);
});
test('Versión PWA y sintaxis actualizadas',()=>{
 assert.match(html,/clinical-reference-panels\.js\?v=20261113-clinical6/);
 assert.match(html,/clinical-reference-panels\.css\?v=20261113-clinical4/);
 assert.match(html,/clinical-cloud-sync\.js\?v=20261113-sync4/);
 assert.match(sw,/fleboreport-shell-v316/);
 assert.doesNotThrow(()=>new Function(ui));
 assert.doesNotThrow(()=>new Function(cloud));
});