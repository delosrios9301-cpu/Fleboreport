import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [dom,pdf,css,html,oldTests]=await Promise.all([
 read('domicilios.js'),read('home-visit-order-pdf.js'),
 read('home-visit-order-pdf.css'),read('index.html'),
 read('tests/home-visit-order-pdf.test.mjs')
]);
const start=dom.indexOf('/* El lector PDF necesita el catálogo');
const end=dom.indexOf('window.hvCreate=create;',start);
assert.ok(start>0&&end>start,'Bloque de lectura del catálogo no encontrado');
const apiSource=dom.slice(start,end);

function buildHarness({
 role='clinician',
 ready=false,
 entries=[{id:'e1f13311-499c-4444-bdf2-fd00590b7700',name:'Hemograma completo',code:'HEM',active:true,fields:{sample:'Sangre'}}],
 error=null
}={}){
 const calls=[],client={from(table){
  calls.push(['from',table]);
  const builder={
   select(columns){calls.push(['select',columns]);return builder},
   eq(field,value){calls.push(['eq',field,value]);return builder},
   order(field){calls.push(['order',field]);return builder},
   range(from,to){calls.push(['range',from,to]);return Promise.resolve({data:entries.slice(from,to+1),error})}
  };
  return builder;
 }};
 const window={},scope={window,cloud:{client,user:{id:'user-test'},workspaceId:'workspace-test',role,ready},
  remoteCatalog:[],newTestSelection:[],drawTestPicker(){calls.push(['drawTestPicker'])},
  $(){return null},asUuid:x=>typeof x==='string'&&x.length===36};
 vm.runInNewContext(apiSource,scope,{filename:'home-order-lookup.js'});
 return {window,scope,calls};
}

test('El catálogo de Domicilios se lee desde servicios activos aunque la sincronización inicial siga pendiente',async()=>{
 const h=buildHarness({ready:false});
 const rows=await h.window.hvOrderEnsureCatalog();
 assert.equal(rows.length,1);
 assert.equal(rows[0].name,'Hemograma completo');
 assert.equal(rows[0].code,'HEM');
 assert.equal(h.window.hvOrderCatalog().length,1);
 assert.ok(h.calls.some(x=>x[0]==='from'&&x[1]==='services'));
 assert.ok(h.calls.some(x=>x[0]==='eq'&&x[1]==='workspace_id'&&x[2]==='workspace-test'));
 assert.ok(h.calls.some(x=>x[0]==='eq'&&x[1]==='active'&&x[2]===true));
 assert.ok(!h.calls.some(x=>['insert','upsert','delete','update'].includes(x[0])));
});

test('Lee el catálogo completo de 1166 pruebas mediante páginas de 400, sin truncar 1000',async()=>{
 const rows=Array.from({length:1166},(_,index)=>({
  id:'00000000-0000-0000-0000-'+String(index+1).padStart(12,'0'),
  name:'Prueba '+index,code:'P'+index,active:true,
  fields:{aliases:index===1165?'Nombre alternativo':''}
 }));
 const h=buildHarness({entries:rows});
 const obtained=await h.window.hvOrderEnsureCatalog();
 assert.equal(obtained.length,1166);
 assert.equal(obtained.at(-1).name,'Prueba 1165');
 assert.equal(obtained.at(-1).aliases,'Nombre alternativo');
 const ranges=h.calls.filter(x=>x[0]==='range');
 assert.deepEqual(Array.from(ranges,x=>[x[1],x[2]]),[[0,399],[400,799],[800,1199]]);
 assert.equal(h.scope.remoteCatalog.length,1166);
});

test('Pruebas reconocidas por PDF se incorporan al mismo selector manual sin duplicarlas',async()=>{
 const h=buildHarness();
 const rows=await h.window.hvOrderEnsureCatalog();
 assert.equal(h.window.hvOrderApplyTests([rows[0].id,rows[0].id]),1);
 assert.equal(h.window.hvOrderApplyTests([rows[0].id]),0);
 assert.equal(h.scope.newTestSelection.length,1);
 assert.ok(h.calls.some(x=>x[0]==='drawTestPicker'));
});

