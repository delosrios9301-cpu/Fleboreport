import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
const [html,ui,css,cloud,sql,sw]=await Promise.all([
 read('index.html'),read('clinical-reference-panels.js'),read('clinical-reference-panels.css'),
 read('clinical-cloud-sync.js'),
 read('supabase/migrations/20261113091500_authorized_clinical_sample_corrections_and_audit.sql'),
 read('service-worker.js')
]);
test('Revisión abre ficha flotante y solo aprueba tras confirmar revisión',()=>{
 for(const p of ['function openClinicalReviewCard(sampleId)','Número de sujeto','Fecha y hora de toma','Fecha y hora de recepción','Tipo de muestra','Visita','Aprobar y enviar a proceso']) assert.ok(ui.includes(p),p);
 assert.match(ui,/transition\('En revisión'/);
 assert.match(ui,/transition\('Pendiente de procesamiento'/);
 assert.match(ui,/phase!=='EN_REVISION'/);
 assert.match(ui,/original\.isConnected/);
 assert.match(css,/\.crx-review-dialog/);
 assert.match(css,/\.crx-review-scroll/);
});
test('Gestos solo para usuarios autorizados, con confirmación y motivo',()=>{
 assert.match(ui,/function makeSwipeCard\(card,sample\)/);
 assert.match(ui,/await cloud.getManagementPermissions\(\)/);
 assert.match(ui,/storedSample\(sample\)/);
 assert.match(ui,/dx>76\?'correct':dx< -76\?'delete'/);
 assert.match(ui,/passive:false/);
 assert.match(ui,/function administrativeDialog\(kind,sample\)/);
 assert.match(ui,/await cloud.correctSample\(/);
 assert.match(ui,/await cloud.deleteSample\(fresh,reason\)/);
 assert.match(ui,/reason.length<5/);
 assert.match(css,/\.crx-swipe-frame/);
 assert.match(css,/\.crx-admin-overlay/);
});
test('RPC audita corrección y baja lógica sin retroceder estados',()=>{
 assert.match(cloud,/correct_clinical_sample/);
 assert.match(sql,/processing','edit'/);
 assert.match(sql,/processing','delete'/);
 assert.match(sql,/sample_metadata_corrected/);
 assert.match(sql,/sample_deleted/);
 assert.match(sql,/workflow_status not in \('ALMACENAMIENTO_TEMPORAL','CONGELADOR_DEFINITIVO'\)/);
 assert.match(sql,/v_sample\.updated_at is distinct from p_expected_updated_at/);
 assert.match(sql,/deleted_at=now\(\)/);
 assert.doesNotMatch(sql,/\btruncate\b|\bdrop table\b|\bdelete from public\.clinical_samples\b/i);
 assert.match(sql,/from public, anon/);
});
test('Versiones y sintaxis',()=>{
 assert.match(html,/clinical-reference-panels\.js\?v=20261113-clinical3/);
 assert.match(html,/clinical-reference-panels\.css\?v=20261113-clinical2/);
 assert.match(html,/clinical-cloud-sync\.js\?v=20261113-sync3/);
 assert.match(sw,/fleboreport-shell-v306/);
 assert.doesNotThrow(()=>new Function(ui));
 assert.doesNotThrow(()=>new Function(cloud));
});