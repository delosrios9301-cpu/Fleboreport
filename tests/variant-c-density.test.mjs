import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const css=await readFile(new URL('../variant-c-density.css',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const sw=await readFile(new URL('../service-worker.js',import.meta.url),'utf8');
const old=await readFile(new URL('../variant-c-compact.css',import.meta.url),'utf8');
const checks=['#view-home','#view-journey','#view-patients','#view-domicilios','#view-catalog','#view-companies','#view-reports','#view-settings','#view-clinical-studies','#view-clinical-processing','#view-audit'];
test('la densidad compacta cubre Inicio y cada módulo sin cambiar navegación ni permisos',()=>{
 for(const id of checks)assert.ok(css.includes(id),id+' carece de estilos de densidad');
 assert.match(css,/\.journey-patient-card/);
 assert.match(css,/\.hv-visit/);
 assert.match(css,/\.clinical-row/);
 assert.match(css,/\.fr-config-card/);
 assert.match(css,/\.audit-filters/);
});
test('indicadores grandes y accesos compactos mantienen sus valores y textos',()=>{
 assert.match(css,/#view-home #operationalKpis>\.op-kpi/);
 assert.match(css,/min-height:84px!important;max-height:92px!important/);
 assert.match(css,/#view-home \.vc-shortcut/);
 assert.match(css,/min-height:86px!important/);
 assert.match(old,/\.op-kpi-trend/);
});
test('campos clínicos y acciones siguen siendo pulsables >=44px y reporte intacto',()=>{
 assert.match(css,/min-height:44px!important/);
 assert.match(css,/min-height:48px!important/);
 assert.match(html,/variant-c-density\.css\?v=20261112-density1" media="screen"/);
 assert.doesNotMatch(css,/#reportPaper[^\\n]*display:none/);
 assert.doesNotMatch(css,/\.report-paper table[^\\n]*padding:/);
});
test('la capa se publica después de Variante C y se precachea bajo versión nueva',()=>{
 assert.match(html,/variant-c-density\.css\?v=20261112-density1/);
 assert.ok(html.lastIndexOf('variant-c-density.css')>html.lastIndexOf('variant-c-compact.css'));
 assert.match(sw,/fleboreport-shell-v293/);
 assert.match(sw,/'\.\/variant-c-density.css'/);
});