test('Error al recuperar catálogo mantiene la lista existente y no modifica pruebas',async()=>{
 const h=buildHarness({error:{message:'Error de permisos o conexión'}});
 h.scope.remoteCatalog=[{id:'e1f13311-499c-4444-bdf2-fd00590b7700',name:'Prueba existente'}];
 await assert.rejects(h.window.hvOrderEnsureCatalog(),/Error de permisos o conexión/);
 assert.equal(h.scope.remoteCatalog.length,1);
 assert.equal(h.scope.remoteCatalog[0].name,'Prueba existente');
});

test('Acceso autorizado obligatorio, sin ampliar permisos a usuarios no habilitados',async()=>{
 const h=buildHarness({role:'technician'});
 await assert.rejects(h.window.hvOrderEnsureCatalog(),/sesión autorizada/);
 assert.equal(h.window.hvOrderCatalog().length,0);
 assert.equal(h.calls.length,0);
 assert.match(apiSource,/\['admin','clinician','reception'\]\.includes\(cloud\.role\)/);
 assert.match(apiSource,/cloud\.user\?\.id&&cloud\.workspaceId/);
});

test('La detección automática consulta datos reales, distingue errores y permite reintentar sin escoger el PDF otra vez',()=>{
 new vm.Script(pdf,{filename:'home-visit-order-pdf.js'});
 assert.match(pdf,/const getCatalog=async\(\)=>typeof window\.hvOrderEnsureCatalog==='function'/);
 assert.match(pdf,/const catalog=await getCatalog\(\)/);
 assert.match(pdf,/recognizedText=text;/);
 assert.match(pdf,/async function matchAndApply\(text,request\)/);
 assert.match(pdf,/Reintentar búsqueda en catálogo/);
 assert.match(pdf,/if\(recognizedText\)void matchAndApply\(recognizedText,selectionVersion\)/);
 assert.match(pdf,/if\(request!==selectionVersion\)return;/);
 assert.match(pdf,/No se pudo consultar el catálogo desde la nube/);
 assert.match(pdf,/El documento permanece seleccionado para guardar/);
 assert.doesNotMatch(pdf,/El catálogo aún no está disponible/);
 assert.match(pdf,/if\(!text\.trim\(\)\)/);
 assert.match(pdf,/window\.hvOrderApplyTests\(matches\.matches\.map\(x=>x\.id\)\)/);
 assert.match(pdf,/window\.FleboHomeVisitPDF=\{pendingFile:\(\)=>pending,isAnalyzing:\(\)=>running/);
 assert.match(oldTests,/La visita se guarda antes de adjuntar su PDF/);
});

test('Nuevo domicilio solicita catálogo actualizado sin interrumpir el buscador manual',()=>{
 assert.match(dom,/if\(tab==='create'&&!remoteCatalog\.length&&typeof window\.hvOrderEnsureCatalog==='function'\)void window\.hvOrderEnsureCatalog\(\)/);
 assert.match(dom,/window\.hvOrderEnsureCatalog=async function\(\)/);
 assert.match(dom,/\.from\('services'\)/);
 assert.match(dom,/\.select\('id,catalog_source_id,code,name,category,description,fields,active'\)/);
 assert.match(dom,/\.eq\('active',true\)/);
 assert.match(dom,/remoteCatalog=fresh/);
 assert.match(dom,/drawTestPicker\('hvTests'/);
 assert.doesNotMatch(apiSource,/\.delete\(|\.update\(|\.insert\(|\.upsert\(/);
});

test('Botón de reintento con contraste y versiones nuevas evita servir scripts antiguos de PWA',()=>{
 assert.match(css,/#view-domicilios #hvOrderRetryCatalog\[hidden\]\{display:none!important;\}/);
 assert.match(css,/#view-domicilios #hvOrderRetryCatalog\{/);
 assert.ok(Number(html.match(/domicilios\.js\?v=(\d{8})-[^"']+/)?.[1])>=20261115,'Debe cargarse el script de Domicilios versionado');
 assert.match(html,/home-visit-order-pdf\.js\?v=20261116-full1/);
 assert.match(html,/home-visit-order-pdf\.css\?v=20261116-full1/);
});
