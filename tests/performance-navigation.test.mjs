import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [html,patients,ui,nav,compact,worker]=await Promise.all([
 read('index.html'),read('patients-premium-reference.js'),
 read('patients-activity-ui.js'),read('clinical-modern-workspace.js'),
 read('variant-c-compact.js'),read('service-worker.js')
]);

test('Sincronización mantiene el estado remoto pero pinta solo el módulo visible',()=>{
 assert.match(html,/function renderCloudVisibleView\(\)/);
 assert.match(html,/case 'view-home':refreshDashboard\(\)/);
 assert.match(html,/case 'view-patients':renderPatients\(\)/);
 assert.match(html,/case 'view-journey':syncJourneyFormFromState\(\);renderJourneyPatients\(\);renderJourney\(\)/);
 assert.match(html,/window\.addEventListener\('flebo:cloud-state-applied',queueCloudVisibleView\)/);
 assert.match(html,/frCloudUiFrame=requestAnimationFrame/);
 assert.match(html,/frCloudUiQueued=true;return/);
 assert.match(html,/document\.addEventListener\('focusout'/);
 assert.match(html,/document\.addEventListener\('visibilitychange'/);
 assert.match(html,/function renderAll\(\)/);
 assert.match(html,/if\(view==='journey'\)\{syncJourneyFormFromState\(\);renderJourneyPatients\(\)\}/);
});

test('Pacientes no reconstruye las cintas cuando el contenido visible no cambia',()=>{
 assert.match(patients,/if\(!ready\|\|!\$\('view-patients'\)\?\.classList\.contains\('active'\)\)return/);
 assert.doesNotMatch(patients,/new MutationObserver\(scheduleRefresh\)/);
 assert.match(ui,/let listMode='all',configured=false,rendering=false,lastDirectorySignature=''/);
 assert.match(ui,/signature===lastDirectorySignature/);
 assert.match(ui,/host\.childElementCount===Math\.max\(1,rows\.length\)/);
 assert.match(ui,/if\(rendering\|\|!\$\('view-patients'\)\?\.classList\.contains\('active'\)\)return/);
 assert.match(ui,/window\.FleboPatientsPremium\?\.getDirectoryMode/);
 assert.match(ui,/pp-patient-ribbon/);
 assert.doesNotThrow(()=>new Function(patients));
 assert.doesNotThrow(()=>new Function(ui));
});

test('Navegación y KPIs no escriben atributos idénticos durante scroll',()=>{
 assert.match(nav,/context\.textContent !== label/);
 assert.match(nav,/bar\.getAttribute\('data-area'\) !== key/);
 assert.match(nav,/button\.hidden!==hide/);
 assert.match(compact,/const scheduleKpiSync=/);
 assert.match(compact,/kpis\.addEventListener\('scroll',scheduleKpiSync,\{passive:true\}\)/);
 assert.match(compact,/card\.getAttribute\('aria-label'\)!==description/);
 assert.match(compact,/button\.hidden!==hide/);
 assert.doesNotThrow(()=>new Function(nav));
 assert.doesNotThrow(()=>new Function(compact));
 assert.match(html,/clinical-modern-workspace\.js\?v=20261113-cmw5/);
 assert.match(html,/variant-c-compact\.js\?v=20261113-vc3/);
 assert.match(html,/patients-activity-ui\.js\?v=20261113-patient9/);
 assert.match(worker,/fluidez v325/i);
});
