import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [source,ui,css,html,worker,visits,reference]=await Promise.all([
 read('catalog-import-core.js'),read('catalog-import-ui.js'),read('catalog-import-ui.css'),
 read('index.html'),read('service-worker.js'),read('domicilios.js'),
 read('catalog-premium-reference.js')
]);
const mod={exports:{}};
vm.runInNewContext(source,{module:mod,TextDecoder,Uint8Array,DataView,Map,Set,String,Array,Number,Error},{filename:'catalog-import-core.js'});
const core=mod.exports;

test('CSV con BOM, comillas, comas y separadores múltiples',()=>{
 const rows=core.parseDelimited('\uFEFFNombre;Código;Muestra\r\n"Hemograma, completo";HEM;Sangre\r\n"Glucosa ""ayunas""";GLU;Suero\r\n');
 assert.equal(rows.length,3);
 assert.deepEqual(Array.from(rows[1]),['Hemograma, completo','HEM','Sangre']);
 assert.equal(rows[2][0],'Glucosa "ayunas"');
 const commas=core.parseDelimited('Nombre,Código,Muestra\nGlucosa,G-1,Suero\n');
 assert.equal(commas[1][1],'G-1');
 const tab=core.parseDelimited('Nombre\tCódigo\tMuestra\nCreatinina\tCR\tSuero\n');
 assert.equal(tab[1][0],'Creatinina');
});

test('Plantilla admite encabezados del laboratorio, vacíos y acentos',()=>{
 const rows=[['Nombre','Código','Muestra','Recipiente','Volumen','Método','Ayuno','Condiciones','Indicaciones'],
 ['Hemoglobina Glicosilada','A1C','Sangre','Tubo morado','3 mL','HPLC','8 h','Refrigerar',''],
 ['', '', 'Sangre', 'EDTA'],
 ['Glucosa','GL','Suero']];
 const result=core.prepare(rows,[]);
 assert.equal(result.length,3);
 assert.equal(result[0].item.name,'Hemoglobina Glicosilada');
 assert.equal(result[0].item.code,'A1C');
 assert.equal(result[0].item.method,'HPLC');
 assert.equal(result[0].status,'new');
 assert.equal(result[1].status,'invalid');
 assert.equal(result[2].status,'new');
 assert.throws(()=>core.prepare([['Encabezado desconocido'],['X']],[]),/Falta la columna/);
 assert.equal(core.norm('  Hemoglóbina   GLICOSILADA  '),'hemoglobina glicosilada');
});

test('No duplica pruebas por código, nombre o repetición dentro del mismo archivo',()=>{
 const existing=[{id:'x1',name:'Ácido Úrico',code:'AU',active:true},
 {id:'x2',name:'Glucosa',code:'GL',active:false}];
 const input=[['Nombre','Código'],['Acido urico','otra'],['Otra prueba','AU'],
 ['GLUCOSA','GLU'],['Creatinina','CR'],['Creatinina','CR2'],['Colesterol','CR']];
 const result=core.prepare(input,existing);
 assert.deepEqual(Array.from(result,x=>x.status),[
  'duplicate','duplicate','duplicate','new','duplicate','duplicate'
 ]);
 assert.equal(result[0].reason,'Nombre ya registrado');
 assert.equal(result[1].reason,'Código ya registrado');
 assert.equal(result[4].reason,'Repetida dentro del archivo');
 assert.equal(result[5].reason,'Repetida dentro del archivo');
 assert.equal(existing[0].name,'Ácido Úrico');
});

test('Registro nuevo conserva protocolo pendiente de validación, metadatos y activo',()=>{
 const item={name:'Glucosa',code:'GLU',sample:'Suero',vessel:'Tubo rojo',method:'Enzimático'};
 const x=core.makeCatalogRecord(item,'t-import-abc','2026-11-15T00:00:00Z');
 assert.equal(x.id,'t-import-abc');
 assert.equal(x.name,'Glucosa');
 assert.equal(x.sample,'Suero');
 assert.equal(x.validated,false);
 assert.equal(x.active,true);
 assert.equal(x.method,'Enzimático');
 assert.equal(x.createdAt,x.updatedAt);
 assert.equal(x.color,'#237C49');
});

