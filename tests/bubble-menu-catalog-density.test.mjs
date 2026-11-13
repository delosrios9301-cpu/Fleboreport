import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [html,css,bubble,shell,audit,sw]=await Promise.all([
 read('index.html'),read('bubble-navigation-catalog.css'),
 read('bubble-navigation-catalog.js'),read('fleboreport-v2-shell.js'),
 read('audit-history.js'),read('service-worker.js')
]);
test('Menú mantiene un solo Historial general, dentro del grupo Informes',()=>{
 assert.match(shell,/function addHistoryNavigation\(\)/);
 assert.match(shell,/includes\('informes'\)/);
 assert.match(shell,/querySelectorAll\('#sidebar \[data-nav="audit"\]'\)/);
 assert.match(shell,/existing\.slice\(1\)\.forEach\(duplicate=>duplicate\.remove\(\)\)/);
 assert.match(shell,/list\.appendChild\(original\)/);
 assert.match(shell,/button\.hidden=!\(window\.fleboCan&&window\.fleboCan\('audit','view'\)\)/);
 assert.doesNotMatch(audit,/settingsNav\.parentNode\.insertBefore\(b,settingsNav\)/);
 assert.match(bubble,/history\.slice\(1\)\.forEach\(item=>item\.remove\(\)\)/);
});
test('Burbujas 3D con capas de atmósfera, cápsulas brillantes y selección resaltada',()=>{
 for(const token of [
  "bubble-atmosphere","bubble-atmosphere-orb","radial-gradient",
  "bubble-navigation .nav-list button[data-nav]","0 0 14px 4px #ea71ff",
  "bubble-navigation .drawer-footer","bubble-navigation #fleboGlobalSignOut"
 ])assert.ok((css+bubble).includes(token),'Falta '+token);
 assert.match(css,/\.nav-copy\{\s*z-index:1!important;flex:0 1 auto!important;width:fit-content!important/);
 assert.match(css,/\.nav-icon\{\s*z-index:2!important/);
 assert.match(css,/\.bubble-atmosphere\{[\s\S]*pointer-events:none!important/);
 assert.match(css,/prefers-reduced-motion:no-preference/);
 assert.match(css,/@media screen and \(max-width:760px\)/);
 assert.doesNotThrow(()=>new Function(bubble));
 assert.doesNotThrow(()=>new Function(shell));
 assert.doesNotThrow(()=>new Function(audit));
});
test('Catálogo compacto presenta pruebas pronto y conserva funciones y métricas reales',()=>{
 assert.match(css,/#view-catalog\.fr5-screen \.fr2-catalog-hero\{\s*display:grid!important/);
 assert.match(css,/#view-catalog\.fr5-screen \.fr2-catalog-stats\{/);
 assert.match(css,/min-height:64px!important;height:auto!important/);
 assert.match(css,/#view-catalog\.fr5-screen \.fr2-catalog-list-panel>\.panel-head\{/);
 assert.match(css,/#view-catalog\.fr5-screen \.fr2-catalog-item\{/);
 for(const id of ["catalogSearch","catalogList","catalogMetricTotal","catalogMetricPending","catalogMetricVessels","catalogArchivedPanel"]){
   assert.ok(html.includes('id="'+id+'"'),'Falta '+id);
 }
 assert.match(html,/function renderCatalog\(\)/);
 assert.match(html,/function startNewCatalogTest\(\)/);
});
test('Permisos, cierre de sesión y caché PWA permanecen vigentes',()=>{
 assert.match(css,/button\[data-nav\]\[hidden\]/);
 assert.match(css,/button\[data-nav\]\[disabled\]/);
 assert.match(bubble,/frNotifBell/);
 assert.match(bubble,/history\.slice\(1\)/);
 assert.match(html,/bubble-navigation-catalog\.css\?v=20261113-bubble2/);
 assert.match(html,/bubble-navigation-catalog\.js\?v=20261113-bubble2/);
 assert.match(html,/audit-history\.js\?v=20261113-one-history/);
 assert.match(html,/fleboreport-v2-shell\.js\?v=20261113-bubble2/);
 assert.match(sw,/fleboreport-shell-v321/);
 for(const file of ["'./bubble-navigation-catalog.js'","'./audit-history.js'","'./fleboreport-v2-shell.js'"])
  assert.ok(sw.includes(file),file);
});
