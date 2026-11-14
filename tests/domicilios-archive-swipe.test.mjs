import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [js,css,html,sw]=await Promise.all([
 read('domicilios.js'),read('domicilios-archive-swipe.css'),
 read('index.html'),read('service-worker.js')
]);
test('Solo admin o permiso domicilios.delete ven Eliminar; solo en visitas no realizadas',()=>{
 assert.match(js,/HV_ARCHIVE_STATES=new Set\(\['Cancelado','Rechazado','No realizado','Paciente ausente','Paciente rechazó la toma','Muestras tomadas','Finalizado'\]\)/);
 assert.match(js,/cloud\.role==='admin'\|\|\(typeof window\.fleboCan==='function'&&window\.fleboCan\('domicilios','delete'\)\)/);
 assert.match(js,/if\(!canArchiveVisit\(v\)\)return card/);
 assert.match(js,/data-hv-archive/);
 assert.match(js,/if\(!canArchiveVisit\(visit\)\)/);
 assert.match(js,/cloud\.client\.rpc\('archive_home_visit'/);
 assert.match(js,/window\.confirm\(confirmation\)/);
 assert.match(js,/const hasSamples=visit\.status==='Muestras tomadas'\|\|visit\.status==='Finalizado'/);
 assert.match(js,/Se conservarán todas las muestras tomadas, las pruebas, los resultados, los documentos y la trazabilidad clínica/);
 assert.doesNotMatch(js,/\.from\('home_visits'\)\.delete\(/);
});
test('El gesto táctil revela la acción pero no elimina automáticamente',()=>{
 assert.match(js,/function setupHomeVisitSwipe\(workspace\)/);
 assert.match(js,/workspace\.addEventListener\('pointerdown'/);
 assert.match(js,/event\.target\.closest\('\.hv-archive-action,input,select,textarea'\)/);
 assert.match(js,/workspace\.addEventListener\('pointermove'/);
 assert.match(js,/workspace\.addEventListener\('pointerup'/);
 assert.match(js,/workspace\.addEventListener\('pointercancel'/);
 assert.match(js,/Math\.abs\(dy\)>Math\.abs\(dx\)/);
 assert.match(js,/setHomeVisitSwipe\(g\.row,g\.startedOpen\?dx<42:dx<-43\)/);
 assert.match(css,/@media screen and \(pointer:coarse\)/);
 assert.match(css,/touch-action:pan-y/);
 assert.match(css,/\.hv-swipe-row \.hv-swipe-content :is\(button,\.hv-ref-visit,\.hv-ref-actions\)/);
 assert.match(css,/\.hv-swipe-row\.is-open>\.hv-swipe-content/);
 assert.match(css,/pointer-events:none/);
 assert.match(css,/@media screen and \(prefers-reduced-motion:reduce\)/);
});
test('El escritorio muestra Eliminar mientras móvil/tablet usa swipe',()=>{
 assert.match(css,/display:grid;grid-template-columns:minmax\(0,1fr\) 86px/);
 assert.match(css,/button\.hv-archive-action/);
 assert.match(css,/background:linear-gradient\(145deg,#e5425e,#a91843\)/);
 assert.match(js,/tabindex="'\+\(isTouchSwipeMode\(\)\?'-1':'0'\)/);
 assert.match(js,/aria-label="'\+esc\(accessibility\)/);
});
test('Nube omite archivados; mantiene historiales clínicos',()=>{
 assert.match(js,/\.is\('archived_at',null\)/);
 assert.match(js,/\.eq\('workspace_id',cloud\.workspaceId\)\.in\('id',ids\.slice\(i,i\+200\)\)\.is\('archived_at',null\)/);
 assert.match(js,/archivedAt:row\.archived_at\|\|null/);
 assert.match(js,/visits=visits\.filter\(v=>String\(v\.id\)!==String\(id\)\)/);
 assert.match(js,/saveHomeVisitCache\(\);render\(\);scheduleCloudVisitsRefresh\(\)/);
 assert.match(html,/domicilios\.js\?v=20261114-vol2/);
 assert.match(html,/domicilios-archive-swipe\.css\?v=20261114-archive2/);
 assert.match(sw,/'\.\/domicilios-archive-swipe\.css'/);
 assert.doesNotThrow(()=>new Function(js));
});
