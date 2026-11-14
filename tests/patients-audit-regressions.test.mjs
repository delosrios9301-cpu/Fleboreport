import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const context={module:{exports:{}}};
vm.runInNewContext(await readFile(new URL('../patients-activity-model.js',import.meta.url),'utf8'),context);
const {build}=context.module.exports;
test('Registrada sin evidencia no cuenta como realizada',()=>{
 const state={patients:[{id:'p',document:'8-1',attentions:[{id:'a',tests:[{name:'HCG',status:'Registrada'}]}]}]};
 assert.equal(build(state).summary.testsPerformed,0);
 state.patients[0].attentions[0].tests[0].status='Tomada';
 assert.equal(build(state).summary.testsPerformed,1);
});
test('Domicilio se vincula por ID y conserva toma parcial',()=>{
 const state={patients:[{id:'p',cloudPatientId:'cloud',document:'8-1'}],
 homeVisits:[{id:'h',patientId:'cloud',scheduledDate:'2026-11-14',tests:[{name:'A',status:'Tomada'},{name:'B',status:'Pendiente'}]}]};
 const person=build(state).patients[0];
 assert.equal(person.testsPerformed,1);
 assert.equal(person.visits,1);
 assert.equal(person.records[0].source,'home');
 state.homeVisits[0].patientId='otro';
 assert.equal(build(state).patients[0].records.length,0);
});
test('Atención agrupada mantiene ID del expediente propietario',()=>{
 const person=build({patients:[{id:'p',document:'8-1'},{id:'q',document:'8-1',attentions:[{id:'a',tests:[]}]}]}).patients[0];
 assert.equal(person.records[0].ownerId,'q');
});
