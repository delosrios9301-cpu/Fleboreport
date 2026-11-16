import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [matcherSource,pdfSource,ocrSource,domSource,html]=await Promise.all([
 read('home-visit-order-match.js'),read('home-visit-order-pdf.js'),
 read('home-visit-order-ocr.js'),read('domicilios.js'),read('index.html')
]);
const module={exports:{}};
vm.runInNewContext(matcherSource,{module},{filename:'home-visit-order-match.js'});
const matcher=module.exports;
test('Una orden extensa de 160 pruebas se reconoce completa sin el límite de 8 ni de 25 pruebas',()=>{
 const catalog=Array.from({length:160},(_,i)=>({
  id:'exam-'+i,name:'Prueba específica de laboratorio '+(1001+i),code:'EX'+i,active:true
 }));
 const order=catalog.map((x,i)=>
  String(i+1).padStart(3,'0')+' '+x.name+' 1 15.00 15.00').join('\n');
 const result=matcher.matchText(order,catalog);
 assert.equal(result.matches.length,160);
 assert.equal(result.ambiguous.length,0);
 assert.equal(result.unmatched.length,0);
 assert.equal(result.matches.at(-1).name,catalog.at(-1).name);
});
test('Listas en una sola línea reconocen varias pruebas sin marcarlas erróneamente como faltantes',()=>{
 const catalog=[
  {id:'h',name:'Hemograma completo'}, {id:'f',name:'Ferritina'},
  {id:'c',name:'Creatinina'}, {id:'a',name:'Ácido úrico'}
 ];
 const res=matcher.matchText('Hemograma completo, Ferritina + Creatinina; Ácido úrico',catalog);
 assert.deepEqual(new Set(Array.from(res.matches,x=>x.id)),new Set(['h','f','c','a']));
 assert.equal(res.unmatched.length,0);
});
test('Los sinónimos registrados en catálogo se reconocen, la escritura OCR dudosa sólo se sugiere',()=>{
 const catalog=[
  {id:'h',name:'Hemograma completo',code:'HEM',aliases:['Biometría hemática','Cuadro hemático']},
  {id:'f',name:'Ferritina'},
  {id:'ga',name:'Glucosa en ayunas'}, {id:'gr',name:'Glucosa aleatoria'}
 ];
 const res=matcher.matchText('BIOMETRIA HEMATICA\nHemograma compIeto\nGlucosa',catalog);
 assert.deepEqual(Array.from(res.matches,x=>x.id),['h']);
 assert.ok(res.suggestions.some(x=>x.id==='h'&&x.line==='Hemograma compIeto'));
 assert.ok(res.ambiguous.some(x=>x.line==='Glucosa'&&x.options.length===2));
 assert.ok(!res.matches.some(x=>x.id==='ga'||x.id==='gr'));
});
test('La vista de revisión permite seleccionar manualmente una prueba sugerida o ambigua',()=>{
 assert.match(pdfSource,/function makeReviewButton\(id,name\)/);
 assert.match(pdfSource,/window\.hvOrderApplyTests\(\[id\]\)/);
 assert.match(pdfSource,/result\.ambiguous/);
 assert.match(pdfSource,/match\.options\|\|\[\]/);
 assert.match(pdfSource,/result\.suggestions/);
 assert.match(pdfSource,/Ver texto leído para comprobar pruebas faltantes/);
 assert.match(pdfSource,/Lectura parcial: revisión obligatoria/);
 assert.match(domSource,/MAX_CATALOG_ROWS=20000/);
 assert.match(domSource,/\.range\(start,start\+PAGE_SIZE-1\)/);
 assert.match(html,/domicilios\.js\?v=20261115-catalogfix1&edition=20261116-full1/);
});
test('PDF con 13 páginas escaneadas procesa las 13 sin descartar silenciosamente las últimas',async()=>{
 const start=pdfSource.indexOf(' async function extractText(file,request){');
 const end=pdfSource.indexOf(' function makeReviewButton(',start);
 assert.ok(start>0&&end>start);
 const extractSource=pdfSource.slice(start,end);
 let calls=0;
 const pages=Array.from({length:13},(_,i)=>({
  getTextContent:async()=>({items:[{str:'Presupuesto clínico',width:100,transform:[1,0,0,1,20,750]}]}),
  getViewport:()=>({width:630,height:800})
 }));
 const pdf={numPages:13,async getPage(n){return pages[n-1]},async destroy(){}};
 const coverage={};
 const ctx={
  TextDecoder,Uint8Array,MAX_PAGES:500,selectionVersion:5,ocrNote:'',coverage,
  pdfApi:async()=>({getDocument:()=>({promise:Promise.resolve(pdf),async destroy(){}})}),
  window:{FleboHomeOrderOCR:{async recognizePages(scanned){
   calls++;assert.equal(scanned.length,13);
   return{text:'Hemograma completo\nFerritina',processed:13,remaining:0,failed:false};
  }}},
  status:()=>{},console
 };
 const extract=vm.runInNewContext(extractSource+';extractText',ctx);
 const answer=await extract({arrayBuffer:async()=>new Uint8Array([37,80,68,70,45]).buffer},5);
 assert.equal(calls,1);
 assert.equal(coverage.pages,13);
 assert.equal(coverage.total,13);
 assert.equal(coverage.ocr,13);
 assert.equal(coverage.complete,true);
 assert.match(answer,/Hemograma completo/);
 assert.match(ocrSource,/MAX_OCR_PAGES=500/);
});
