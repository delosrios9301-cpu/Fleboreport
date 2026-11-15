import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const read=file=>readFile(new URL('../'+file,import.meta.url),'utf8');
const [dom,css,html,sw]=await Promise.all([
 read('domicilios.js'),read('home-visit-history-recovery.css'),read('index.html'),read('service-worker.js')
]);

test('El estado completado del servidor sigue entrando al Historial normal',()=>{
 assert.match(dom,/'Finalizado':'completed'/);
 assert.match(dom,/const statusFromDb=Object.fromEntries\(Object.entries\(statusToDb\)/);
 assert.match(dom,/const historyStatuses=\['Finalizado','Rechazado','Cancelado','No realizado','Paciente ausente','Paciente rechazó la toma'\]/);
 assert.match(dom,/const historyList=visits\.filter\(v=>historyStatuses\.includes\(v\.status\)&&historyMatches\(v\)\)/);
});

test('Entrar en Historial fuerza instantánea remota aunque la caché sea antigua',()=>{
 assert.match(dom,/async function loadCloudVisits\(options=\{\}\)/);
 assert.match(dom,/const forceFull=options\.forceFull===true/);
 assert.match(dom,/if\(forceFull\)\{homeVisitSyncCursor=null;homeVisitCacheActive=false;\}/);
 assert.match(dom,/if\(homeVisitSyncCursor===null&&!forceFull\)restoreHomeVisitCache\(\)/);
 assert.match(dom,/await loadCloudVisits\(\{forceFull:true\}\)/);
 assert.match(dom,/if\(tab==='history'\)void refreshHomeVisitHistory\(\)/);
 assert.match(dom,/if\(fullSnapshot\)\{\s*visits=mapped;/);
 assert.match(dom,/\.is\('archived_at',null\)/);
});

test('Actualizar Historial y Limpiar filtros son acciones reales y visibles',()=>{
 assert.match(dom,/id="hvHistoryRefresh"/);
 assert.match(dom,/id="hvHistoryResetFilters"/);
 assert.match(dom,/id="hvHistoryStatus" role="status" aria-live="polite"/);
 assert.match(dom,/\$\('hvHistoryRefresh'\)\.addEventListener\('click',\(\)=>\{void refreshHomeVisitHistory\(\)\}\)/);
 assert.match(dom,/\$\('hvHistorySearch'\)\.value=''/);
 assert.match(dom,/\$\('hvHistoryDate'\)\.value=''/);
 assert.match(dom,/No hay coincidencias con los filtros/);
 assert.match(dom,/No se pudo consultar el historial: falta conexión/);
 assert.match(dom,/No se modificaron registros/);
});

test('Los archivados solo se consultan al administrador en panel de solo lectura',()=>{
 const start=dom.indexOf('async function refreshHomeVisitHistory()');
 const end=dom.indexOf('function log(v,action,detail){',start);
 assert.ok(start>0&&end>start);
 const slice=dom.slice(start,end);
 assert.match(slice,/if\(cloud\.role==='admin'\)\{/);
 assert.match(slice,/\.select\('id,workspace_id,scheduled_at,status,archived_at,notes,created_at'\)/);
 assert.match(slice,/\.eq\('workspace_id',cloud\.workspaceId\)/);
 assert.match(slice,/\.not\('archived_at','is',null\)/);
 assert.match(dom,/audit\.hidden=cloud\.role!=='admin'/);
 assert.match(dom,/auditPanel\.hidden=cloud\.role!=='admin'/);
 assert.match(dom,/Archivado · solo lectura/);
 assert.doesNotMatch(slice,/\.delete\(|\.update\(|\.upsert\(|\.insert\(|archive_home_visit|unarchive/);
});

test('El historial no se vacía por error y no se silencian fallos de nube',()=>{
 assert.match(dom,/historyRefreshPromise=\(async\(\)=>\{/);
 assert.match(dom,/No se pudo actualizar el historial/);
 assert.match(dom,/archiveHistoryError=error\?\.message/);
 assert.match(dom,/homeVisitSyncCursor=null;homeVisitCacheActive=false/);
 assert.match(dom,/const statusFromDb/);
 assert.match(dom,/visits=mapped/);
 assert.match(dom,/archiveHost\.innerHTML=archiveHistoryError/);
});

test('Ningún botón de borrado o reactivación aparece en auditoría',()=>{
 const begin=dom.indexOf('const audit=document.createElement');
 const end=dom.indexOf('async function refreshHomeVisitHistory()',begin);
 const archiveMarkup=dom.slice(begin,end);
 assert.doesNotMatch(archiveMarkup,/Eliminar|Reactivar|Restaurar|data-hv-archive/);
 assert.match(archiveMarkup,/consultarlos no|consultar|reactiva/i);
 assert.match(dom,/filtered\.map\(v=>'<article class="hv-archived-row"/);
 assert.match(dom,/esc\(v\.patientName\|\|'Paciente'\)/);
 assert.match(dom,/esc\(v\.status\)/);
});

test('CSS respetuoso con tablet, teléfono, PC y permisos',()=>{
 assert.match(css,/#view-domicilios #hvArchivedAudit\[hidden\]\{display:none!important;\}/);
 assert.match(css,/@media screen and \(max-width:760px\)/);
 assert.match(css,/@media print/);
 assert.match(css,/#view-domicilios #hvHistoryRefresh/);
 assert.match(css,/#view-domicilios #hvArchivedRows/);
 assert.doesNotMatch(css,/\.hv-archive-action/);
});

test('PWA sirve el JS reciente y cachea estilos nuevos',()=>{
 assert.match(html,/<script src="\.\/domicilios\.js\?v=20261115-catalogfix1">/);
 assert.match(html,/<link rel="stylesheet" href="\.\/home-visit-history-recovery\.css\?v=20261115-historyfix1" media="screen">/);
 assert.ok(sw.includes("'./home-visit-history-recovery.css'"));
});

test('Código y hoja CSS están bien formados',()=>{
 new vm.Script(dom,{filename:'domicilios.js'});
 let balance=0;
 for(const c of css.replace(/\/\*[\s\S]*?\*\//g,'')){if(c==='{')balance++;if(c==='}')balance--;assert.ok(balance>=0);}
 assert.equal(balance,0);
});
