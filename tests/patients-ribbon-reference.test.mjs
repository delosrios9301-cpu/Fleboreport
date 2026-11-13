import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const load=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [html,css,ui,sw]=await Promise.all([
 load('index.html'),load('patients-ribbon-reference.css'),
 load('patients-activity-ui.js'),load('service-worker.js')
]);

test('Las tarjetas reales usan la cinta final, sin crear datos ficticios',()=>{
 assert.match(ui,/pp-directory-card pp-integrated-card pp-patient-ribbon/);
 assert.match(ui,/const open=control\('Ver expediente','pp-open-patient'/);
 assert.match(ui,/openPatientRecord\?\.\(person\.id\)/);
 assert.match(ui,/const card=mk\('article'/);
 assert.match(css,/\.pp-patient-ribbon::after/);
 assert.match(css,/data:image\/svg\+xml/);
 assert.match(css,/C100 94 215 43 319 28/);
 assert.match(css,/background-size:100% 100%/);
 assert.match(css,/linear-gradient\(130deg,#e9faf5,#bbf0e8\)/);
 assert.match(css,/\.pp-directory-info::before/);
 assert.match(css,/\.pp-patient-visits::before/);
 assert.match(css,/button\.pp-open-patient::after/);
 assert.doesNotMatch(css,/#patientWorkspace|#attentionForm|display:none!important/);
 assert.doesNotThrow(()=>new Function(ui));
});

test('El acabado solo se aplica a Pacientes y tiene adaptación móvil/tableta/PC',()=>{
 assert.match(css,/#view-patients\.pp-premium\.pp-integrated #patientsHome\.pp-strict-layout/);
 assert.match(css,/@media screen and \(max-width:390px\)/);
 assert.match(css,/@media screen and \(min-width:761px\)/);
 assert.match(css,/grid-template-columns:35px minmax\(0,1fr\) 46px 86px!important/);
 assert.match(css,/grid-template-columns:55px minmax\(0,1fr\) 82px 152px!important/);
 assert.match(html,/patients-ribbon-reference\.css\?v=20261113-ribbon1/);
 assert.match(sw,/'\.\/patients-ribbon-reference\.css'/);
});
