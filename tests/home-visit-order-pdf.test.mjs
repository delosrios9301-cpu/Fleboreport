import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [source,ui,dom,html,css,worker,migration]=await Promise.all([
 read('home-visit-order-match.js'),read('home-visit-order-pdf.js'),
 read('domicilios.js'),read('index.html'),read('home-visit-order-pdf.css'),
 read('service-worker.js'),read('supabase/migrations/20261102132546_domicilios_catalog_and_documents.sql')
]);
const mod={exports:{}};
vm.runInNewContext(source,{module:mod},{filename:'home-visit-order-match.js'});
const matcher=mod.exports;
const catalog=[
 {id:'111',name:'Hemograma completo',code:'HEM',active:true},
 {id:'222',name:'Glucosa',code:'GLU',active:true},
 {id:'333',name:'Creatinina',code:'CREA',active:true},
 {id:'444',name:'Glucosa',code:'GL2',active:true},
 {id:'555',name:'Prueba desactivada',code:'OFF',active:false}
];

test('Reconoce pruebas por nombre y código exactos sin inventar exámenes',()=>{
 const r=matcher.matchText('ORDEN MÉDICA\n1. Hemograma completo\n2. Creatinina\nGLU\nGlucosa adicional\n',catalog);
 assert.deepEqual(Array.from(r.matches,x=>x.id),['111','333','222']);
 assert.equal(r.matches.length,3);
 assert.ok(r.unmatched.includes('Glucosa adicional'));
});
test('Una misma prueba escrita varias veces sólo se selecciona una vez',()=>{
 const r=matcher.matchText('HEM\nHemograma completo\nHemograma completo\n3) HEM',catalog);
 assert.equal(r.matches.length,1);
 assert.equal(r.matches[0].id,'111');
});
test('Códigos o nombres duplicados en el catálogo no se autoseleccionan',()=>{
 const r=matcher.matchText('Glucosa\n3) GL2\n',catalog);
 assert.equal(r.matches.length,1);
 assert.equal(r.matches[0].id,'444');
 assert.equal(r.ambiguous.length,1);
 assert.match(r.ambiguous[0].line,/Glucosa/);
});
test('No interpreta encabezados, negativas o una prueba inactiva como solicitudes',()=>{
 const r=matcher.matchText('Paciente: Glucosa\nNO solicitar Hemograma completo\nPrueba desactivada\nGLU\nGlucosa\n',catalog);
 assert.deepEqual(Array.from(r.matches,x=>x.id),['222']);
 assert.equal(r.ambiguous.length,1);
 assert.ok(!r.matches.some(x=>x.id==='555'));
});
test('La normalización permite acentos y viñetas sin coincidencias parciales',()=>{
 const local=[{id:'a',name:'Ácido úrico',code:'AU1',active:true}];
 const r=matcher.matchText('✓ ÁCIDO   URICO\nÁcido úrico cuantitativo\n',local);
 assert.deepEqual(Array.from(r.matches,x=>x.id),['a']);
 assert.ok(r.unmatched.includes('Ácido úrico cuantitativo'));
});
test('PDF se analiza en el dispositivo, sin enviar su texto o datos a un servidor OCR',()=>{
 new vm.Script(source);
 new vm.Script(ui);
 assert.match(ui,/await file\.arrayBuffer\(\)/);
 assert.match(ui,/getDocument\(\{data:new Uint8Array/);
 assert.match(ui,/isEvalSupported:false/);
 assert.match(ui,/pdf\.getPage\(pageNumber\)/);
 assert.match(ui,/page\.getTextContent\(/);
 assert.match(ui,/PDF_API='https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@6\.5\.438\/legacy\/build\/pdf\.mjs'/);
 assert.match(ui,/PDF_WORKER='https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@6\.5\.438\/legacy\/build\/pdf\.worker\.mjs'/);
 assert.doesNotMatch(ui,/fetch\(|FormData\(|postMessage\(.*file|https?:\/\/[^\s'"]+(?:ocr|upload)/);
});
test('Se exige revisión de las coincidencias en el formulario antes de guardar',()=>{
 assert.match(ui,/window\.hvOrderApplyTests\(matches\.matches\.map\(x=>x\.id\)\)/);
 assert.match(ui,/Las coincidencias seguras ya aparecen en Pruebas solicitadas/);
 assert.match(ui,/No hubo coincidencias únicas/);
 assert.match(ui,/No se detectaron pruebas legibles/);
 assert.match(ui,/window\.FleboHomeVisitPDF=\{pendingFile:\(\)=>pending,isAnalyzing:\(\)=>running,cancelAnalysis:/);
 assert.match(ui,/RECOGNITION_BYTES=50\*1024\*1024,STORAGE_BYTES=50\*1024\*1024/);
 assert.match(ui,/MAX_PAGES=500/);
 assert.match(ui,/signature!=='%PDF-'/);
 assert.match(ui,/createElement\('input'\)|el\('input'\)/);
});
test('La visita se guarda antes de adjuntar su PDF y se distingue el fallo de carga',()=>{
 const i=dom.indexOf('const orderPdf=oversizedOrder?null:pendingOrder');
 const created=dom.indexOf('if(!await save(v))');
 const uploaded=dom.indexOf('uploadVisitDocument(v.id,orderPdf,{quiet:true,onProgress:');
 const reset=dom.indexOf("selected=v.id;activeTab='agenda';reset();render();",created);
 assert.ok(created>=0&&i>created&&uploaded>i&&reset>uploaded);
 assert.match(dom,/Domicilio guardado, pero el PDF NO se adjuntó/);
 assert.match(dom,/Domicilio y orden PDF adjuntados correctamente/);
 assert.match(dom,/window\.hvOrderApplyTests=ids=>/);
 assert.match(dom,/remoteCatalog\.some\(t=>t\.id===id\)/);
 assert.match(dom,/if\(!canReadHomeOrderCatalog\(\)\)return 0/);
});
test('El adjunto usa el bucket privado existente con políticas RLS y sin URL pública',()=>{
 assert.match(migration,/create table if not exists public\.home_visit_documents/);
 assert.match(migration,/public,\s*file_size_limit,\s*allowed_mime_types/);
 assert.match(migration,/home_visit_documents_storage_insert/);
 assert.match(migration,/home_visit_documents_storage_read/);
 assert.match(dom,/storage\.from\('home-visit-documents'\)\.upload\(path,file/);
 assert.match(dom,/cloud\.client\.from\('home_visit_documents'\)\.insert/);
 assert.match(dom,/file_size:file\.size/);
 assert.match(dom,/const signature=new TextDecoder\(\)\.decode\(await file\.slice\(0,5\)\.arrayBuffer\(\)\)/);
 assert.match(dom,/await cloud\.client\.storage\.from\('home-visit-documents'\)\.remove\(\[path\]\)/);
 assert.doesNotMatch(dom.slice(dom.indexOf('async function uploadVisitDocument('),dom.indexOf('async function openVisitDocument(')),/getPublicUrl/);
});
test('Vista móvil y recursos PWA cargados sin modificar notificaciones',()=>{
 const files=['home-visit-order-match.js','home-visit-order-ocr.js','home-visit-order-pdf.js','home-visit-order-pdf.css'];
 for(const name of files){
  assert.ok(html.includes('./'+name+'?v='+(name.endsWith('.css')?'20261116-full1':'20261116-full1')));
  assert.ok(worker.includes("'./"+name+"'"));
 }
 assert.ok(html.indexOf('home-visit-order-match.js')<html.indexOf('home-visit-order-pdf.js'));
 assert.match(css,/@media screen and \(max-width:760px\)/);
 assert.match(css,/@media print/);
 assert.match(css,/\.hv-order-results\[hidden\]\{display:none!important;\}/);
});
