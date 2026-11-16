import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [matcherSource,pdfSource,ocrSource,dom,html,sw,volunteer]=await Promise.all([
 read('home-visit-order-match.js'),read('home-visit-order-pdf.js'),read('home-visit-order-ocr.js'),
 read('domicilios.js'),read('index.html'),read('service-worker.js'),read('domicilios-volunteer-ui.js')
]);
const ctx={module:{exports:{}}};
vm.runInNewContext(matcherSource,ctx,{filename:'home-visit-order-match.js'});
const match=ctx.module.exports;
const tests=[
 {id:'hemo',name:'Hemograma completo (CBC)',code:'HEM',active:true},
 {id:'tp',name:'Tiempo de protrombina (TP)',code:'TP',active:true},
 {id:'ttpa',name:'Tiempo parcial de tromboplastina activada (TTPa)',code:'TTP',active:true},
 {id:'ferr',name:'Ferritina',code:'FER',active:true},
 {id:'glucosa-1',name:'Glucosa en ayunas',code:'GLU',active:true},
 {id:'glucosa-2',name:'Glucosa aleatoria',code:'GA',active:true}
];
test('Reconoce nombre, sigla y código antes de crear, sin duplicar pruebas',()=>{
 const order='Paciente: Juan Carlos\nPruebas solicitadas:\n1. Hemograma completo (CBC)\n2) TP - Tiempo de protrombina\nTTP\nHEM\nFerritina';
 const result=match.matchText(order,tests);
 assert.deepEqual(Array.from(result.matches,x=>x.id),['hemo','tp','ttpa','ferr']);
 assert.equal(result.matches.length,4,'HEM ya estaba en la lista, no se duplica');
 assert.ok(!result.matches.some(x=>x.id==='glucosa-1'));
});
test('Una sigla conflictiva no selecciona el análisis incorrecto',()=>{
 const same=[
  {id:'pcr-protein',name:'Proteína C reactiva (PCR)',active:true},
  {id:'pcr-molecular',name:'Prueba PCR molecular',active:true}
 ];
 const result=match.matchText('PCR',same);
 assert.equal(result.matches.length,0);
 assert.equal(result.ambiguous.length,1);
});
test('Se reconocen listas separadas por comas, punto y coma y tabulaciones',()=>{
 const result=match.matchText('HEMOGRAMA, FERRITINA; TP\nTTP\tFerritina',tests);
 assert.deepEqual(new Set(result.matches.map(x=>x.id)),new Set(['hemo','ferr','tp','ttpa']));
});
test('No interpretar datos del paciente ni pruebas expresamente descartadas',()=>{
 const result=match.matchText('Paciente: Hemograma\nNo solicitar TP\nSe descarta Ferritina\nFecha 2026-11-16\nTTP',tests);
 assert.deepEqual(Array.from(result.matches,x=>x.id),['ttpa']);
});
test('Los PDF escaneados se convierten a texto con OCR local y modelos descargados bajo demanda',()=>{
 new vm.Script(ocrSource);
 new vm.Script(pdfSource);
 assert.match(ocrSource,/tesseract\.js@5\/dist\/tesseract\.esm\.min\.js/);
 assert.match(ocrSource,/create\('spa\+eng'\)/);
 assert.match(ocrSource,/page\.render\(\{canvasContext:ctx,viewport\}\)/);
 assert.match(ocrSource,/worker\.recognize\(canvas\)/);
 assert.match(ocrSource,/await worker\.terminate\(\)/);
 assert.match(ocrSource,/MAX_OCR_PAGES=8/);
 assert.doesNotMatch(ocrSource,/FormData|\.upload\(|\.post\(|getPublicUrl/);
 assert.match(pdfSource,/const ocr=window\.FleboHomeOrderOCR/);
 assert.match(pdfSource,/ocr\.recognizePages\(scannedPages/);
 assert.match(pdfSource,/No se detectaron pruebas legibles/);
 assert.match(pdfSource,/pageWidth\*0\.075/);
});
test('El lector de PDF extrae páginas de dos columnas y usa OCR si no hay texto',async()=>{
 const start=pdfSource.indexOf(' async function extractText(file,request){');
 const end=pdfSource.indexOf(' function renderReview(result,added){',start);
 assert.ok(start>=0&&end>start);
 const func=pdfSource.slice(start,end);
 let lastStatus='',ocrCalls=0;
 const scanned={
  getTextContent:async()=>({items:[]}),
  getViewport:()=>({width:630,height:920})
 };
 const columns={
  getTextContent:async()=>({items:[
   {str:'Hemograma completo',transform:[1,0,0,1,15,700],width:120},
   {str:'Ferritina',transform:[1,0,0,1,360,700],width:48}
  ]}),
  getViewport:()=>({width:630,height:920})
 };
 const fakePdf={
  numPages:2,
  async getPage(n){return n===1?columns:scanned;},
  async destroy(){}
 };
 const scope={
  TextDecoder,Uint8Array,MAX_PAGES:15,selectionVersion:3,ocrNote:'',
  window:{FleboHomeOrderOCR:{async recognizePages(pages,config){
   ocrCalls++;assert.equal(pages.length,1);
   config.onProgress(1,1);
   return {text:'Tiempo de protrombina (TP)',processed:1,remaining:0,failed:false};
  }}},
  pdfApi:async()=>({getDocument:()=>({promise:Promise.resolve(fakePdf),async destroy(){}})}),
  status:value=>{lastStatus=value;},
  console
 };
 const extract=vm.runInNewContext(func+';extractText',scope);
 const result=await extract({async arrayBuffer(){return new Uint8Array([37,80,68,70,45]).buffer;}},3);
 assert.equal(ocrCalls,1);
 assert.match(result,/Hemograma completo\nFerritina/);
 assert.match(result,/Tiempo de protrombina/);
 assert.match(lastStatus,/Reconociendo texto escaneado/);
});
test('Las pruebas se incorporan antes de guardar o asignar el domicilio',()=>{
 assert.match(pdfSource,/window\.hvOrderApplyTests\(matches\.matches\.map\(x=>x\.id\)\)/);
 assert.match(dom,/if\(window\.FleboHomeVisitPDF\?\.isAnalyzing\?\.\(\)\)/);
 assert.ok(dom.indexOf("if(window.FleboHomeVisitPDF?.isAnalyzing?.())") <
  dom.indexOf("const name=$('hvName').value.trim()"));
 assert.match(dom,/const ids=newTestSelection\.slice\(\)|ids=newTestSelection\.slice\(\)/);
 assert.match(dom,/tests:ids\.map\(\(id,i\)=>/);
 assert.match(dom,/status:selectedProfessional\?'Pendiente de aceptación':'Pendiente de asignación'/);
 assert.ok(dom.indexOf('if(!await save(v))')<dom.indexOf('uploadVisitDocument(v.id,orderPdf,'));
 assert.match(volunteer,/isScheduledToday\(offer\.scheduled_at\)/);
 assert.match(volunteer,/client\.rpc\('volunteer_home_visit'/);
 assert.match(dom,/createSignedUrl\(d\.storage_path,90\)/);
});
test('Vista previa de la orden disponible antes de guardar y desde la ficha ya creada',()=>{
 assert.match(pdfSource,/hvOrderPreviewPdf/);
 assert.match(pdfSource,/URL\.createObjectURL\(pending\)/);
 assert.match(pdfSource,/window\.open\(previewUrl,'_blank'\)/);
 assert.match(pdfSource,/hvOrderCancelRead/);
 assert.match(pdfSource,/const pending=|let pending=/);
 assert.match(html,/home-visit-order-ocr\.js\?v=20261116-doc3/);
 assert.match(html,/home-visit-order-pdf\.js\?v=20261116-doc3/);
 assert.match(html,/home-visit-order-match\.js\?v=20261116-doc3/);
 assert.match(sw,/'\.\/home-visit-order-ocr\.js'/);
});


test('El flebotomista aceptado ve pruebas y abre la orden PDF privada',()=>{
 const begin=dom.indexOf('function technicianFieldScreen(v){');
 const stop=dom.indexOf('async function saveFieldObservation(',begin);
 const field=dom.slice(begin,stop);
 assert.ok(begin>0&&stop>begin);
 assert.match(field,/Pruebas y recipientes/);
 assert.match(field,/Documento original/);
 assert.match(field,/Ver orden original/);
 assert.match(field,/hvOpenDocument/);
 assert.match(field,/v\.documents\|\|\[\]/);
 assert.ok(field.indexOf('if(locked){')<field.indexOf('Documento original'));
 assert.match(dom,/home_visit_documents\(\*\)/);
 assert.match(dom,/createSignedUrl\(d\.storage_path,90\)/);
});
