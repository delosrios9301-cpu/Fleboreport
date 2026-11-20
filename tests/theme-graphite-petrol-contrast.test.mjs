import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const get=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [css,index,worker,manifest,previousContrast,settings,swipe]=await Promise.all([
 get('fleboreport-graphite-petrol-contrast.css'),get('index.html'),
 get('service-worker.js'),get('manifest.webmanifest'),
 get('fleboreport-theme-f-contrast.css'),
 get('settings-reference-panels.css'),get('domicilios-archive-swipe.css')
]);
const source=css.replace(/\/\*[\s\S]*?\*\//g,'');
function luminance(hex){
 const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)
   .map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4));
 return .2126*r+.7152*g+.0722*b;
}
function contrast(a,b){
 const x=luminance(a),y=luminance(b);
 return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}

test('Color corporativo: combinaciones reales con contraste mínimo WCAG AA',()=>{
 for(const [fg,bg] of [
  ['#223139','#FFFFFF'],['#4B5E68','#FFFFFF'],
  ['#223139','#F5F7F7'],['#FFFFFF','#355761'],
  ['#FFFFFF','#25363D'],['#EAF0F1','#25363D'],
  ['#51656F','#FFFFFF'],['#FFFFFF','#8B3545'],
  ['#FFFFFF','#3C5A63'],['#355761','#E6EEEF'],
 ]){
  assert.ok(contrast(fg,bg)>=4.5,fg+' sobre '+bg+' contraste '+contrast(fg,bg).toFixed(2));
 }
});

test('Los controles usan texto oscuro sobre superficies claras o blanco sobre acción oscura',()=>{
 assert.match(source,/\.fr5-screen :is\(\.field input,\.field select,\.field textarea/);
 assert.match(source,/color:#223139!important;background:#FFFFFF!important;/);
 assert.match(source,/\.fr5-screen :is\(input,textarea\)::placeholder\s*\{/);
 assert.match(source,/color:#51656F!important;opacity:1!important;/);
 assert.match(source,/background:#355761!important;border-color:#355761!important;\s*color:#FFFFFF!important;/);
 assert.match(source,/background:#EFF4F4!important;color:#223139!important;/);
 assert.match(source,/\.app-shell \.topbar :is\(\.fr2-current-area,\.cm-context-label,\.cm-context-chip,\.today-chip\)/);
 assert.match(source,/background:#E6EEEF!important;color:#223139!important;/);
});

test('Cobertura transversal de módulos, fichas, menús y ventanas flotantes',()=>{
 for(const id of [
  '#view-home','#view-domicilios','#view-patients','#view-journey',
  '#view-clinical-studies','#view-clinical-processing','#view-catalog',
  '#view-settings','#view-reports','#view-audit'
 ])assert.ok(source.includes(id),'Sin cobertura visual '+id);
 for(const key of [
  '#sidebar.bubble-navigation','.nav-copy','.nav-icon',
  '.sr-card-caption small','.sr-setting-card','.sr-detail-tab.is-current',
  '.hv-ref-visit','.hv-module-tab.active','.hv-archive-action',
  '.pp-directory-card','.pp-record-kpi',
  '.crx-study-tab.is-selected','.fr2-catalog-stat','.rhr-kpi',
  '#clinicalReviewModal','#crxAdministrationModal'
 ])assert.ok(source.includes(key),'No se ajustó el contraste '+key);
 assert.match(previousContrast,/#[a-fA-F0-9]{6}/);
 assert.match(settings,/\.sr-card-caption small/);
});

test('Se preservan semáforos de procesamiento, alertas y eliminaciones',()=>{
 assert.doesNotMatch(source,/(?:^|,)\s*\.badge\.(?:danger|warning|error|pending|success)/);
 assert.doesNotMatch(source,/\.(?:clinical-status|hv-status|crx-status)\s*\{/);
 assert.doesNotMatch(source,/\.btn\.danger\s*\{/);
 assert.match(source,/#view-domicilios #hvWorkspace \.hv-archive-action\s*\{[\s\S]*?background:#8B3545!important;color:#FFFFFF!important;/);
 assert.match(swipe,/@media screen and \(pointer:coarse\)/);
});

test('Es puramente cromático y no altera organización, permisos ni responsividad',()=>{
 const forbidden=/(?:^|[;{}])\s*(?:width|height|min-width|min-height|max-width|max-height|padding|margin|gap|display|position|grid-template-columns|flex|transform|transition|animation|touch-action|pointer-events|visibility|overflow|font-size|border-radius|z-index|inset|opacity-except)\s*:/i;
 assert.doesNotMatch(source,forbidden);
 assert.match(source,/@media screen\s*\{/);
 assert.doesNotMatch(source,/@media print/);
 assert.doesNotMatch(source,/\.nav-list button\[data-nav\]\[hidden\]\s*\{/);
 assert.doesNotMatch(source,/\b(?:fetch\(|localStorage\.|\.remove\(|\.delete\()\b/);
});

test('Capa nueva al final de CSS, cacheada y versionada en Windows, PC y PWA',()=>{
 const preceding=index.lastIndexOf('fleboreport-desktop-screenshot-repair.css?v=20261114-repair1');
 const current=index.lastIndexOf('fleboreport-graphite-petrol-contrast.css?v=20261114-graphite1');
 assert.ok(current>preceding&&preceding>0,'La paleta nueva debe ir después de los parches anteriores');
 assert.match(index,/<link rel="stylesheet" href="\.\/fleboreport-graphite-petrol-contrast\.css\?v=20261114-graphite1" media="screen">/);
 assert.ok(worker.includes("'./fleboreport-graphite-petrol-contrast.css'"));
 assert.match(index,/<meta name="theme-color" content="#0C3448">/);
 const pwa=JSON.parse(manifest);
 assert.equal(pwa.theme_color,'#0C3448');
 assert.equal(pwa.background_color,'#FFFFFF');
});

test('La hoja CSS está equilibrada',()=>{
 let depth=0,inComment=false,quote=null;
 for(let i=0;i<css.length;i++){
  const c=css[i],n=css[i+1];
  if(inComment){if(c==='*'&&n==='/'){inComment=false;i++}continue}
  if(quote){if(c===quote&&css[i-1]!=='\\')quote=null;continue}
  if(c==='/'&&n==='*'){inComment=true;i++;continue}
  if(c==='"'||c==="'"){quote=c;continue}
  if(c==='{')depth++;
  if(c==='}')depth--;
  assert.ok(depth>=0,'Bloque cerrado antes de abrirse');
 }
 assert.equal(depth,0,'Bloque CSS incompleto');
});
