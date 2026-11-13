import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const sw=await readFile(new URL('../service-worker.js',import.meta.url),'utf8');
const begin=html.indexOf('function normalizeJourneyPatientTestSearch(value){');
const end=html.indexOf('function renderJourneyPatients(){',begin);
assert.ok(begin>0&&end>begin,'No se encontró la selección clínica original');
const source=html.slice(begin,end);

function fixture(){
 const draft={selectedTestIds:[],search:'glu'};
 let search={value:'glu',blurred:false,blur(){this.blurred=true}};
 const panel={hidden:true};
 let options=[],persistCount=0;
 const choices={
  innerHTML:'',querySelectorAll(selector){
   assert.equal(selector,'input[name="journeyPatientTest"]');
   if(panel.hidden||!this.innerHTML.includes('type="checkbox"'))return [];
   const needle=search.value.toLowerCase();
   const testId=needle.includes('glu')?'glucosa':'hcg';
   const input={
    checked:false,value:testId,onchange:null,
    closest:()=>({classList:{toggle:()=>{}}})
   };
   options=[input];return options;
  }
 };
 const chips={innerHTML:'',onclick:null,contains:()=>true};
 const elements={
  journeyPatientTestChoices:choices,journeyTestPicker:panel,
  journeyPatientTestSearch:search,journeySelectedTestChips:chips
 };
 const context={
  $:id=>elements[id],state:{catalog:[
   {id:'glucosa',name:'Glucosa',code:'GLU',active:true,vessel:'Tubo'},
   {id:'hcg',name:'HCG',code:'HCG',active:true,vessel:'Tubo'}]},
  readJourneyDraft:()=>({...draft,selectedTestIds:[...draft.selectedTestIds]}),
  persistJourneyDraft:patch=>{Object.assign(draft,patch);persistCount++;return true;},
  vesselSvg:()=>'<svg/>',esc:x=>String(x),Set,Array,String
 };
 vm.runInNewContext(source,context);
 return {context,draft,search,choices,panel,chips,options:()=>options,count:()=>persistCount};
}
test('Seleccionar una prueba cierra el desplegable de inmediato pero guarda la prueba en el borrador',()=>{
 const x=fixture();
 x.context.renderJourneyPatientChoices();
 assert.equal(x.panel.hidden,false);
 assert.equal(x.options().length,1);
 const chosen=x.options()[0];chosen.checked=true;chosen.onchange();
 assert.deepEqual(Array.from(x.draft.selectedTestIds),['glucosa']);
 assert.equal(x.draft.search,'');
 assert.equal(x.search.value,'');
 assert.equal(x.search.blurred,true);
 assert.equal(x.panel.hidden,true);
 assert.equal(x.choices.innerHTML,'');
 assert.match(x.chips.innerHTML,/Glucosa/);
 assert.equal(x.count(),1);
});
test('Permite elegir varias pruebas consecutivamente sin guardar el paciente',()=>{
 const x=fixture();
 x.context.renderJourneyPatientChoices();
 x.options()[0].checked=true;x.options()[0].onchange();
 x.context.filterJourneyPatientTests('hcg');
 assert.equal(x.panel.hidden,false);
 assert.match(x.choices.innerHTML,/HCG/);
 x.options()[0].checked=true;x.options()[0].onchange();
 assert.deepEqual(Array.from(x.draft.selectedTestIds),['glucosa','hcg']);
 assert.equal(x.panel.hidden,true);
 assert.match(x.chips.innerHTML,/Glucosa/);
 assert.match(x.chips.innerHTML,/HCG/);
 assert.equal(x.count(),2);
});
test('Las etiquetas siguen permitiendo quitar una prueba individualmente',()=>{
 const x=fixture();
 x.context.renderJourneyPatientChoices();
 x.options()[0].checked=true;x.options()[0].onchange();
 x.context.filterJourneyPatientTests('hcg');
 x.options()[0].checked=true;x.options()[0].onchange();
 x.chips.onclick({target:{closest:()=>({dataset:{removeJourneyTest:'glucosa'}})}});
 assert.deepEqual(Array.from(x.draft.selectedTestIds),['hcg']);
 assert.match(x.chips.innerHTML,/HCG/);
 assert.doesNotMatch(x.chips.innerHTML,/Glucosa/);
});
test('No altera el flujo de guardado de paciente y publica versión PWA',()=>{
 assert.match(html,/function registerJourneyPatient\(\)/);
 assert.match(html,/onclick="registerJourneyPatient\(\)"/);
 assert.match(html,/persistJourneyDraft\(\{selectedTestIds:Array\.from\(ids\),search:''\}\)/);
 assert.match(html,/if\(search\)\{search\.value='';search\.blur\(\);\}/);
 assert.match(html,/renderJourneyPatientChoices\(\)/);
 assert.match(sw,/fleboreport-shell-v318/);
});
