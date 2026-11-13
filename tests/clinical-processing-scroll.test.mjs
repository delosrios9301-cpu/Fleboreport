import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [html,ui,css,sw]=await Promise.all([
 read('index.html'),read('clinical-reference-panels.js'),
 read('clinical-reference-panels.css'),read('service-worker.js')
]);
test('Filtros de Estudio, Visita y Tipo desplazables sin duplicar los selectores',()=>{
 assert.match(ui,/const quickbar=node\('div','crx-process-quickstrip'\)/);
 assert.match(ui,/\['clinicalQueueStudy','clinicalQueueVisit','clinicalQueueType'\]/);
 assert.match(ui,/quickbar\.appendChild\(group\)/);
 assert.match(ui,/panel\.insertBefore\(quickbar,sourceTable\)/);
 for(const id of ['clinicalQueueStudy','clinicalQueueVisit','clinicalQueueType','clinicalQueueStatus','clinicalQueueDate'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(css,/\.crx-process-quickstrip/);
 assert.match(css,/overflow-x:auto!important;overflow-y:hidden!important/);
 assert.match(css,/touch-action:auto!important/);
});
test('Procesamiento permite desplazarse verticalmente y desplegar filtros sin recortes',()=>{
 assert.match(css,/\.crx-process-filters\[open\]>\.clinical-filter/);
 assert.match(css,/display:grid!important;position:static!important;top:auto!important;right:auto!important/);
 assert.match(css,/overflow-x:clip!important;overflow-y:visible!important/);
 assert.match(css,/overflow:visible!important/);
 assert.match(ui,/panel\.insertBefore\(toolbar,sourceTable\)/);
 assert.match(ui,/panel\.insertBefore\(quickHeading,sourceTable\)/);
});
test('Tarjetas legibles en móvil, gestos de gestión conservados',()=>{
 assert.match(css,/@media screen and \(max-width:600px\)/);
 assert.match(css,/grid-template-areas:"icon info state" "icon info action"/);
 assert.match(ui,/function makeSwipeCard\(card,sample\)/);
 assert.match(ui,/card\.addEventListener\('touchmove'/);
});
test('Acceso a configuración restringido a admin',()=>{
 assert.match(ui,/configShortcut\.hidden=window\.FleboAuth\?\.membership\?\.role!=='admin'/);
 assert.match(ui,/window\.navigate\('settings','clinical-config'\)/);
 assert.match(ui,/window\.selectClinicalConfig\('studies'\)/);
 assert.doesNotThrow(()=>new Function(ui));
});
test('Cache y enlaces de rediseño actualizados',()=>{
 assert.match(html,/clinical-reference-panels\.js\?v=20261113-clinical5/);
 assert.match(html,/clinical-reference-panels\.css\?v=20261113-clinical4/);
 assert.match(sw,/fleboreport-shell-v312/);
});