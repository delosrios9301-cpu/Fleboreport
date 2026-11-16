import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const get=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [ui,upload,visits,html,sw,sql]=await Promise.all([
 get('home-visit-order-pdf.js'),
 get('home-visit-large-pdf-upload.js'),
 get('domicilios.js'),get('index.html'),get('service-worker.js'),
 get('supabase/migrations/20261115165609_raise_home_visit_documents_limit_to_50mb.sql')
]);

function harness(){
 const byId=new Map();
 function makeElement(tag='div'){
  const callbacks={};
  const n={tag,callbacks,children:[],hidden:false,disabled:false,value:'',
    dataset:{},files:[],textContent:'',type:'',name:'',
    append(...children){this.children.push(...children);},
    replaceChildren(...children){this.children=children;},
    setAttribute(name,value){this[name]=String(value);},
    addEventListener(name,fn){callbacks[name]=fn;},
    insertAdjacentElement(_position,elem){this.child=elem;},
    closest(){return this.parentField||null;}
  };
  let nodeId;
  Object.defineProperty(n,'id',{set(v){nodeId=v;byId.set(v,n)},get(){return nodeId}});
  return n;
 }
 const panel=makeElement();panel.id='hvCreatePanel';
 const field=makeElement();field.id='testField';
 const picker=makeElement();picker.id='hvTestsSearch';picker.parentField=field;
 const document={
  readyState:'complete',createElement:makeElement,
  getElementById:k=>byId.get(k)||null,
  body:makeElement(),addEventListener(){}
 };
 const win={FleboHomeOrderMatch:{matchText(){return {matches:[],ambiguous:[],unmatched:[],examined:0}}},
  addEventListener(){},hvOrderCatalog:()=>[]};
 const context={document,window:win,TextDecoder,Uint8Array,MutationObserver:class{observe(){} disconnect(){}},console};
 vm.runInNewContext(ui,context,{filename:'home-visit-order-pdf.js'});
 assert.ok(win.FleboHomeVisitPDF);
 const fileInput=byId.get('hvOrderPdfFile');
 function fakePdf(size,mime='application/pdf'){
  return {name:'orden-laboratorio.pdf',size,type:mime,
   slice(){return {async arrayBuffer(){return Uint8Array.from([37,80,68,70,45]).buffer}}}
  };
 }
 return {win,byId,fileInput,fakePdf,
  async change(file){fileInput.files=[file];await fileInput.callbacks.change();}
 };
}

test('Al elegir un PDF de 20 MB intenta leerlo y conserva el adjunto aunque no esté disponible el lector',async()=>{
 const h=harness(),file=h.fakePdf(20*1024*1024,'application/octet-stream');
 await h.change(file);
 assert.equal(h.win.FleboHomeVisitPDF.pendingFile(),file);
 assert.notEqual(h.fileInput.disabled,true);
 assert.match(h.byId.get('hvOrderStatus').textContent,/lector PDF|lectura|sin conexión/i);
});

test('Al elegir un PDF de 45 MB sigue seleccionado y permite sustituirlo',async()=>{
 const h=harness(),file=h.fakePdf(45*1024*1024);
 await h.change(file);
 assert.equal(h.win.FleboHomeVisitPDF.pendingFile(),file);
 const replacement=h.fakePdf(19*1024*1024);
 await h.change(replacement);
 assert.equal(h.win.FleboHomeVisitPDF.pendingFile(),replacement);
 assert.notEqual(h.fileInput.disabled,true);
});

test('Un PDF mayor al límite del plan se acepta en el selector y se avisa antes de crear',async()=>{
 const h=harness(),file=h.fakePdf(53*1024*1024);
 await h.change(file);
 assert.equal(h.win.FleboHomeVisitPDF.pendingFile(),file);
 assert.match(h.byId.get('hvOrderStatus').textContent,/Supera los 50 MB/i);
 assert.match(visits,/const oversizedOrder=!!\(pendingOrder&&pendingOrder\.size>50\*1024\*1024\)/);
 assert.match(visits,/const orderPdf=oversizedOrder\?null:pendingOrder/);
 assert.match(visits,/Domicilio creado correctamente sin PDF/);
 assert.doesNotMatch(visits.slice(visits.indexOf('const pendingOrder='),visits.indexOf('if(!await save(v))')),/if\(oversizedOrder\).*?return;/s);
});

