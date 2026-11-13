import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const dom=await readFile(new URL('../domicilios.js',import.meta.url),'utf8');
const css=await readFile(new URL('../domicilios-premium.css',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const sw=await readFile(new URL('../service-worker.js',import.meta.url),'utf8');

test('Domicilios conserva la navegación funcional, pero reconstruye la jerarquía de pantalla',()=>{
 assert.match(dom,/hv-premium-hero/);
 assert.match(dom,/id="hvRefNew" class="hv-ref-new" hidden>＋ Nuevo domicilio<\/button>/);
 assert.doesNotMatch(dom,/hvPremiumCreate|hvCreateTab/);
 assert.match(dom,/enhanceHomeVisitComposition\(\)/);
 assert.match(dom,/hv-premium-section-intro/);
 assert.match(dom,/hv-premium-panel-heading/);
 assert.match(dom,/hv-premium-filters/);
 assert.match(dom,/hv-premium-fieldset/);
 assert.match(dom,/hv-premium-detail-section/);
 assert.match(dom,/enhanceHomeVisitDetail\(premiumDialog\)/);
 assert.doesNotThrow(()=>new Function(dom));
});
test('tarjetas de agenda presentan jerarquía visual nueva con estados y responsable',()=>{
 for(const token of ['hv-ref-avatar','hv-ref-head','hv-ref-meta','hv-ref-state','hv-ref-actions','hv-ref-route','hv-ref-respond'])
  assert.ok(dom.includes(token),token);
 assert.match(dom,/const activeList=visits\.filter/);
 assert.match(dom,/const historyList=visits\.filter/);
 assert.match(dom,/hvReferenceStatus\(v\.status\)/);
 assert.match(dom,/data-hv-ref-details/);
});
test('el diseño de invitaciones NO revela datos del paciente antes de aceptar',()=>{
 assert.match(dom,/const privatePending=technician&&v\.assignmentStatus==='invited'&&v\.status==='Pendiente de aceptación'/);
 assert.match(dom,/privatePending\?'Visita por confirmar':String\(v\.patientName/);
 assert.match(dom,/const address=privatePending\?'':String\(v\.address/);
 assert.match(dom,/privatePending\?'Asignación pendiente':String\(v\.tests/);
 assert.match(dom,/Ubicación tras aceptar/);
 assert.match(dom,/if\(cloud\.role==='technician'&&v\.assignmentStatus!=='accepted'\)/);
 assert.match(dom,/list_home_visit_invitation_previews/);
});
test('agrupación del formulario no cambia IDs, botones clínicos ni acciones',()=>{
 for(const id of ['hvPatientLookup','hvDate','hvAssignee','hvTests','hvCreatePanel','hvAgendaPanel','hvCalendar','hvHistoryRows'])
  assert.ok(dom.includes(id),id);
 assert.match(dom,/section\.className='hv-premium-fieldset'/);
 assert.match(dom,/body\.appendChild\(field\)/);
 assert.match(dom,/onclick="hvCreate\(\)"/);
 assert.match(dom,/onclick="hvStatus\(/);
 assert.match(dom,/hvTestStatus\(/);
 assert.match(dom,/hvOpenDocument\(/);
 assert.match(dom,/hvCalendarMove\(/);
});
test('mismo diseño premium, sin ocultar información y usable en Android tablet y PC',()=>{
 for(const key of [
  '.hv-premium-hero','.hv-premium-kpi','.hv-premium-filters','.hv-premium-visit',
  '.hv-premium-fieldset','.hv-cal-grid','.hv-premium-detail-section','.hv-detail-dialog',
  '#hvHistoryPanel','.hv-assignment-modal','.hv-field-card'
 ])assert.ok(css.includes(key),key);
 assert.match(css,/@media\(max-width:900px\)/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/@media\(max-width:370px\)/);
 assert.match(css,/min-height:44px!important/);
 assert.match(css,/\.hv-premium-hero-actions \[hidden\]/);
 assert.match(css,/#hvWorkspace > #hvCreatePanel\[hidden\]\{[\s\S]*?display:none!important/);
});
test('caché y versión web incluyen el CSS y script específicos de Domicilios',()=>{
 assert.match(html,/domicilios-premium\.css\?v=20261112-hv1" media="screen"/);
 assert.match(html,/domicilios\.js\?v=20261112-reference3/);
 assert.match(sw,/fleboreport-shell-v309/);
 assert.match(sw,/'\.\/domicilios-premium.css'/);
});

test('gestos de Variante C funcionan visualmente sin llamar flujos clínicos', async()=>{
 const gestureJs=await readFile(new URL('../domicilios-premium-gestures.js',import.meta.url),'utf8');
 assert.match(gestureJs,/document\.addEventListener\('pointerdown',onPointerDown,\{passive:true\}\)/);
 assert.match(gestureJs,/\.hv-premium-visit/);
 assert.match(gestureJs,/\.hv-module-tab/);
 assert.match(gestureJs,/\.hv-cal-day/);
 assert.match(gestureJs,/\.hv-detail-dialog \.hv-actions button/);
 assert.match(gestureJs,/\.hv-premium-touch-ripple/);
 assert.match(gestureJs,/prefers-reduced-motion: reduce/);
 assert.doesNotMatch(gestureJs,/\.rpc\(|\.from\(|fetch\(|localStorage|sessionStorage|hvStatus\(|hvCreate\(|hvSelect\(/i);
 assert.doesNotThrow(()=>new Function(gestureJs));
});
test('animaciones suaves e indicadores de estado respetan accesibilidad',()=>{
 for(const item of ['hvPremiumArrive','hvPremiumSheetRise','hvPremiumTouchRipple','hvPremiumStatusGlow','prefers-reduced-motion:reduce',':focus-visible'])
  assert.ok(css.includes(item),item);
 assert.match(html,/domicilios-premium-gestures\.js\?v=20261112-gestures1/);
 assert.match(sw,/'\.\/domicilios-premium-gestures.js'/);
 assert.match(sw,/fleboreport-shell-v309/);
});
