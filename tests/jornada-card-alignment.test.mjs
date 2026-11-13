import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const css=await readFile(new URL('../jornada-premium.css',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const sw=await readFile(new URL('../service-worker.js',import.meta.url),'utf8');
const js=await readFile(new URL('../jornada-premium.js',import.meta.url),'utf8');
const align=css.slice(css.indexOf('/* v295 · Corrección geométrica de Jornada.'));
test('KPI: 4 cuadros iguales y contenido centrado vertical y horizontalmente',()=>{
 assert.ok(align.length>1000,'falta el bloque de alineación');
 assert.match(align,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
 assert.match(align,/grid-template-rows:auto auto!important;place-content:center!important/);
 assert.match(align,/justify-items:center!important;align-items:center!important/);
 assert.match(align,/justify-self:center!important/);
 assert.match(align,/text-align:center!important/);
 assert.match(align,/padding-block:11px!important;padding-inline:4px!important/);
 assert.match(align,/font-variant-numeric:tabular-nums!important/);
});
test('Todas las tarjetas de Jornada tienen ancho uniforme sin desplazarse lateralmente',()=>{
 assert.match(align,/:is\(\.jp-heading,\.journey-kpis,\.jp-active-card,\.jp-actions,\.journey-report-footer,\.journey-layout,\.jp-tools\)/);
 assert.match(align,/margin-left:0!important;margin-right:0!important/);
 assert.match(align,/margin-inline:0!important;box-sizing:border-box!important/);
 assert.match(align,/align-items:stretch!important/);
 assert.match(align,/justify-self:stretch!important;align-self:stretch!important/);
 assert.match(align,/@media\(max-width:760px\)/);
 assert.match(align,/@media\(max-width:370px\)/);
});
test('Textos e iconos centrados verticalmente, identidad legible, reportes intactos',()=>{
 assert.match(align,/justify-content:center!important;align-self:stretch!important/);
 assert.match(align,/\.jp-identity-card\{\s*align-items:center!important/);
 assert.match(align,/\.jp-identity-content\{\s*display:flex!important;flex-direction:column!important/);
 assert.match(align,/\.journey-report-button\{\s*align-items:center!important;justify-content:center!important/);
 assert.match(js,/const idField=view\.querySelector/);
 assert.match(js,/identityContent\.appendChild\(idField\)/);
 assert.match(html,/onclick="openJourneyReportSetup\(\)"/);
 assert.match(html,/onclick="registerJourneyPatient\(\)"/);
});
test('v295 activa CSS actualizado sin editar lógica clínica ni impresión',()=>{
 assert.match(html,/jornada-premium\.css\?v=20261112-jornada2" media="screen"/);
 assert.match(sw,/fleboreport-shell-v295/);
 assert.match(sw,/'\.\/jornada-premium.css'/);
 assert.doesNotMatch(align,/@media print/);
});