test('Adjuntar orden PDF es opcional y nunca bloquea guardar el domicilio',()=>{
 const h=harness();
 assert.equal(h.fileInput.required,false);
 assert.match(ui,/Adjunta opcionalmente una fotografía/);
 assert.match(visits,/const pendingOrder=window\.FleboHomeVisitPDF\?\.pendingFile\?\.\(\)\|\|null/);
 assert.match(visits,/if\(orderPdf\)documentSaved=await uploadVisitDocument/);
 assert.match(visits,/Domicilio creado y guardado correctamente/);
});

test('Los archivos PDF no válidos se rechazan por cabecera, no por su peso',async()=>{
 const h=harness(),file={name:'falso.pdf',type:'application/pdf',size:10*1024*1024,
  slice(){return {async arrayBuffer(){return Uint8Array.from([65,65,65,65,65]).buffer}}}};
 await h.change(file);
 assert.equal(h.win.FleboHomeVisitPDF.pendingFile(),null);
 assert.match(h.byId.get('hvOrderStatus').textContent,/no parece ser un PDF válido/);
 assert.notEqual(h.fileInput.disabled,true);
});

test('Al elegir archivo grande sin conexión al lector conserva archivo y permite selección manual',async()=>{
 const h=harness(),file=h.fakePdf(18*1024*1024);
 await h.change(file);
 assert.equal(h.win.FleboHomeVisitPDF.pendingFile(),file);
 assert.match(h.byId.get('hvOrderStatus').textContent,/selecciona las pruebas manualmente/);
});

test('Los archivos privados de hasta 50 MB pueden intentar leerse antes de guardarse',()=>{
 assert.match(ui,/RECOGNITION_BYTES=50\*1024\*1024,STORAGE_BYTES=50\*1024\*1024/);
 assert.doesNotMatch(ui,/file\.size>MAX_BYTES/);
 assert.doesNotMatch(ui,/btn\.disabled=true/);
 assert.match(visits,/if\(file\.size>50\*1024\*1024\)/);
 assert.doesNotMatch(visits,/file\.size>15\*1024\*1024/);
 assert.match(visits,/application\/octet-stream/);
});

test('La subida privada utiliza TUS reanudable desde 6 MB con progreso y respaldo',()=>{
 new vm.Script(upload,{filename:'home-visit-large-pdf-upload.js'});
 assert.match(upload,/tus-js-client@4\.3\.1\/\+esm/);
 assert.match(upload,/RELIABLE_THRESHOLD=6\*MB/);
 assert.match(upload,/chunkSize:6\*MB/);
 assert.match(upload,/retryDelays:\[0,3000,5000,10000,20000\]/);
 assert.match(upload,/authorization:'Bearer '\+token/);
 assert.match(upload,/removeFingerprintOnSuccess:true/);
 assert.match(upload,/\n    endpoint,/); // Supabase direct storage hostname
 assert.match(upload,/\.storage\.supabase\.co\/storage\/v1\/upload\/resumable/);
 assert.match(upload,/client\.storage\.from\(bucket\)\.upload\(path,file/);
 assert.match(visits,/window\.FleboHomeVisitUploader\.upload\(cloud\.client,'home-visit-documents'/);
 assert.match(visits,/Adjuntando PDF… /);
});

test('No se relajan las políticas de seguridad ni se publican documentos',()=>{
 assert.match(sql,/UPDATE storage\.buckets/);
 assert.match(sql,/file_size_limit = 52428800/);
 assert.match(sql,/id = 'home-visit-documents'/);
 assert.doesNotMatch(sql,/\bpublic\s*=\s*true|storage\.objects|DROP POLICY|ALTER POLICY/);
 assert.match(visits,/cloud\.client\.from\('home_visit_documents'\)\.insert/);
 assert.match(visits,/storage\.from\('home-visit-documents'\)\.remove/);
 assert.doesNotMatch(upload,/service_role|secretKey|createPublicUrl|getPublicUrl/);
});

test('La PWA precachea los recursos actualizados después de los módulos',()=>{
 for(const asset of ['home-visit-order-pdf.js','home-visit-order-pdf.css']){
  assert.ok(html.includes('./'+asset+'?v='+(asset.endsWith('.js')?'20261116-doc3':'20261116-ocr1')));
 }
 assert.ok(html.includes('./home-visit-large-pdf-upload.js?v=20261115-order2'));
 assert.match(sw,/'\.\/home-visit-large-pdf-upload\.js'/);
});
