import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const js=await readFile(new URL('../jornada-premium.js',import.meta.url),'utf8');
const css=await readFile(new URL('../jornada-premium.css',import.meta.url),'utf8');
const sw=await readFile(new URL('../service-worker.js',import.meta.url),'utf8');
const segment=(begin,end)=>{
 const from=html.indexOf(begin),to=html.indexOf(end,from+begin.length);
 assert.ok(from>=0&&to>from,'Unrecognized source segment '+begin);
 return html.slice(from,to);
};
const registerSource=segment('function normalizePatientDocument(value)','function syncJourneyFormFromState()');
const previewSource=segment('function updateJourneyPatientTestSummary()','function renderJourneyPatientChoices()');

test('ÚNICO botón de guardado original reubicado al pie de Registro',()=>{
 assert.equal((html.match(/class="btn primary journey-register-button"/g)||[]).length,1);
 assert.match(html,/onclick="registerJourneyPatient\(\)"/);
 assert.match(js,/const registerActions=intake\?\.querySelector\('\.journey-submit-actions'\)/);
 assert.match(js,/intake\.insertAdjacentElement\('afterend',registerActions\)/);
 // El botón queda como hermano fijo fuera del contenido con desplazamiento.
 assert.match(css,/position:relative!important;bottom:auto!important;flex:0 0 auto!important/);
 assert.match(css,/\.journey-entry-panel\{/);
 assert.match(css,/flex:1 1 0!important;min-height:0!important;max-height:none!important/);
 assert.match(css,/overflow-x:hidden!important;overflow-y:auto!important/);
 assert.match(css, /min-height:52px!important/);
 assert.match(css,/\.journey-main-column>\.journey-submit-actions/);
});
test('Resumen de pruebas incluye quitar accesible y no elimina otras pruebas',()=>{
 assert.match(previewSource,/journey-test-chip-remove/);
 assert.match(previewSource,/data-remove-journey-test/);
 assert.match(previewSource,/aria-label="Quitar prueba/);
 assert.match(previewSource,/button\.dataset\.removeJourneyTest/);
 assert.match(previewSource,/persistJourneyDraft\(\{selectedTestIds:next\}\)/);
 assert.match(css,/\.journey-test-chip-remove/);
 assert.match(css,/width:34px!important;height:34px!important/);
 const host={innerHTML:'',onclick:null,contains:()=>true};
 let saved=['hcg','glucosa'],rerenders=0;
 const ctx={
  $:()=>host,
  state:{catalog:[{id:'hcg',name:'HCG'},{id:'glucosa',name:'Glucosa'}]},
  readJourneyDraft:()=>({selectedTestIds:saved.slice()}),
  persistJourneyDraft:patch=>{saved=patch.selectedTestIds},
  renderJourneyPatientChoices:()=>{rerenders++},
  esc:x=>String(x),
  vesselSvg:()=>'<svg/>'
 };
 vm.runInNewContext(previewSource,ctx);
 ctx.updateJourneyPatientTestSummary();
 assert.match(host.innerHTML,/Quitar prueba HCG/);
 host.onclick({target:{closest:()=>({dataset:{removeJourneyTest:'hcg'}})}});
 assert.equal(rerenders,1);
 assert.deepEqual(saved,['glucosa']);
});
function register(selected=['hcg'],opts={}){
 const elements={
  journeyPatientName:{value:opts.name??'Elena'},
  journeyPatientLastName:{value:opts.surname??'Ríos'},
  journeyPatientId:{value:'8-321-789'},
  journeyPatientBirth:{value:'1991-02-10'},
  journeyPatientSex:{value:'Femenino'},
  journeyPatientTestSearch:{value:''},journeyPatientLookupHint:{textContent:''}
 };
 const state={patients:[],journeyEntries:[],journey:{id:'j-1',date:'2026-11-12'},selected:[],catalog:[{id:'hcg',active:true},{id:'glucosa',active:true}]};
 let saves=0,notice='';
 const ctx={
  state,$:id=>elements[id],
  document:{querySelectorAll:()=>[]},
  readJourneyDraft:()=>({selectedTestIds:selected}),
  journeySnapshot:()=>JSON.stringify(state),
  restoreJourneySnapshot:()=>{},
  touchJourney:()=>{},save:()=>{saves++;return true},
  clearJourneyDraft:()=>{},renderAll:()=>{},toast:t=>{notice=t},
  persistJourneyDraft:()=>{}
 };
 vm.runInNewContext(registerSource,ctx);
 ctx.registerJourneyPatient();
 return {state,saves,notice};
}
test('Guarda dos pruebas aunque se borre la búsqueda y no existan casillas visibles',()=>{
 const x=register(['hcg','glucosa']);
 assert.equal(x.saves,1);
 assert.equal(x.state.patients.length,1);
 assert.deepEqual(Array.from(x.state.journeyEntries[0].testIds),['hcg','glucosa']);
 assert.equal(x.state.selected.length,2);
});
test('Quitar prueba equivocada antes de guardar no incorpora esa prueba',()=>{
 const x=register(['glucosa']);
 assert.equal(x.saves,1);
 assert.deepEqual(Array.from(x.state.journeyEntries[0].testIds),['glucosa']);
 assert.equal(x.state.selected.length,1);
});
test('Sin pruebas no registra un paciente incompleto',()=>{
 const x=register([]);
 assert.equal(x.saves,0);
 assert.equal(x.state.patients.length,0);
 assert.match(x.notice,/Selecciona al menos una prueba/);
});
test('v297 actualiza JS, CSS y cache; mantiene formulario por cédula y reportes',()=>{
 assert.match(html,/jornada-premium\.css\?v=20261113-jornada6" media="screen"/);
 assert.match(html,/jornada-premium\.js\?v=20261113-jornada5/);
 assert.match(sw,/fleboreport-shell-v302/);
 assert.match(html,/id="journeyPatientId"/);
 assert.match(html,/function completeJourneyAfterExport\(\)/);
 assert.doesNotThrow(()=>new Function(js));
});

test('Formulario de Jornada se desplaza verticalmente, admite teclado y conserva swipe lateral',()=>{
 assert.ok(css.includes('v298 — Registro en Jornada:'));
 assert.match(css,/overscroll-behavior-y:contain!important/);
 assert.match(css,/touch-action:auto!important/);
 assert.ok(css.includes('var(--jp-keyboard-bottom,0px)'));
 assert.match(js,/function updateWorkspaceViewport\(\)/);
 assert.ok(js.includes("window.visualViewport.addEventListener('resize',updateWorkspaceViewport"));
 assert.match(js,/function ensureFieldVisible\(field\)/);
 assert.match(css,/scroll-snap-type:x mandatory/);
 assert.equal((html.match(/class="btn primary journey-register-button"/g)||[]).length,1);
});

test('v299: botón Guardar visible sobre dock inferior sin ocultar la navegación móvil',()=>{
 assert.match(css,/v299 · La barra inferior permanece visible/);
 assert.ok(css.includes('var(--jp-viewport-clearance,96px)'));
 assert.ok(css.includes('flex-shrink:0!important'));
 assert.match(js,/const dock=mobile\?byId\('cmMobileDock'\):null/);
 assert.match(js,/const clearance=Math.max\(keyboardClearance,dockClearance\)/);
 assert.match(js,/dock\.getBoundingClientRect\(\)/);
 assert.ok(js.includes("view.style.setProperty('--jp-viewport-clearance'"));
 assert.match(css,/overflow-x:hidden!important;overflow-y:auto!important/);
 assert.match(css,/scroll-snap-type:x mandatory/);
 assert.ok(!js.includes("byId('cmMobileDock')?.remove()"));
});
