import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const dom=await readFile(new URL('../domicilios.js',import.meta.url),'utf8');
const css=await readFile(new URL('../domicilios-reference.css',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const sw=await readFile(new URL('../service-worker.js',import.meta.url),'utf8');
test('Domicilios referencia comienza con título, chips reales y tarjetas',()=>{
 assert.match(dom,/function enhanceReferenceVisitLayout\(\)/);
 assert.match(dom,/workspace\.prepend\(head\)/);
 assert.match(dom,/hvRefQuick/);
 assert.match(dom,/hvReferenceStatusGroups/);
 assert.match(dom,/const activeList=visits\.filter\(v=>!historyStatuses\.includes\(v\.status\)&&matches\(v\)&&\(!referenceQuickStatus/);
 assert.match(dom,/data-hv-ref-quick/);
 assert.match(dom,/quickBar\.hidden=activeTab!=='agenda'/);
 assert.match(dom,/enhanceReferenceVisitLayout\(\)/);
 assert.doesNotThrow(()=>new Function(dom));
});
test('tarjetas reales muestran contornos, nombre, estado, hora, dirección y botones',()=>{
 for(const name of ['hv-ref-visit','hv-ref-avatar','hv-ref-head','hv-ref-state','hv-ref-location','hv-ref-route','hv-ref-respond','hv-ref-meta'])
  assert.ok(dom.includes(name)&&css.includes(name),name);
 assert.match(css,/\.hv-ref-visit::before/);
 assert.match(css,/\.hv-ref-visit::after/);
 assert.match(css,/linear-gradient\(180deg,#ad4afb,#7324e5/);
 assert.match(dom,/String\(v\.patientName\|\|'Paciente'\)/);
 assert.match(dom,/hvReferenceHour\(v\.scheduledTime\)/);
 assert.match(dom,/String\(v\.address\|\|''\)\.trim/);
 assert.match(dom,/status=hvReferenceStatus\(v\.status\)/);
});
test('no se exponen detalles ni ruta antes de aceptar y el gestor no puede aceptar por tarjeta',()=>{
 assert.match(dom,/privatePending\?'Visita por confirmar'/);
 assert.match(dom,/privatePending\?'Asignación pendiente'/);
 assert.match(dom,/const address=privatePending\?'':/);
 assert.match(dom,/if\(cloud\.role==='technician'&&v\.assignmentStatus!=='accepted'\)/);
 assert.match(dom,/hasRoute\?'':' disabled aria-disabled="true"'/);
 assert.match(dom,/window\.hvSelect\(target\.dataset\.hvRefDetails\)/);
 assert.doesNotMatch(dom,/data-hv-ref-accept|hvReferenceAccept\(/);
 assert.match(dom,/list_home_visit_invitation_previews/);
});
test('todas las herramientas siguen disponibles y responsive sin cuadros grandes',()=>{
 assert.match(dom,/appendChild\(tabs\)/);
 assert.match(dom,/appendChild\(actions\)/);
 assert.match(dom,/hv-ref-tools-open/);
 assert.match(dom,/id="hvRefNew"/);
 assert.match(css,/#hvWorkspace > #hvKpis/);
 assert.match(css,/\.hv-premium-section-intro/);
 assert.match(css,/#hvAgendaPanel \.hv-premium-filters/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/@media\(max-width:360px\)/);
 assert.match(css,/min-height:44px!important/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(dom,/hvSetTab/);
 assert.match(dom,/window\.hvStatus=changeStatus/);
});
test('v290 publica la capa de referencia después de estilos premium sin impactar reportes',()=>{
 assert.match(html,/domicilios-reference\.css\?v=20261112-reference3" media="screen"/);
 assert.match(html,/domicilios\.js\?v=20261112-reference3/);
 assert.ok(html.lastIndexOf('domicilios-reference.css')>html.lastIndexOf('domicilios-premium.css'));
 assert.match(sw,/fleboreport-shell-v308/);
 assert.match(sw,/'\.\/domicilios-reference.css'/);
});
