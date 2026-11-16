import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const get=n=>readFile(new URL('../'+n,import.meta.url),'utf8');
const [matcherSrc,readerSrc,uiSrc,ocrSrc,domSrc,html,worker]=await Promise.all([
 get('home-visit-order-match.js'),get('home-visit-order-document-reader.js'),
 get('home-visit-order-pdf.js'),get('home-visit-order-ocr.js'),
 get('domicilios.js'),get('index.html'),get('service-worker.js')
]);
const m={exports:{}},d={exports:{}};
vm.runInNewContext(matcherSrc,{module:m},{filename:'order-match.js'});
vm.runInNewContext(readerSrc,{module:d,TextDecoder,Uint8Array},{filename:'document-reader.js'});
const match=m.exports,reader=d.exports;
const catalog=[
 {id:'hemo',name:'Hemograma completo (CBC)',code:null,active:true},
 {id:'fer',name:'Ferritina',code:null,active:true},
 {id:'tp',name:'Tiempo de protrombina (TP)',code:null,active:true},
 {id:'glu1',name:'Glucosa en ayunas',code:null,active:true},
 {id:'glu2',name:'Glucosa aleatoria',code:null,active:true}
];
test('Presupuesto con precios, código, cantidades y total identifica Hemograma completo real',()=>{
 const budget='PRESUPUESTO\nCÓDIGO DESCRIPCIÓN CANT. P. UNITARIO TOTAL\n001 HEMOGRAMA COMPLETO 1 15.00 15.00\n002 FERRITINA B/. 12.50\n003 TIEMPO DE PROTROMBINA (TP) 1 9,95 9,95';
 const r=match.matchText(budget,catalog);
 assert.deepEqual(Array.from(r.matches,x=>x.id),['hemo','fer','tp']);
 assert.equal(r.matches.length,3);
});
test('Presupuesto en Excel con tabulaciones o importes enteros sin decimales',()=>{
 const r=match.matchText('001\tHEMOGRAMA COMPLETO\t1\t15\t15\n002\tFERRITINA\t1\t12\t12',catalog);
 assert.deepEqual(Array.from(r.matches,x=>x.id),['hemo','fer']);
});
test('Presupuesto escaneado por OCR identifica nombre junto a precio sin inventar otras pruebas',()=>{
 const r=match.matchText('01 HEMOGRAMA COMPLETO 2 20.00 40.00\nSubtotal 40.00\nPruebas no solicitadas: NO REALIZAR FERRITINA',catalog);
 assert.deepEqual(Array.from(r.matches,x=>x.id),['hemo']);
});
test('No confundir Glucosa con variantes, ni subtotal con solicitud',()=>{
 const r=match.matchText('Glucosa 1 20.00\nSubtotal hemograma completo 10.00\nNo solicitar Ferritina',catalog);
 assert.equal(r.matches.length,0);
 assert.ok(r.ambiguous.length>=1||r.unmatched.length>=1);
});
test('Clasifica formatos habituales, incluyendo fotos, Word, Excel, CSV y TXT',()=>{
 const expected={foto_jpg:'image',foto_png:'image',foto_webp:'image',
  presupuesto_pdf:'pdf',orden_docx:'docx',lista_xlsx:'xlsx',lista_xlsm:'xlsx',
  presupuesto_csv:'text',lista_txt:'text',antiguo_doc:'legacy',viejo_xls:'legacy'};
 for(const [key,value] of Object.entries(expected)){
  const [filename,suffix]=key.split('_');
  const actual=reader.kind({name:filename+'.'+suffix});
  assert.equal(actual,value,key);
 }
 assert.equal(reader.kind({name:'orden.exe'}),'');
 assert.equal(reader.storageMime({name:'presupuesto.xlsx'}),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
});
test('Documento fotográfico pasa por OCR local y devuelve texto reconocible',async()=>{
 const txt='1 HEMOGRAMA COMPLETO 1 10.00 10.00';
 const file={name:'foto-presupuesto.jpg',type:'image/jpeg'};
 let seen=0;
 const result=await reader.read(file,{ocr:{async recognizeImage(image){
  assert.equal(image,file);seen++;return{text:txt};
 }}});
 assert.equal(seen,1);
 assert.equal(match.matchText(result,catalog).matches[0].id,'hemo');
});
test('CSV se analiza sin salir del dispositivo y admite precios',async()=>{
 const raw='Código,Prueba,Cantidad,Precio,Total\n001,HEMOGRAMA COMPLETO,1,12.00,12.00';
 const file={name:'presupuesto.csv',async arrayBuffer(){return new TextEncoder().encode(raw).buffer;}};
 const text=await reader.read(file);
 assert.match(text,/HEMOGRAMA COMPLETO/);
 assert.ok(match.matchText(text,catalog).matches.some(x=>x.id==='hemo'));
});
test('PDF de presupuesto con encabezado digital e imagen de tabla usa OCR',async()=>{
 const start=uiSrc.indexOf(' async function extractText(file,request){');
 const end=uiSrc.indexOf(' function renderReview(result,added){',start);
 assert.ok(start>0&&end>start);
 const source=uiSrc.slice(start,end);
 let ocrCalls=0;
 const fakePage={
  getTextContent:async()=>({items:[
   {str:'PRESUPUESTO DE LABORATORIO',transform:[1,0,0,1,30,720],width:180},
   {str:'Código y cantidad',transform:[1,0,0,1,30,680],width:100},
   {str:'Paciente:',transform:[1,0,0,1,30,650],width:60},
   {str:'Subtotal:',transform:[1,0,0,1,30,620],width:65}
  ]}),
  getViewport:()=>({width:700,height:920})
 };
 const pdf={numPages:1,getPage:async()=>fakePage,async destroy(){}};
 const context={
  TextDecoder,Uint8Array,MAX_PAGES:500,selectionVersion:1,ocrNote:'',coverage:{},
  pdfApi:async()=>({getDocument:()=>({promise:Promise.resolve(pdf),async destroy(){}})}),
  window:{FleboHomeOrderOCR:{async recognizePages(pages){
   ocrCalls++;assert.equal(pages[0],fakePage);
   return{text:'1 HEMOGRAMA COMPLETO 1 14.00 14.00',processed:1,remaining:0,failed:false};
  }}},
  status(){},console
 };
 const extract=vm.runInNewContext(source+';extractText',context);
 const result=await extract({arrayBuffer:async()=>new Uint8Array([37,80,68,70,45]).buffer},1);
 assert.equal(ocrCalls,1);
 assert.equal(match.matchText(result,catalog).matches[0].id,'hemo');
});
test('Documentos privados se reconocen antes de guardar; flebotomista puede abrir original',()=>{
 new vm.Script(uiSrc);new vm.Script(ocrSrc);new vm.Script(readerSrc);
 assert.match(uiSrc,/reader\.read\(file,\{/);
 assert.match(uiSrc,/window\.hvOrderApplyTests\(matches\.matches\.map\(x=>x\.id\)\)/);
 assert.match(domSrc,/if\(window\.FleboHomeVisitPDF\?\.isAnalyzing\?\.\(\)\)/);
 assert.match(domSrc,/uploadVisitDocument\(v\.id,orderPdf,/);
 assert.match(domSrc,/createSignedUrl\(d\.storage_path,90\)/);
 assert.match(uiSrc,/Ver documento original/);
 assert.match(html,/home-visit-order-document-reader\.js/);
 assert.match(worker,/'\.\/home-visit-order-document-reader\.js'/);
 assert.doesNotMatch(readerSrc,/\.upload\(|\.post\(|new\s+FormData\(/);
});
