import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const f=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [ui,css,notif,dom,index,worker]=await Promise.all([
 f('domicilios-volunteer-ui.js'),f('domicilios-volunteer-ui.css'),
 f('notifications-center.js'),f('domicilios.js'),f('index.html'),f('service-worker.js')
]);
test('Domicilios voluntarios usa RPC sanitizada, confirmación y asignación atómica',()=>{
 assert.match(ui,/list_available_home_visits/);
 assert.match(ui,/volunteer_home_visit/);
 assert.match(ui,/p_home_visit_id:String\(id\)/);
 assert.match(ui,/window\.confirm/);
 assert.match(ui,/Datos del paciente protegidos hasta aceptar/);
 assert.match(ui,/window\.hvRefreshVoluntary/);
 assert.doesNotMatch(ui,/\.from\('home_visits'\)\.select|\.from\('home_visit_assignments'\)\.insert/);
 for(const secret of ['document_number','patient_phone','latitude','longitude'])assert.ok(!ui.includes(secret),secret);
 assert.match(css,/\.hv-volunteer-offer/);
 assert.match(css,/max-width:540px/);
});
test('Nuevo evento de campana, navegación y precarga PWA',()=>{
 assert.match(notif,/volunteer_available:'Domicilio disponible para asignación voluntaria'/);
 assert.match(notif,/volunteer_claimed:'Domicilio asignado voluntariamente'/);
 assert.match(notif,/FleboHomeVolunteer\.focusAvailable/);
 assert.match(index,/domicilios-volunteer-ui\.js\?v=20261114-vol1/);
 assert.match(index,/domicilios-volunteer-ui\.css\?v=20261114-vol1/);
 assert.match(worker,/'\.\/domicilios-volunteer-ui\.js'/);
 for(const x of [dom,ui,notif])assert.doesNotThrow(()=>new Function(x));
});
