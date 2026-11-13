import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const css=await readFile(new URL('../jornada-premium.css',import.meta.url),'utf8');
const js=await readFile(new URL('../jornada-premium.js',import.meta.url),'utf8');
const sw=await readFile(new URL('../service-worker.js',import.meta.url),'utf8');
test('Jornada reconstruye la composición como la imagen original con encabezado y cuatro KPIs reales',()=>{
 assert.match(js,/jp-heading/);
 assert.match(js,/Registro y toma de pruebas/);
 assert.match(css,/\.jp-heading-dots/);
 for(const id of ['journeyKpiPatients','journeyKpiTests','journeyKpiCompleted','journeyKpiInProgress']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(css,/\.journey-kpi:nth-child\(4\)/);
 assert.match(css,/\.journey-kpi::after/);
 assert.match(html,/const inProgress=patients\.filter/);
 assert.match(html,/journeyKpiInProgress:inProgress/);
});
test('Jornada activa, búsqueda, identificación, pruebas, pacientes y reporte aparecen en el orden pedido',()=>{
 for(const word of ['Jornada activa','Buscar paciente','Pruebas seleccionadas','Pacientes en toma','Cédula / identificación']){
  assert.ok(js.includes(word)||html.includes(word),word);
 }
 assert.match(js,/active\.insertAdjacentElement\('afterend',actions\)/);
 assert.match(js,/actions\.insertAdjacentElement\('afterend',report\)/);
 assert.doesNotMatch(js,/identityContent\.appendChild\(idField\)/);
 assert.match(js,/layout\.insertAdjacentElement\('afterend',details\)/);
 assert.match(css,/#journeyPatientId/);
 assert.match(css,/\.journey-report-button/);
});
test('Conserva todos los campos y botones originales; no duplica datos',()=>{
 for(const id of ['journeyPatientName','journeyPatientId','journeyPatientTestSearch','journeySelectedTestChips','journeyPatients','journeyTests','journeyReportSetup']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(html,/onclick="registerJourneyPatient\(\)"/);
 assert.match(html,/onclick="openJourneyReportSetup\(\)"/);
 assert.match(html,/function completeJourneyAfterExport\(\)/);
 assert.match(html,/function newJourney\(\)/);
 assert.match(js,/details\.appendChild\(oldHeading\)/);
 assert.match(js,/input\.setAttribute\('aria-label','Cédula o identificación del paciente'\)/);
 assert.doesNotMatch(js,/\blocalStorage\b|\bsessionStorage\b|\bfetch\(|\.insert\(|\.upsert\(|\bsave\(/i);
 assert.doesNotThrow(()=>new Function(js));
});
test('Formularios y pacientes siguen accesibles al pulsar tarjetas, sin ocultar datos permanentemente',()=>{
 assert.match(js,/view\.classList\.add\('jp-workspace-open'\)/);
 assert.match(css,/\.jp-workspace-open>\.journey-layout/);
 assert.match(js,/openWorkspace\('tests'\)/);
 assert.match(js,/openWorkspace\('patients'\)/);
 assert.match(html,/class="panel form-panel journey-entry-panel"/);
 assert.match(html,/class="panel journey-list-panel"/);
 assert.match(css,/\.jp-collapse-workspace/);
 assert.match(js,/byId\('journeySelectedTestChips'\)/);
});
test('Encabezado fijo, estilo responsive y PWA v295',()=>{
 assert.match(css,/jp-journey-active #cmContextBar/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/@media\(max-width:370px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(html,/jornada-premium\.css\?v=20261112-jornada3" media="screen"/);
 assert.match(html,/jornada-premium\.js\?v=20261112-jornada2/);
 assert.match(sw,/fleboreport-shell-v296/);
 assert.match(sw,/'\.\/jornada-premium.css'/);
 assert.match(sw,/'\.\/jornada-premium.js'/);
});

test('Jornada KPI centrado horizontal y vertical, iconos y cifras sin desplazamiento',()=>{
 const grid=css.match(/#view-journey\.jp-reference>\.journey-kpis\s*\{([\s\S]*?)\}/)?.[1]||'';
 const card=css.match(/#view-journey\.jp-reference>\.journey-kpis \.journey-kpi\s*\{([\s\S]*?)\}/)?.[1]||'';
 const copy=css.match(/#view-journey\.jp-reference>\.journey-kpis \.journey-kpi-copy\s*\{([\s\S]*?)\}/)?.[1]||'';
 assert.match(grid,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
 assert.match(grid,/grid-auto-rows:1fr!important/);
 assert.match(grid,/box-sizing:border-box!important/);
 assert.match(card,/display:grid!important/);
 assert.match(card,/place-content:center!important;place-items:center!important/);
 assert.match(card,/justify-self:stretch!important/);
 assert.match(card,/width:100%!important;max-width:100%!important/);
 assert.match(copy,/align-self:center!important;justify-self:stretch!important/);
});
test('Tarjetas operativas y de identificación centradas verticalmente y sin corrimiento lateral',()=>{
 const tokens=[
  'box-sizing:border-box!important;align-self:stretch!important',
  'margin-block:auto!important',
  'width:100%!important;max-width:100%!important;min-width:0!important',
  'margin:4px 0 10px!important',
  'margin:2px 0 13px!important'
 ];
 for(const token of tokens)assert.ok(css.includes(token),token);
 assert.match(css,/min-height:106px!important;cursor:default!important;\s*align-items:center!important/);
 assert.match(html,/jornada-premium\.css\?v=20261112-jornada3" media="screen"/);
 assert.match(sw,/fleboreport-shell-v296/);
});
