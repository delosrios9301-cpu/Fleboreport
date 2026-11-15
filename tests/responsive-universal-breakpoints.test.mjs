import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
const [css,index,sw,previous,settings,domicilios,journey,patients]=await Promise.all([
 read('fleboreport-responsive-universal.css'),
 read('index.html'),
 read('service-worker.js'),
 read('fleboreport-desktop-settings-center.css'),
 read('settings-reference-panels.css'),
 read('domicilios-reference.css'),
 read('jornada-premium.css'),
 read('patients-premium-reference.css')
]);
const cssSource=css.replace(/\/\*[\s\S]*?\*\//g,'');

test('La adaptación es automática por viewport, sin JS ni dependencia del dispositivo',()=>{
 assert.match(cssSource,/@media screen\s*\{/);
 for(const q of [
  '@media screen and (min-width:761px)',
  '@media screen and (min-width:761px) and (max-width:1199px)',
  '@media screen and (min-width:1200px)',
  '@media screen and (min-width:1450px)',
  '@media screen and (max-width:760px)'
 ])assert.ok(cssSource.includes(q),q);
 assert.doesNotMatch(cssSource,/@media print|@media\s+\(orientation:portrait\)/);
 assert.doesNotMatch(cssSource,/\b(?:navigator|window|localStorage|fetch|document|ResizeObserver)\s*\./);
 assert.match(cssSource,/--fr-responsive-sidebar:255px;/);
 assert.match(cssSource,/--fr-responsive-sidebar:218px;/);
 assert.match(cssSource,/width:calc\(100% - var\(--fr-responsive-sidebar\)\)!important;/);
 assert.match(cssSource,/margin-left:var\(--fr-responsive-sidebar\)!important;/);
});

test('Todo módulo usa el ancho útil con menú descontado una sola vez',()=>{
 for(const id of ['#view-home','#view-journey','#view-patients','#view-domicilios',
  '#view-clinical-studies','#view-clinical-processing','#view-catalog',
  '#view-reports','#view-audit','#view-settings']){
  assert.ok(cssSource.includes(id),id);
 }
 assert.match(cssSource,/--fr-responsive-content-max:1840px;/);
 assert.match(cssSource,/max-width:var\(--fr-responsive-content-max\)!important;/);
 assert.match(cssSource,/min-width:0!important;/);
 assert.match(cssSource,/margin-inline:auto!important;/);
 assert.match(cssSource,/\.app-shell \.content>\.view\.fr5-screen/);
});

test('Domicilios centra fichas incluso si sólo existe un domicilio',()=>{
 assert.match(domicilios,/#hvRows/);
 assert.match(previous,/grid-template-columns:repeat\(auto-fit,minmax\(290px,360px\)\)!important/);
 assert.match(cssSource,/#view-domicilios :is\(#hvRows,#hvHistoryRows\)/);
 assert.match(cssSource,/grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,290px\),360px\)\)!important;/);
 assert.match(cssSource,/justify-content:center!important;/);
 assert.match(cssSource,/#view-domicilios #hvWorkspace\s*\{\s*max-width:1560px!important;/);
});

test('Configuración preserva rutas originales, controles y su distribución en escritorio',()=>{
 assert.match(settings,/\.sr-settings-home/);
 assert.match(cssSource,/#view-settings\.sr-settings-ready \.sr-settings-cards/);
 assert.match(cssSource,/#view-settings\.sr-settings-ready \.fr-config-grid/);
 assert.match(cssSource,/#view-settings\.sr-settings-ready \.sr-settings-home:not\(\[hidden\]\)/);
 assert.match(cssSource,/>\.settings-section:not\(\[hidden\]\)/);
 assert.match(cssSource,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important;/);
 assert.doesNotMatch(cssSource,/#view-settings\.sr-settings-ready\s*\{[^}]*display:block!important/);
});

test('Jornada, dashboard y muestras cambian columnas sin forzar abrir secciones cerradas',()=>{
 assert.match(journey,/#view-journey\.jp-reference\.jp-workspace-open>\.journey-layout/);
 assert.match(cssSource,/#view-journey\.jp-reference\.jp-workspace-open>\.journey-layout/);
 assert.doesNotMatch(cssSource,/#view-journey\.jp-reference>\.journey-layout\s*\{[^}]*display:grid!important/);
 assert.match(cssSource,/#view-home \.op-grid:not\(\.op-grid-wide\)/);
 assert.match(cssSource,/#view-clinical-studies\.crx-ready :is\(\.crx-study-cards,\.crx-review-cards\)/);
 assert.match(cssSource,/#view-clinical-processing\.crx-ready \.crx-process-cards/);
 assert.match(cssSource,/#view-reports\.rhr-ready \.rhr-archive-list/);
 assert.match(cssSource,/#view-audit\.rhr-ready \.rhr-history-list/);
 assert.match(cssSource,/#view-catalog\.cpr-premium \.fr2-catalog-list-panel/);
});

test('Pacientes: Expedientes centrados y rejillas adaptables sin cambiar acciones',()=>{
 assert.match(patients,/dialog\.pp-expedient-dialog\[open\]/);
 assert.match(cssSource,/:is\(dialog\.pp-expedient-dialog\[open\],dialog\.pp-patient-form-dialog\[open\]\)/);
 assert.match(cssSource,/position:fixed!important;inset:0!important;/);
 assert.match(cssSource,/width:min\(1080px,calc\(100vw - 64px\)\)!important;/);
 assert.match(cssSource,/max-height:calc\(100dvh - 36px\)!important;/);
 assert.match(cssSource,/#view-patients\.pp-premium\.pp-integrated #patientsHome\.pp-strict-layout/);
 assert.doesNotMatch(cssSource,/\b(?:addEventListener|onclick|\.remove\(|\.delete\(|\.click\()\b/);
});

test('Teléfono mantiene cajón, gestos y vistas ocultas sin pantallas fantasmas',()=>{
 const begin=cssSource.lastIndexOf('@media screen and (max-width:760px)');
 assert.ok(begin>=0);
 const mobile=cssSource.slice(begin);
 assert.match(mobile,/\.app-shell \.content/);
 assert.match(mobile,/\.content>\.view\.fr5-screen/);
 assert.doesNotMatch(mobile,/\b(?:display|visibility|transform|touch-action|pointer-events|position)\s*:/);
 assert.doesNotMatch(cssSource,/\.nav-list button\[data-nav\]\[hidden\][^{]*\{[^}]*display:flex/);
 assert.doesNotMatch(cssSource,/\.fr5-screen:not\(\.active\)[^{]*\{[^}]*display:/);
 assert.doesNotMatch(cssSource,/\bdisplay:none!important/);
});

test('La última hoja toma prioridad tras todos los temas y está disponible offline',()=>{
 const previousLink='fleboreport-desktop-settings-center.css?v=20261114-slate1';
 const next='fleboreport-responsive-universal.css?v=20261114-layout2';
 assert.ok(index.lastIndexOf(previousLink)>0&&index.lastIndexOf(next)>index.lastIndexOf(previousLink));
 assert.match(index,/<link rel="stylesheet" href="\.\/fleboreport-responsive-universal\.css\?v=20261114-layout2" media="screen">/);
 assert.ok(sw.includes("'./fleboreport-responsive-universal.css'"));
 assert.match(index,/<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">/);
});

test('La nueva hoja CSS no introduce reglas incompletas ni modifica impresión',()=>{
 let depth=0,quote=null,comment=false;
 for(let i=0;i<css.length;i++){
  const ch=css[i],next=css[i+1];
  if(comment){if(ch==='*'&&next==='/'){comment=false;i++;}continue}
  if(quote){if(ch===quote&&css[i-1]!=='\\')quote=null;continue}
  if(ch==='/'&&next==='*'){comment=true;i++;continue}
  if(ch==='"'||ch==="'"){quote=ch;continue}
  if(ch==='{')depth++;
  if(ch==='}')depth--;
  assert.ok(depth>=0,'Cierre sin apertura');
 }
 assert.equal(depth,0,'Faltan llaves de CSS');
 assert.doesNotMatch(cssSource,/@media print/);
 assert.doesNotMatch(cssSource,/--(?:role|permission)|auth\.uid|patient_id|workspace_id/);
});
