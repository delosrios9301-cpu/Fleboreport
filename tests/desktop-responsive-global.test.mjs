import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const get=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [desktop,html,sw,base,patients,edit]=await Promise.all([
 get('fleboreport-desktop-responsive.css'),
 get('index.html'),
 get('service-worker.js'),
 get('clinical-modern-workspace.css'),
 get('patients-premium-reference.css'),
 get('patients-edit-modal.css')
]);

test('El escritorio comparte un único ancho útil y centra todos sus módulos',()=>{
 assert.match(desktop,/@media screen and \(min-width:761px\)/);
 assert.match(base,/\.main\{\s*margin-left:255px!important;width:calc\(100% - 255px\)!important;/);
 assert.match(desktop,/margin-left:255px!important;/);
 assert.match(desktop,/width:calc\(100% - 255px\)!important;/);
 assert.match(desktop,/\.app-shell \.content\s*\{[\s\S]*?max-width:1560px!important;/);
 assert.match(desktop,/\.content>\.view\.fr5-screen\s*\{[\s\S]*?width:100%!important;/);
 assert.match(desktop,/margin-left:auto!important;\s*margin-right:auto!important;/);
 for(const id of ['view-home','view-journey','view-companies','view-patients',
  'view-catalog','view-reports','view-clinical-studies','view-clinical-processing',
  'view-settings','view-domicilios','view-audit']){
  assert.ok(desktop.includes('#'+id),'Módulo sin cobertura: '+id);
 }
});

test('El expediente nativo abierto se centra independientemente del panel Pacientes',()=>{
 assert.match(patients,/dialog\.pp-expedient-dialog\[open\]\{[\s\S]*?inset:auto!important/);
 assert.match(edit,/dialog\.pp-patient-form-dialog\[open\]\{[\s\S]*?inset:auto!important/);
 assert.match(desktop,/:is\(dialog\.pp-expedient-dialog\[open\],dialog\.pp-patient-form-dialog\[open\]\)\s*\{[\s\S]*?inset:0!important;\s*margin:auto!important;\s*transform:none!important;/);
 assert.match(desktop,/dialog\.pp-expedient-dialog\[open\]\s*\{\s*width:min\(980px,calc\(100vw - 60px\)\)!important;/);
 assert.match(desktop,/dialog\.pp-patient-form-dialog\[open\]\s*\{\s*width:min\(780px,calc\(100vw - 60px\)\)!important;/);
 assert.match(desktop,/#patientWorkspace,\s*dialog\.pp-patient-form-dialog\[open\] #patientFormPanel/);
});

test('Las fichas de pacientes tienen rejilla de PC y no la móvil a partir de 1024px',()=>{
 assert.match(desktop,/@media screen and \(min-width:1024px\)/);
 assert.match(desktop,/#patientsHome\.pp-strict-layout\s*\{[\s\S]*?max-width:1360px!important;/);
 assert.match(desktop,/>\.pp-home-kpis\[data-fr5-area="patient-kpis"\]\s*\{[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important;/);
 assert.match(desktop,/\.pp-directory-card\.pp-integrated-card\.pp-patient-ribbon\s*\{[\s\S]*?grid-template-columns:55px minmax\(0,1fr\) 82px 152px!important;/);
 assert.match(desktop,/#view-domicilios #hvWorkspace/);
 assert.match(desktop,/#view-journey \.journey-layout/);
 assert.match(desktop,/#view-settings \.fr-config-grid/);
});

test('El resto de cuadros flotantes se centra en el viewport sin ocultar sus botones',()=>{
 for(const sel of ['.hv-detail-backdrop','.hv-assignment-overlay','.jp-lookup-overlay',
  '.crx-detail-overlay','#clinicalReviewModal.crx-review-overlay',
  '#crxAdministrationModal.crx-admin-overlay']){
  assert.ok(desktop.includes(sel),'Falta overlay '+sel);
 }
 assert.match(desktop,/position:fixed!important;\s*inset:0!important;\s*align-items:center!important;\s*justify-content:center!important;/);
 assert.match(desktop,/margin-left:auto!important;\s*margin-right:auto!important;/);
 assert.doesNotMatch(desktop,/\.remove\(|\.delete\(|\.hidden\s*=/);
});

test('La corrección excluye teléfono e impresión y preserva la paleta F',()=>{
 assert.match(desktop,/@media screen and \(min-width:761px\)/);
 assert.match(desktop,/@media screen and \(min-width:761px\) and \(max-width:1023px\)/);
 const executableCss=desktop.replace(/\/\*[\s\S]*?\*\//g,'');
 assert.doesNotMatch(executableCss,/@media\s+print|@media\s+screen\s+and\s+\(max-width:760px\)/);
 assert.doesNotMatch(desktop,/#[A-Fa-f0-9]{6}(?![A-Fa-f0-9])/);
 assert.doesNotMatch(desktop,/\b(?:display:none|visibility:hidden|pointer-events:none)\s*!important/);
 const l=html.indexOf('fleboreport-login-layout-fix.css?v=20261114-login1');
 const c=html.indexOf('fleboreport-theme-f-contrast.css?v=20261114-aa1');
 const d=html.indexOf('fleboreport-desktop-responsive.css?v=20261114-desktop1');
 assert.ok(l>0&&c>l&&d>c,'CSS desktop debe cargarse al final');
 assert.match(html,/<link rel="stylesheet" href="\.\/fleboreport-desktop-responsive\.css\?v=20261114-desktop1" media="screen">/);
 assert.ok(sw.includes("'./fleboreport-desktop-responsive.css'"));
});

test('CSS responsive es válido estructuralmente y sólo altera layout en pantalla ancha',()=>{
 let depth=0,quoted=null,comment=false;
 for(let i=0;i<desktop.length;i++){
  const c=desktop[i],n=desktop[i+1];
  if(comment){if(c==='*'&&n==='/'){comment=false;i++}continue}
  if(quoted){if(c===quoted&&desktop[i-1]!=='\\')quoted=null;continue}
  if(c==='/'&&n==='*'){comment=true;i++;continue}
  if(c==='\''||c==='"'){quoted=c;continue}
  if(c==='{')depth++;
  if(c==='}')depth--;
  assert.ok(depth>=0,'cierre sin apertura');
 }
 assert.equal(depth,0,'llaves de CSS sin cerrar');
});
