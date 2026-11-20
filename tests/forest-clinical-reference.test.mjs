import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [forest,dashboard,modules,searchCss,searchJs,html,sw,manifest,homeJs,settingsJs,homeCss]=await Promise.all([
  read('fleboreport-forest-clinical.css'),read('fleboreport-forest-dashboard.css'),
  read('fleboreport-forest-modules.css'),read('fleboreport-forest-search.css'),
  read('fleboreport-forest-search.js'),read('index.html'),read('service-worker.js'),
  read('manifest.webmanifest'),read('inicio-premium.js'),
  read('settings-reference-panels.js'),read('inicio-premium.css')
]);
const style=forest+'\n'+dashboard+'\n'+modules+'\n'+searchCss;
const strip=s=>s.replace(/\/\*[\s\S]*?\*\//g,'');
const luminance=h=>{
 const values=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
 const [r,g,b]=values.map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
 return .2126*r+.7152*g+.0722*b;
};
const contrast=(a,b)=>{
 const x=luminance(a),y=luminance(b);
 return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
};

test('La referencia verde y marfil mantiene un contraste legible AA',()=>{
 for(const [ink,surface] of [
   ['#182A21','#F7F6F1'],['#182A21','#FFFFFF'],
   ['#4D6257','#FFFFFF'],['#FFFFFF','#236648'],
   ['#FFFFFF','#113E2F'],['#F7FCF8','#0D382B'],
   ['#163A29','#BDE4BA']
 ])assert.ok(contrast(ink,surface)>=4.5,ink+' frente a '+surface);
 for(const color of ['#123D30','#236648','#F7F6F1','#FFFEFC','#E5F3E4'])
  assert.ok(forest.includes(color),color);
 assert.equal(JSON.parse(manifest).theme_color,'#123D30');
 assert.equal(JSON.parse(manifest).background_color,'#F7F6F1');
 assert.equal(JSON.parse(manifest).orientation,'any');
 assert.match(html,/<meta name="theme-color" content="#123D30">/);
});

test('El menú del bosque mantiene navegación real, permisos y estados visibles',()=>{
 for(const key of ['#sidebar.bubble-navigation','.drawer-brand-mark','.nav-icon','.nav-copy',
  '.nav-group>summary','.nav-list button[data-nav].active','#fleboGlobalSignOut'])
  assert.ok(forest.includes(key),key);
 assert.match(forest,/\.nav-list button\[data-nav\]:not\(\[hidden\]\):not\(\[disabled\]\):not\(\[aria-hidden="true"\]\)/);
 for(const sel of ['[hidden]','[disabled]','[aria-hidden="true"]'])
  assert.ok(forest.includes('button[data-nav]'+sel),'No ocultar el módulo con '+sel);
 assert.match(forest,/\.nav-group:not\(\[open\]\)>\.nav-group-items/);
 assert.doesNotMatch(forest,/\bonclick\s*=|addEventListener\(|\bfleboCan\s*\(/);
});

test('Inicio adopta el título de referencia y reutiliza todas las métricas reales',()=>{
 assert.match(homeJs,/Panel principal<\/h1>/);
 assert.match(homeJs,/Resumen operativo de domicilios, estudios y procesamiento/);
 assert.match(homeJs,/const stage=\$\('\.vc-kpi-stage',root\)/);
 assert.match(homeJs,/const launch=\$\('\.cm-launchpad',root\)/);
 assert.match(homeJs,/flow\.append\(heading,stage\)/);
 assert.match(homeJs,/area\('clinical-trace'\)/);
 assert.match(homeJs,/area\('operation-alerts'\)/);
 assert.match(homeJs,/area\('recent-journeys'\)/);
 assert.match(dashboard,/\.hp-dashboard-flow>\.hp-alerts-group/);
 assert.match(dashboard,/grid-template-columns:repeat\(12,minmax\(0,1fr\)\)!important/);
 assert.match(dashboard,/#operationalKpis\s*\{[^{}]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
 assert.match(dashboard,/\.hp-dashboard-flow>\.cm-launchpad/);
 assert.match(dashboard,/\.hp-dashboard-flow>\.hp-final-group/);
 assert.match(homeCss,/Siete indicadores operativos|siete métricas reales|siete/iu);
 assert.doesNotMatch(dashboard,/\b(?:284|36|28|12)\s*<\/?(?:strong|b|span)/);
});

test('Módulos reales de FleboReport cubiertos por una misma guía visual',()=>{
 for(const token of [
 '#view-patients.pp-premium','#view-domicilios','#view-journey.jp-reference',
 '#view-clinical-studies.crx-ready','#view-clinical-processing.crx-ready',
 '#view-catalog.cpr-premium','#view-reports.rhr-ready','#view-audit.rhr-ready',
 '#view-settings.sr-settings-ready'
 ])assert.ok(modules.includes(token)||forest.includes(token),token);
 for(const component of [
 '.pp-directory-card','.pp-open-patient','.hv-ref-visit','.hv-ref-new',
 '.journey-register-button','.journey-report-button','.crx-processing-card',
 '.crx-study-card','.fr2-catalog-item','.rhr-history-card','.sr-setting-card'
 ])assert.ok(modules.includes(component)||forest.includes(component),component);
 assert.match(forest,/\.sr-title-group h1\s*\{[^{}]*white-space:nowrap!important/);
 assert.match(modules,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
 assert.match(modules,/justify-content:center!important/);
 assert.match(settingsJs,/srSettingsHome/);
});

test('Los estados clínicos no se confunden con botones ni se borran',()=>{
 for(const token of ['.status-success','.status-warning','.status-danger','.status-error'])
  assert.ok(forest.includes(token),token);
 const m=strip(modules);
 assert.doesNotMatch(m,/\.crx-state-pill[^{]*\{[^}]*background:/);
 assert.doesNotMatch(m,/\.hv-ref-state[^{]*\{[^}]*background:/);
 assert.doesNotMatch(m,/\.pp-swipe-delete[^{]*\{[^}]*background:/);
 assert.doesNotMatch(m,/\s\.hv-archive-action\s*\{[^}]*background:/);
});

test('Búsqueda del encabezado funciona usando filtros autorizados existentes',()=>{
 assert.match(searchJs,/!canVisit\(target\)/);
 assert.match(searchJs,/!btn\.hidden && !btn\.disabled/);
 assert.match(searchJs,/window\.navigate\(target\)/);
 assert.match(searchJs,/dispatchEvent\(new Event\('input',\{bubbles:true\}\)\)/);
 assert.match(searchJs,/patients:\{search:'patientSearch'/);
 assert.match(searchJs,/domicilios:\{search:'hvSearch'/);
 assert.match(searchJs,/'clinical-processing':\{search:'clinicalQueueSearch'/);
 assert.match(searchJs,/catalog:\{search:'catalogSearch'/);
 assert.match(html,/id="patientSearch"/);
 assert.match(html,/id="clinicalQueueSearch"/);
 assert.match(html,/id="catalogSearch"/);
 assert.doesNotMatch(searchJs,/fetch\(|localStorage|indexedDB|service_role|anon_key/);
});

test('Temas y nueva búsqueda se cargan después de las capas heredadas y offline',()=>{
 const ordered=['fleboreport-graphite-petrol-contrast.css','fleboreport-forest-clinical.css',
  'fleboreport-forest-dashboard.css','fleboreport-forest-modules.css','fleboreport-forest-search.css'];
 let prev=0;
 for(const asset of ordered){
  const next=html.indexOf(asset+(asset==='fleboreport-forest-dashboard.css'?'?v=20261119-homegap2':'?v=20261114-'),prev);
  assert.ok(next>prev,'Orden de CSS '+asset);
  prev=next;
 }
 assert.ok(html.indexOf('fleboreport-forest-search.js?v=20261114-forest1')>prev);
 for(const filename of ordered.slice(1).concat('fleboreport-forest-search.js'))
  assert.ok(sw.includes("'./"+filename+"'"),filename+' debe estar en caché');
 assert.match(sw,/CACHE_NAME='fleboreport-shell-v322'/);
});

test('Tablet y teléfono tienen breakpoints separados sin afectar reportes impresos',()=>{
 for(const query of ['@media screen and (min-width:1280px)',
   '@media screen and (min-width:761px) and (max-width:1279px)',
   '@media screen and (max-width:760px)'])
  assert.ok(dashboard.includes(query),query);
 assert.match(searchCss,/@media screen and \(min-width:1180px\)/);
 assert.match(searchCss,/@media screen and \(max-width:1179px\)/);
 assert.doesNotMatch(strip(forest+dashboard+modules),/@media print/);
 assert.doesNotMatch(strip(modules),/display:none!important/);
});

test('CSS y JS bien delimitados sin errores estructurales obvios',()=>{
 for(const file of [forest,dashboard,modules,searchCss]){
  let depth=0,quote=null,comment=false;
  for(let i=0;i<file.length;i++){
   const c=file[i],n=file[i+1];
   if(comment){if(c==='*'&&n==='/'){comment=false;i++}continue}
   if(quote){if(c===quote&&file[i-1]!=='\\')quote=null;continue}
   if(c==='/'&&n==='*'){comment=true;i++;continue}
   if(c==='"'||c==="'"){quote=c;continue}
   if(c==='{')depth++;if(c==='}')depth--;
   assert.ok(depth>=0,'Unmatched }');
  }
  assert.equal(depth,0,'Unclosed CSS block');
 }
});
