import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const load=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [html,js,css,sw,audit]=await Promise.all([
 load('index.html'),load('reports-history-reference.js'),
 load('reports-history-reference.css'),load('service-worker.js'),
 load('audit-history.js')
]);
test('Reportes reproduce indicadores y acciones de referencia con valores de archivos reales',()=>{
 for(const p of ['Reportes totales','Este mes','Pacientes incluidos','Tipos de reportes',
  'Generar reporte','PNG','PDF','Reporte clínico','Por paciente','Por período','Historial de reportes']){
  assert.ok(js.includes(p),p);
 }
 assert.match(js,/const records=archived\(\)/);
 assert.match(js,/state\(\)\.reportHistory/);
 assert.match(js,/records\.filter\(r=>/);
 assert.match(js,/const included=records\.reduce/);
 assert.match(js,/records\.length\?1:0/);
 assert.match(js,/source\.click\(\)/);
 assert.match(js,/openArchivedReport\(id\)/);
 assert.match(js,/downloadArchivedReport\(format\)/);
 assert.match(js,/preview\.open=true/);
 for(const fn of ['generateReportPDF()','downloadPNG()','reportCard','reportPaper'])
  assert.ok(html.includes(fn),fn);
});
test('Historial usa la búsqueda y la tabla de auditoría originales, con filtros en cápsulas',()=>{
 for(const id of ['auditQuery','auditModule','auditGeneralRows','auditGeneralModal'])
  assert.ok(audit.includes(id),'Debe conservar '+id);
 assert.match(js,/const view=\$\('view-audit'\)/);
 assert.match(js,/rootPanel\?\.querySelector\('\.audit-table-wrap'\)/);
 assert.match(js,/queryField=\$\('auditQuery'\)\?\.closest\('\.field'\)/);
 assert.match(js,/window\.FleboAuditHistory\?\.apply\?\.\(\)/);
 assert.match(js,/row\.click\(\)/);
 assert.match(js,/new MutationObserver\(renderAuditCards\)/);
 assert.match(js,/auditAll/);
 assert.match(js,/advanced\.append\(filters\)/);
 assert.match(js,/rhr-archive-disclosure/);
 assert.match(js,/has\('audit','view'\)/);
});
test('Diseño fiel a imágenes, responsive y sin alterar impresión original',()=>{
 for(const p of ['.rhr-kpis','.rhr-banner','.rhr-report-tiles',
 '.rhr-archive-card','.rhr-history-search','.rhr-history-chips',
 '.rhr-history-card','.rhr-history-status','#rhrReportPreview'])
   assert.ok(css.includes(p),'Falta '+p);
 assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(css,/@media screen and \(max-width:760px\)/);
 assert.match(css,/@media print/);
 assert.match(css,/#rhrReportPreview>\.report-card/);
 assert.match(css,/#view-audit\.rhr-ready \.audit-table-wrap\{display:block!important\}/);
 assert.match(js,/window\.addEventListener\('beforeprint'/);
 assert.doesNotThrow(()=>new Function(js));
});
test('PWA precachea ambos nuevos archivos sin borrar archivos de los módulos anteriores',()=>{
 assert.match(html,/reports-history-reference\.css\?v=20261113-reports1/);
 assert.match(html,/reports-history-reference\.js\?v=20261113-reports1/);
 assert.match(sw,/fleboreport-shell-v319/);
 for(const p of ["'./reports-history-reference.js'","'./reports-history-reference.css'",
 "'./clinical-reference-panels.js'","'./settings-reference-panels.js'",
 "'./audit-history.js'","'./inicio-premium.js'"])
  assert.ok(sw.includes(p),'Archivo no precargado '+p);
});
