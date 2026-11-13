import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const load=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [ui,cloud,css,html,sw]=await Promise.all([
 load('patients-activity-ui.js'),load('patient-cloud-sync.js'),
 load('patients-admin-swipe.css'),load('index.html'),load('service-worker.js')
]);
test('Solo el administrador crea y utiliza la acción de eliminar',()=>{
 assert.match(ui,/m\?\.role==='admin'/);
 assert.match(ui,/if\(isAdmin\)\{/);
 assert.match(ui,/control\('Eliminar','pp-swipe-delete'/);
 assert.match(ui,/archivePatientFromRibbon\(person,shell,remove\)/);
 assert.match(ui,/if\(!canArchive\(\)\)/);
 assert.match(ui,/window\.confirm\('¿Retirar a '/);
 assert.match(ui,/aria-hidden','true'/);
 assert.doesNotMatch(ui,/state\(\)\.patients\.splice|state\(\)\.patients\.push/);
});
test('Swipe táctil revela botón; nunca elimina automáticamente al deslizar',()=>{
 assert.match(ui,/pointerdown/);
 assert.match(ui,/pointermove/);
 assert.match(ui,/pointerup/);
 assert.match(ui,/pointercancel/);
 assert.match(ui,/event\.pointerType/);
 assert.match(ui,/Math\.abs\(dy\)>Math\.abs\(dx\)/);
 assert.match(ui,/setSwipe\(g\.shell,g\.wasOpen\?dx<34:dx<-43\)/);
 assert.doesNotMatch(ui,/pointerup[^;]*archivePatient\(/);
 assert.match(css,/touch-action:pan-y/);
 assert.match(css,/translate|transform/);
 assert.match(css,/linear-gradient\(135deg,#e53b60,#ae1641\)/);
 assert.match(css,/pointer:fine/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});
test('Archivado es un RPC autenticado, auditable y bloquea restauración por caché',()=>{
 assert.match(cloud,/async function archivePatient\(patientId\)/);
 assert.match(cloud,/m\?\.role!=='admin'/);
 assert.match(cloud,/client\.rpc\('archive_workspace_patient'/);
 assert.match(cloud,/const tombstones=new Set/);
 assert.match(cloud,/if\(r\.archivedAt\)return/);
 assert.match(cloud,/archived_at'\)/);
 assert.match(cloud,/pendingKeys\.delete\(removedKey\)/);
 assert.match(cloud,/archivePatient,get ready/);
 assert.doesNotThrow(()=>new Function(ui));
 assert.doesNotThrow(()=>new Function(cloud));
 assert.match(html,/patients-admin-swipe\.css\?v=20261113-swipe1/);
 assert.match(sw,/'\.\/patients-admin-swipe\.css'/);
});
