import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [html,js,css,sw,oldStyle]=await Promise.all([
 read('index.html'),read('catalog-premium-reference.js'),
 read('catalog-premium-reference.css'),read('service-worker.js'),
 read('bubble-navigation-catalog.css')
]);
test('Catálogo replica los componentes clave de la referencia con datos reales',()=>{
 assert.match(js,/FLEBOREPORT \/ ESPACIO CLÍNICO/);
 for(const text of ['Nueva prueba','Todas','Activas','Pendientes','Con recipiente','Ver / Editar','Filtros','pruebas en el catálogo']){
  assert.ok(html.includes(text)||js.includes(text),text);
 }
 for(const element of ['catalogSearch','catalogList','catalogMetricTotal',
 'catalogMetricPending','catalogMetricVessels','catalogArchivedPanel',
 'catalogCount']){
  assert.match(html,new RegExp('id="'+element+'"'));
 }
 assert.match(js,/window\.FleboAppState\?\.get\?\.\(\)\?\.catalog/);
 assert.match(js,/recordFor\(row,records\)/);
 assert.match(js,/new MutationObserver\(queued\)/);
 assert.match(js,/native\?\.textContent/);
 assert.doesNotThrow(()=>new Function(js));
});
test('Filtros mantienen el listado original sin sustituir edición, búsqueda o permisos',()=>{
 for(const item of ['all','active','pending','vessel'])assert.ok(js.includes("'"+item+"'"));
 assert.match(js,/filterToggle\.addEventListener\('click'/);
 assert.match(js,/filterToggle\.setAttribute\('aria-expanded'/);
 assert.match(js,/b\.setAttribute\('aria-pressed'/);
 assert.match(js,/row\.hidden=!display/);
 assert.match(js,/action\.textContent='Ver \/ Editar'/);
 assert.match(js,/const raw=b\?\.getAttribute\('onclick'\)\|\|''/);
 assert.doesNotMatch(js,/window\.editTest\s*=|window\.renderCatalog\s*=|\.rpc\(|\.insert\(|\.update\(|\.delete\(/);
 assert.match(html,/function renderCatalog\(\)/);
 assert.match(html,/function editTest\(/);
 assert.match(html,/function startNewCatalogTest\(\)/);
 assert.match(html,/function restoreTest\(/);
});
test('Filtro de pruebas pendientes y con recipiente actúa sobre tarjetas reales sin borrarlas',()=>{
 const start=js.indexOf(' function updateList(){'),end=js.indexOf(' function queued(){',start);
 assert.ok(start>0&&end>start);
 const source=js.slice(start,end);
 const rows=[
  {state:{active:true,pending:false,vessel:true},dataset:{},hidden:false,classList:{contains:v=>v==='fr2-catalog-item'}},
  {state:{active:true,pending:true,vessel:false},dataset:{},hidden:false,classList:{contains:v=>v==='fr2-catalog-item'}},
  {state:{active:true,pending:false,vessel:true},dataset:{},hidden:false,classList:{contains:v=>v==='fr2-catalog-item'}}
 ];
 const total={textContent:'3'},label={textContent:''};
 const list={children:rows,append:()=>{throw Error('No debe añadir estado vacío')}};
 const view={querySelector:s=>({
  '#catalogList':list,'.cpr-count-label':label,'#catalogCount':total
 })[s]||null};
 const ctx={view:()=>view,window:{FleboAppState:{get:()=>({catalog:[]})}},
  recordFor:r=>r.state,
  enhanceRow:(row,state)=>{row.dataset.cprActive=String(state.active);
   row.dataset.cprPending=String(state.pending);row.dataset.cprVessel=String(state.vessel)},
  filter:'pending',Array,String};
 vm.runInNewContext(source,ctx);
 ctx.updateList();
 assert.deepEqual(rows.map(x=>x.hidden),[true,false,true]);
 assert.equal(label.textContent,'3 pruebas en el catálogo');
 ctx.filter='vessel';ctx.updateList();
 assert.deepEqual(rows.map(x=>x.hidden),[false,true,false]);
 ctx.filter='all';ctx.updateList();
 assert.deepEqual(rows.map(x=>x.hidden),[false,false,false]);
});
test('Layout de filas horizontales, indicadores degradados, búsqueda compacta y barra fija',()=>{
 assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/\.fr2-catalog-item\.cpr-row\{/);
 assert.match(css,/grid-template-columns:57px minmax\(0,1fr\) auto/);
 assert.match(css,/\.fr2-catalog-list-panel>\.panel-head\{/);
 assert.match(css,/linear-gradient\(120deg,#4f179c,#6c1eca/);
 assert.match(css,/\.cpr-filter-chips/);
 assert.match(css,/\.cpr-filter-chip\.selected/);
 assert.match(css,/@media screen and \(max-width:610px\)/);
 assert.match(css,/\.fr2-catalog-item\.cpr-row\[hidden\]\{display:none!important\}/);
 assert.match(css,/calc\(116px \+ env\(safe-area-inset-bottom,0px\)\)/);
 assert.match(css,/word-break:normal!important/);
 assert.match(oldStyle,/#sidebar \.nav-list/);
});
test('Publicación PWA v317 incluye la nueva capa premium',()=>{
 assert.match(html,/catalog-premium-reference\.css\?v=20261113-catalog1/);
 assert.match(html,/catalog-premium-reference\.js\?v=20261113-catalog1/);
 assert.match(sw,/fleboreport-shell-v317/);
 assert.match(sw,/'\.\/catalog-premium-reference\.css'/);
 assert.match(sw,/'\.\/catalog-premium-reference\.js'/);
});
