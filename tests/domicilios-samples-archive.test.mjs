import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [app,style,index]=await Promise.all([read('domicilios.js'),read('domicilios-archive-swipe.css'),read('index.html')]);

test('Muestras tomadas: el paciente de la captura dispone de acción para autorizados',()=>{
 assert.match(app,/HV_ARCHIVE_STATES=new Set\(\['Cancelado','Rechazado','No realizado','Paciente ausente','Paciente rechazó la toma','Muestras tomadas','Finalizado'\]\)/);
 assert.match(app,/if\(!canArchiveVisit\(v\)\)return card/);
 assert.match(app,/cloud\.role==='admin'\|\|/);
 assert.match(app,/window\.fleboCan\('domicilios','delete'\)/);
 assert.match(app,/visit\.status==='Muestras tomadas'\|\|visit\.status==='Finalizado'/);
 assert.match(app,/Se conservarán todas las muestras tomadas, las pruebas, los resultados, los documentos y la trazabilidad clínica/);
 assert.match(app,/cloud\.client\.rpc\('archive_home_visit'/);
 assert.doesNotMatch(app,/\.from\('home_visits'\)\.delete\(/);
});
test('Swipe táctil funciona también al iniciarse sobre el botón de seguimiento',()=>{
 assert.match(app,/pointerdown/);
 assert.match(app,/event\.target\.closest\('\.hv-archive-action,input,select,textarea'\)/);
 assert.match(style,/\.hv-swipe-row \.hv-swipe-content :is\(button,\.hv-ref-visit,\.hv-ref-actions\)/);
 assert.match(style,/touch-action:pan-y!important/);
 assert.match(app,/hvIgnoreCardClickUntil=Date\.now\(\)\+350/);
 assert.match(app,/event\.stopImmediatePropagation\(\)/);
 assert.match(index,/domicilios\.js\?v=20261114-archive2/);
 assert.match(index,/domicilios-archive-swipe\.css\?v=20261114-archive2/);
 assert.doesNotThrow(()=>new Function(app));
});