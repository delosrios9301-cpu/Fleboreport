import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const load=x=>readFile(new URL('../'+x,import.meta.url),'utf8');
const [html,bubbleCss,bubbleJs,clinical,sw,settings]=await Promise.all([
 load('index.html'),load('bubble-navigation-catalog.css'),
 load('bubble-navigation-catalog.js'),load('clinical-reference-panels.js'),
 load('service-worker.js'),load('settings-reference-panels.js')
]);
test('Menú de burbujas moradas de referencia conserva las rutas reales',()=>{
 assert.match(html,/id="sidebar"/);
 assert.match(html,/class="nav-list"/);
 for(const key of ['catalog','clinical-studies','clinical-processing','reports','settings','domicilios'])
  assert.match(html,new RegExp('data-nav="'+key+'"'));
 assert.match(bubbleCss,/\.nav-list button\[data-nav\]:not\(\[hidden\]\) \.nav-icon/);
 assert.match(bubbleCss,/\.nav-list button\[data-nav\]:not\(\[hidden\]\) \.nav-copy/);
 assert.match(bubbleCss,/\.nav-list button\[data-nav\]\.active:not\(\[hidden\]\)/);
 assert.match(bubbleCss,/color:#fff!important/);
 assert.match(bubbleCss,/radial-gradient/);
 assert.match(bubbleCss,/border-radius:999px!important/);
 assert.match(bubbleCss,/\.nav-group:not\(\[open\]\)>\.nav-group-items\{display:none!important\}/);
 assert.doesNotThrow(()=>new Function(bubbleJs));
});
test('Empresas deja de ser acceso duplicado pero se conservan gestión y datos',()=>{
 assert.doesNotMatch(html,/data-nav="companies"/);
 assert.match(html,/id="view-companies"/);
 assert.match(html,/function renderCompanies\(\)/);
 assert.match(html,/function addCompany\(\)/);
 assert.match(settings,/companies-module/);
 assert.match(settings,/title:'Empresas'/);
});
test('Procesamiento elimina botón Configurar estudios redundante',()=>{
 assert.doesNotMatch(clinical,/const configShortcut/);
 assert.doesNotMatch(clinical,/quickbar\.appendChild\(configShortcut\)/);
 assert.match(html,/id="settings-clinical-config"/);
 assert.match(html,/id="clinicalConfigStudyEditor"/);
});
test('Catálogo mantiene métricas y búsqueda pero mejora orientación móvil y tarjetas',()=>{
 for(const id of ['catalogSearch','catalogList','catalogMetricTotal','catalogMetricPending','catalogMetricVessels','catalogArchivedPanel'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/function renderCatalog\(\)/);
 assert.match(html,/function startNewCatalogTest\(\)/);
 assert.match(html,/function editTest\(/);
 assert.match(bubbleCss,/\.fr2-catalog-stat small/);
 assert.match(bubbleCss,/word-break:normal!important/);
 assert.match(bubbleCss,/#catalogSearch/);
 assert.match(bubbleCss,/min-width:0!important/);
 assert.match(bubbleCss,/\.fr2-catalog-item-copy/);
 assert.match(bubbleCss,/@media screen and \(max-width:550px\)/);
});
test('No habilita módulos restringidos ni altera persistencia de pacientes',()=>{
 assert.match(bubbleCss,/button\[data-nav\]\[hidden\]/);
 assert.match(bubbleCss,/button\[data-nav\]\[disabled\]/);
 assert.match(bubbleCss,/data-flebo-permission-hidden/);
 assert.match(bubbleJs,/frNotifBell/);
 assert.match(bubbleJs,/control\.click\(\)/);
 assert.doesNotMatch(bubbleJs,/localStorage|sessionStorage|\.rpc\(|\.insert\(|\.update\(/);
});
test('Servicio PWA incluye archivos del rediseño y fuerza actualización de caché',()=>{
 assert.match(html,/bubble-navigation-catalog\.css\?v=20261113-bubble2/);
 assert.match(html,/bubble-navigation-catalog\.js\?v=20261113-bubble2/);
 assert.match(html,/clinical-reference-panels\.js\?v=20261113-clinical6/);
 assert.match(sw,/fleboreport-shell-v322/);
 assert.match(sw,/'\.\/bubble-navigation-catalog\.css'/);
 assert.match(sw,/'\.\/bubble-navigation-catalog\.js'/);
});