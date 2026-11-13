import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const file=async name=>readFile(new URL('../'+name,import.meta.url),'utf8');
const [html,css,js,sw,shortcuts]=await Promise.all([
 file('index.html'),file('inicio-premium.css'),file('inicio-premium.js'),
 file('service-worker.js'),file('variant-c-compact.js')
]);
test('Inicio v300 se publica como ultima capa, tambien para PWA sin eliminar modulos',()=>{
 assert.ok(html.includes('inicio-premium.css?v=20261113-inicio3'));
 assert.ok(html.includes('inicio-premium.js?v=20261113-inicio1'));
 assert.ok(html.lastIndexOf('inicio-premium.css')>html.lastIndexOf('jornada-premium.css'));
 assert.ok(html.lastIndexOf('inicio-premium.js')>html.lastIndexOf('variant-c-compact.js'));
 assert.ok(sw.includes('fleboreport-shell-v320'));
 assert.ok(sw.includes("'./inicio-premium.css'"));
 assert.ok(sw.includes("'./inicio-premium.js'"));
});
test('No se modifican las siete metricas y seis indicadores clinicos ni sus IDs',()=>{
 for(const label of ['Pacientes totales','Pacientes atendidos','Empresas registradas','Jornadas registradas','Pruebas realizadas','Ingresos del mes','Atenciones domiciliarias']){
  assert.ok(html.includes(label),'KPI existente '+label);
 }
 for(const label of ['Protocolos activos','Muestras recibidas','En revisión','Pendientes de proceso','Muestras procesadas','Alícuotas procesadas']){
  assert.ok(html.includes(label),'KPI clínico '+label);
 }
 for(const id of ['operationalKpis','dashPatientTrend','dashActiveJourney','dashServiceMix','dashRetention','dashClinicalKpis',
  'dashClinicalStatuses','dashClinicalTypes','dashClinicalStorage','dashClinicalRecent',
  'dashCompanyBars','dashProfessionals','dashTopServices','dashFinance','dashAlerts',
  'dashFunnel','dashMedical','dashRecentJourneys','dashLocations']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.match(html,/function renderOperationalDashboard\(\)/);
 assert.match(html,/function renderClinicalDashboardIndicators\(\)/);
});
test('Se conservan 8 accesos autorizados y barra inferior actual',()=>{
 for(const key of ['journey','patients','domicilios','clinical-studies','clinical-processing','audit','reports','settings']){
  assert.ok(shortcuts.includes(key+':{title:')||shortcuts.includes("'"+key+"':{title:"),key);
 }
 assert.match(shortcuts,/if\(!permitted\(key\)\)return/);
 assert.match(shortcuts,/source\.click\(\)/);
 assert.match(html,/id="view-home"/);
 assert.match(js,/function buildLayout\(\)/);
 assert.match(js,/function setupPager\(\)/);
 assert.match(js,/track\.addEventListener\('keydown'/);
 assert.match(js,/function enhanceCharts\(\)/);
 assert.match(css,/\.hp-columns-chart/);
 assert.match(css,/scroll-snap-type:x mandatory/);
});
test('Presentacion solamente; no toca datos clinicos ni permisos',()=>{
 assert.doesNotThrow(()=>new Function(js));
 assert.doesNotThrow(()=>new Function(shortcuts));
 for(const word of ['localStorage','sessionStorage','supabase','fetch(','registerJourneyPatient','deletePatient','save('])
  assert.ok(!js.includes(word),'Peligro: escritura o modificacion del flujo '+word);
 assert.match(css,/@media screen/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/aria/);
});


test('v302: donas de Inicio más finas sin alterar segmentos, cifras ni leyendas',()=>{
 assert.match(html,/inicio-premium\.css\?v=20261113-inicio3/);
 assert.match(sw,/fleboreport-shell-v320/);
 assert.match(css,/\.hp-donuts-group \.op-donut::after/);
 assert.match(css,/inset:13%!important/);
 assert.ok(!css.includes('inset:33%!important'), 'No volver a estrechar el hueco central');
 assert.ok((100-2*13)>=70,'El hueco circular debe ocupar al menos 70% del diámetro');
 assert.match(css,/width:min\(120px,94%\)!important/);
 assert.match(css,/drop-shadow\(0 3px 5px rgba\(65,38,138,\.12\)\)/);
 assert.match(html,/function dashDonut\(entries,centerLabel\)/);
 assert.match(html,/--donut:conic-gradient/);
 assert.match(html,/class="op-legend"/);
});
