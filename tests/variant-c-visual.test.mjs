import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const files={
 html:await readFile(new URL('../index.html',import.meta.url),'utf8'),
 css:await readFile(new URL('../variant-c-compact.css',import.meta.url),'utf8'),
 js:await readFile(new URL('../variant-c-compact.js',import.meta.url),'utf8'),
 modern:await readFile(new URL('../clinical-modern-workspace.js',import.meta.url),'utf8'),
 sw:await readFile(new URL('../service-worker.js',import.meta.url),'utf8')
};
test('Variante C es la última capa de presentación de FleboReport',()=>{
 const {html,sw}=files;
 assert.match(html,/variant-c-compact.css\?v=20261112-vc1/);
 assert.match(html,/variant-c-compact.js\?v=20261112-vc1/);
 assert.ok(html.lastIndexOf('variant-c-compact.css')>html.lastIndexOf('clinical-modern-workspace.css'));
 assert.ok(html.lastIndexOf('variant-c-compact.js')>html.lastIndexOf('clinical-modern-workspace.js'));
 assert.match(sw,/fleboreport-shell-v286/);
 assert.match(sw,/'\.\/variant-c-compact.css'/);
 assert.match(sw,/'\.\/variant-c-compact.js'/);
});
test('diseño solicitado: topbar fija, onda premium, KPIs compactos, 2-columnas y dock de cuatro',()=>{
 const {css,modern}=files;
 assert.match(css,/\.app-shell \.topbar::after/);
 assert.match(css,/\.app-shell \.topbar\{[\s\S]*?position:fixed!important/);
 assert.match(css,/#view-home #operationalKpis\{[\s\S]*?overflow-x:auto!important/);
 assert.match(css,/#view-home \.vc-launch-grid\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/#view-home \.vc-shortcut:nth-child\(even\)/);
 assert.match(css,/#cmMobileDock \.cm-dock-button\.is-active/);
 const dock=modern.slice(modern.indexOf('const dockItems'),modern.indexOf('const $'));
 for(const item of ["['home','Inicio']","['journey','Jornada']","['domicilios','Domicilios']","['more','Más']"])assert.ok(dock.includes(item));
 assert.doesNotMatch(dock,/\['patients','Pacientes'\]/);
});
test('accesos rápidos usan la navegación ya autorizada, nunca generan jornadas nuevas',()=>{
 const {js}=files;
 assert.match(js,/for\(const key of \['journey','domicilios','clinical-studies','reports'\]\)/);
 assert.match(js,/if\(!permitted\(key\)\)return/);
 assert.match(js,/source\.click\(\)/);
 assert.match(js,/button\.hidden=!permitted\(button\.dataset\.vcNav\)/);
 assert.doesNotMatch(js,/newJourney\(|supabase|localStorage|sessionStorage|\.insert\(|\.update\(/i);
 assert.doesNotThrow(()=>new Function(js));
});
test('formularios clínicos y papel imprimible no se reescriben',()=>{
 const {css,html}=files;
 assert.match(css,/@media print/);
 assert.match(css,/#view-reports \.report-paper/);
 assert.match(html,/id="journeyPatientTestSearch"/);
 assert.match(html,/id="reportPaper"/);
 assert.match(html,/id="view-settings"/);
});

test('las métricas compactas cubren Jornada, Pacientes, Domicilios, Clínica e Historial',()=>{
 const {css}=files;
 for(const fragment of [
  '#view-journey .journey-kpis','#view-patients .stats-grid',
  '#view-clinical-studies .clinical-kpis','#view-clinical-processing .clinical-kpis',
  '#view-domicilios .hv-kpis','#view-audit .audit-stats']){
  assert.ok(css.includes(fragment),'Falta estilo para '+fragment);
 }
 assert.match(css,/#view-settings \.fr-config-intro/);
 assert.match(css,/#view-domicilios \.hv-status/);
});
