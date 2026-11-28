import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const get=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [css,html,sw,visits,journey,reference,swipe,previous]=await Promise.all([
 get('fleboreport-home-visit-wide-journey-legible.css'),
 get('index.html'),get('service-worker.js'),get('domicilios.js'),
 get('jornada-premium.css'),get('domicilios-reference.css'),
 get('domicilios-archive-swipe.css'),get('fleboreport-desktop-screenshot-repair.css')
]);
const active=css.replace(/\/\*[\s\S]*?\*\//g,'');
function light(hex){
 const a=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 return a[0]*.2126+a[1]*.7152+a[2]*.0722;
}
function ratio(a,b){const x=light(a),y=light(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}

test('Fichas Domicilios nuevas y archivables utilizan el mismo ancho real en PC',()=>{
 assert.match(visits,/const canDate=canEditVisit\(v\),canOpen=canOpenVisitEditor\(v\),canDelete=canArchiveVisit\(v\)/);
 assert.match(visits,/if\(!canDate&&!canOpen&&!canDelete\)return card/);
 assert.match(visits,/canDelete\?'<button type="button" class="hv-archive-action"/);
 assert.match(visits,/canArchiveVisit\(v\)\?'<button type="button" class="hv-ref-manage-archive"/);
 assert.match(visits,/return '<div class="hv-swipe-row hv-touch-swipe"/);
 assert.match(visits,/class="hv-premium-visit hv-ref-visit"/);
 assert.match(css,/grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,570px\),1fr\)\)!important/);
 assert.match(css,/>.hv-ref-visit\s*\{[^}]*max-width:980px!important/s);
 assert.match(css,/>.hv-swipe-row\s*\{[^}]*max-width:980px!important/s);
 assert.match(css,/justify-content:center!important;justify-items:center!important/);
 assert.ok(previous.includes('max-width:380px!important'),'Regresión histórica identificada');
});

test('Tarjetas de PC son cintas horizontales, información y acciones distribuidas',()=>{
 assert.match(css,/grid-template-areas:"identity actions" "details actions" "priority actions"!important/);
 for(const [selector,area] of [['.hv-ref-top','identity'],['.hv-ref-meta','details'],
    ['.hv-ref-priority','priority'],['.hv-ref-actions','actions']]){
  const escaped=selector.replaceAll('.','\\.');
  assert.match(css,new RegExp(escaped+'\\s*\\{[^}]*grid-area:'+area+'!important','s'));
 }
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)!important/);
 assert.match(css,/\.hv-ref-meta \.hv-ref-location\s*\{[^}]*white-space:normal!important/s);
 assert.match(css,/>button\.hv-archive-action:not\(\[hidden\]\):not\(\[aria-hidden="true"\]\)/);
 assert.match(css,/\.hv-swipe-row:has\(>\.hv-archive-action\)/);
 assert.match(css,/margin:0 14px 12px!important/);
});

test('Crear Domicilio se expande en PC con dos columnas, sin mostrar panel oculto',()=>{
 assert.match(visits,/id="hvCreatePanel"/);
 assert.match(visits,/class="fields"/);
 assert.match(css,/#hvWorkspace>#hvCreatePanel:not\(\[hidden\]\)/);
 assert.match(css,/max-width:1440px!important/);
 assert.match(css,/#hvWorkspace>#hvCreatePanel:not\(\[hidden\]\)>.fields\s*\{[^}]*repeat\(2,minmax\(0,1fr\)\)!important/s);
 assert.doesNotMatch(active,/#hvWorkspace>#hvCreatePanel\[hidden\][^{]*\{[^}]*display:block/);
});

test('Tablet y teléfono conservan el gesto táctil y no muestran Eliminar sin autorización',()=>{
 assert.match(swipe,/@media screen and \(pointer:coarse\)/);
 assert.match(swipe,/\.hv-swipe-row\.is-open>\.hv-swipe-content/);
 assert.match(css,/@media screen and \(min-width:761px\) and \(pointer:coarse\)/);
 assert.match(css,/@media screen and \(min-width:761px\) and \(max-width:1279px\)/);
 assert.match(css,/>button\.hv-archive-action\s*\{[^}]*visibility:hidden!important;opacity:0!important/s);
 assert.match(visits,/function canArchiveVisit\(v\)/);
 assert.match(visits,/cloud\.role==='admin'/);
 assert.match(visits,/window\.fleboCan\('domicilios','delete'\)/);
 assert.doesNotMatch(css,/@media screen and \(max-width:760px\)[^{]*\{[^}]*#view-domicilios/s);
});

test('Cuatro indicadores de Jornada cambian de blanco sobre brillante a texto oscuro',()=>{
 assert.match(journey,/\.journey-kpi-copy strong\s*\{[^}]*color:#fff!important/s);
 assert.match(journey,/\.journey-kpi-copy small\s*\{[^}]*color:#fff!important/s);
 assert.match(css,/#view-journey\.jp-reference>\.journey-kpis \.journey-kpi-copy strong\s*\{[^}]*color:#16291D!important/s);
 assert.match(css,/#view-journey\.jp-reference>\.journey-kpis \.journey-kpi-copy small\s*\{[^}]*color:#284836!important/s);
 assert.match(css,/\.journey-kpi::after\s*\{[^}]*display:none!important/s);
 assert.match(css,/\.journey-kpi-icon svg\s*\{[^}]*stroke:#236648!important/s);
 for(const [fg,bg] of [['#16291D','#FFFFFF'],['#284836','#FFFFFF'],
 ['#16291D','#F0F7EF'],['#284836','#F9F5E8']]){
  assert.ok(ratio(fg,bg)>=4.5,fg+' sobre '+bg+' no alcanza AA');
 }
});

test('Indicadores de Jornada son legibles en móviles estrechos',()=>{
 assert.match(css,/@media screen and \(max-width:760px\)/);
 assert.match(css,/#view-journey\.jp-reference>\.journey-kpis\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/s);
 assert.match(css,/\.journey-kpi-copy small\s*\{[^}]*font-size:11\.5px!important/s);
 assert.match(reference,/\.hv-ref-actions/);
});

test('CSS final está versionado después del tema bosque, cacheado en la PWA',()=>{
 const old=html.indexOf('fleboreport-forest-search.css?v=20261114-forest1');
 const newest=html.indexOf('fleboreport-home-visit-wide-journey-legible.css?v=20261115-1');
 assert.ok(old>0&&newest>old);
 assert.ok(sw.includes("'./fleboreport-home-visit-wide-journey-legible.css'"));
 assert.match(html,/<link rel="stylesheet" href="\.\/fleboreport-home-visit-wide-journey-legible\.css\?v=20261115-1" media="screen">/);
});

test('Bloques CSS equilibrados y no altera impresión ni lógica clínica',()=>{
 let depth=0,quote=null,comment=false;
 for(let i=0;i<css.length;i++){
  const ch=css[i],next=css[i+1];
  if(comment){if(ch==='*'&&next==='/'){comment=false;i++;}continue}
  if(quote){if(ch===quote&&css[i-1]!=='\\')quote=null;continue}
  if(ch==='/'&&next==='*'){comment=true;i++;continue}
  if(ch==='"'||ch==="'"){quote=ch;continue}
  if(ch==='{')depth++;if(ch==='}')depth--;
  assert.ok(depth>=0,'Cierre sin apertura');
 }
 assert.equal(depth,0);
 assert.doesNotMatch(active,/@media print/);
 assert.doesNotMatch(active,/localStorage|fetch\(|update\s+home_visits|delete\s+from/);
});
