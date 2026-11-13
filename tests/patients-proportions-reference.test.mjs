import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [css,html,sw,ui,model]=await Promise.all([
 read('patients-exact-proportions.css'),read('index.html'),
 read('service-worker.js'),read('patients-activity-ui.js'),read('patients-activity-model.js')
]);
test('Indicadores de pacientes de referencia tienen cuatro tarjetas horizontales de 67–76px y dos columnas móviles',()=>{
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
 assert.match(css,/height:clamp\(67px,16vw,76px\)!important/);
 assert.match(css,/min-height:0!important;max-height:none!important/);
 assert.match(css,/\.pp-home-kpis>\.stat-card/);
 assert.match(css,/\.stat-icon/);
 assert.match(css,/\.stat-card strong/);
 assert.match(css,/\.stat-card small/);
 assert.match(css,/@media screen and \(max-width:390px\)/);
});
test('Tarjetas del listado son horizontales, compactas y respetan nombres largos',()=>{
 assert.match(css,/grid-template-columns:43px minmax\(0,1fr\) 54px 105px!important/);
 assert.match(css,/min-height:71px!important/);
 assert.match(css,/max-height:none!important/);
 assert.match(css,/\.pp-directory-info strong/);
 assert.match(css,/-webkit-line-clamp:2!important/);
 assert.match(css,/\.pp-patient-visits/);
 assert.match(css,/\.pp-directory-card button\.pp-open-patient/);
 assert.match(css,/@media screen and \(max-width:390px\)/);
});
test('Buscador, chips y filtros comparten una distribución compacta sin perder filtrado por fecha',()=>{
 assert.match(ui,/const filters=mk\('div','pp-filter-row'\)/);
 assert.match(ui,/filters\.append\(chips\)/);
 assert.match(ui,/filters\.append\(dateDetails\)/);
 assert.match(ui,/summary\.setAttribute\('aria-label','Filtrar atenciones por fecha'\)/);
 assert.match(css,/\.pp-filter-row>\.pp-date-filter:not\(\[open\]\)>\.field/);
 assert.match(css,/\.pp-search-panel #patientSearch/);
 assert.match(css,/height:39px!important/);
 assert.match(css,/\.pp-filter-row \.pp-chip/);
 assert.match(css,/height:29px!important/);
 assert.match(ui,/openPatientRecord\?\.\(person\.id\)/);
 assert.match(ui,/const date=String\(\$\('patientDateFilter'\)/);
});
test('Los estilos nuevos solo cambian la pantalla principal, sin editar expedientes ni métricas',()=>{
 assert.match(css,/#patientsHome\.pp-strict-layout/);
 assert.doesNotMatch(css,/#patientWorkspace|#patient-tab-/);
 assert.match(ui,/FleboPatientActivity\?\.build\?\./);
 assert.match(model,/statusTaken/);
 assert.doesNotMatch(css,/display:none!important.*pp-directory-card/);
 assert.doesNotThrow(()=>new Function(ui));
});
test('Pantallas grandes mantienen altura controlada y no muestran KPI enormes',()=>{
 assert.match(css,/@media screen and \(min-width:761px\)/);
 assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
 assert.match(css,/height:77px!important/);
 assert.match(css,/max-width:1040px!important/);
});
test('PWA v322 incluye la hoja final con consulta de caché única',()=>{
 assert.match(html,/patients-exact-proportions\.css\?v=20261113-patient5/);
 assert.match(html,/patients-activity-ui\.js\?v=20261113-patient5/);
 assert.match(sw,/fleboreport-shell-v322/);
 assert.match(sw,/'\.\/patients-exact-proportions\.css'/);
});