test('Límites y archivos incompletos se rechazan antes de guardar',()=>{
 assert.equal(core.MAX_FILE,3*1024*1024);
 assert.equal(core.MAX_ROWS,1500);
 assert.throws(()=>core.parseDelimited('Nombre;Código\n"Sin cerrar'),/comillas/);
 assert.throws(()=>core.prepare([],[]),/vacío/);
 assert.throws(()=>core.parseDelimited('Nombre\n'+Array.from({length:1501},(_,i)=>'Prueba '+i).join('\n')),/máximo/);
 assert.match(source,/if\(unpacked>MAX_XML\)/);
 assert.match(source,/typeof DecompressionStream==='undefined'/);
 assert.match(source,/application\/xml/);
 assert.match(source,/getElementsByTagNameNS\('\*','row'\)/);
 assert.match(source,/async function parseXlsx\(buffer\)/);
});

test('Vista previa obligatoria y guardado único con rollback si falla el almacenamiento',()=>{
 new vm.Script(ui,{filename:'catalog-import-ui.js'});
 assert.match(ui,/currentMatrix=matrix;preview=rows/);
 assert.match(ui,/const valid=core\.prepare\(currentMatrix,state\.catalog\)\.filter\(x=>x\.status==='new'\)/);
 assert.match(ui,/window\.confirm\('¿Agregar '/);
 assert.match(ui,/state\.catalog\.push\(\.\.\.imported\)/);
 assert.match(ui,/if\(!api\.save\(\)\)\{state\.catalog=before;/);
 assert.match(ui,/api\.refresh\(\)/);
 assert.match(ui,/await window\.FleboCloudSync\.syncNow\(\{verify:true\}\)/);
 assert.match(ui,/window\.auditAdd\('Catálogo de pruebas','Importó '/);
 assert.match(ui,/No se han modificado|No se ha modificado el catálogo/);
 assert.match(ui,/row[sS]?/);
});

test('El permiso de crear en Catálogo controla el botón y el guardado',()=>{
 assert.match(ui,/member\.role==='admin'/);
 assert.match(ui,/window\.fleboCan\('catalog','create'\)/);
 assert.match(ui,/member\.active!==true/);
 assert.match(ui,/trigger\.hidden=!allowed/);
 assert.match(ui,/if\(loading\|\|!authorized\(\)\|\|!currentMatrix\)return;/);
 assert.match(ui,/data.*permissionModule/);
 assert.match(ui,/modal\.querySelector\('\.catalog-import-confirm'\)\.disabled/);
 assert.match(ui,/role="dialog"/);
 assert.match(ui,/aria-live="polite"/);
});

test('Utiliza el catálogo maestro que Jornada y la agenda de Domicilios ya consumen',()=>{
 assert.match(html,/function renderJourneyPatientChoices\(\)/);
 assert.match(html,/\(Array\.isArray\(state\.catalog\)\?state\.catalog:\[\]\)\.filter/);
 assert.match(visits,/const localCatalog=\(\)=>Array\.isArray\(appState\(\)\.catalog\)/);
 assert.match(visits,/const masterCatalog=localCatalog\(\)\.filter/);
 assert.match(visits,/cloud\.client\.from\('services'\)\.insert\(row\)/);
 assert.match(visits,/window\.FleboHomeCatalogRefresh=async function\(\)/);
 assert.match(ui,/window\.FleboHomeCatalogRefresh\(\)/);
 assert.match(reference,/window\.FleboAppState\?\.get\?\.\(\)\?\.catalog/);
 assert.doesNotMatch(ui,/create table|create extension|create policy/);
});

test('Archivos nuevos se cargan después del código central y en la PWA offline',()=>{
 const order=['catalog-import-ui.css?v=20261115-import1',
  'catalog-import-core.js?v=20261115-import1',
  'catalog-import-ui.js?v=20261115-import1'];
 assert.ok(html.indexOf(order[0])>html.indexOf('fleboreport-forest-modules.css'));
 assert.ok(html.indexOf(order[1])>html.indexOf(order[0]));
 assert.ok(html.indexOf(order[2])>html.indexOf(order[1]));
 for(const file of ['catalog-import-ui.css','catalog-import-core.js','catalog-import-ui.js'])
  assert.ok(worker.includes("'./"+file+"'"),'Falta PWA: '+file);
 assert.match(css,/#view-catalog \.catalog-import-trigger\[hidden\]\{display:none!important;\}/);
 assert.match(css,/\.catalog-import-overlay\[hidden\]\{display:none!important;\}/);
 assert.match(css,/@media screen and \(max-width:760px\)/);
 assert.match(css,/@media print/);
});
