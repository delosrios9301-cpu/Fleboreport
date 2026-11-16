import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

const js=readFileSync(new URL('../domicilios-seguimiento-exacto.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../domicilios-seguimiento-exacto.css',import.meta.url),'utf8');
const core=readFileSync(new URL('../domicilios.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('vista aprobada: JavaScript analizable por Node',()=>{
 assert.doesNotThrow(()=>execFileSync(process.execPath,['--check',new URL('../domicilios-seguimiento-exacto.js',import.meta.url).pathname]));
});
test('vista aprobada se monta en el seguimiento existente y no altera transiciones',()=>{
 assert.match(core,/window\.FleboTrackEnhance\(premiumDialog,activeVisit\)/);
 assert.match(core,/function changeStatus\(id,next,confirmed=false\)/);
 assert.match(core,/function technicianFieldScreen\(v\)/);
 assert.match(js,/appendChild\(cards\[0\]\)/);
 assert.match(js,/appendChild\(cards\[1\]\)/);
 assert.match(js,/appendChild\(cards\[2\]\)/);
 assert.match(js,/appendChild\(cards\[3\]\)/);
 assert.match(js,/appendChild\(cards\[4\]\)/);
 assert.match(js,/appendChild\(cards\[5\]\)/);
 assert.match(js,/querySelector\('#hvFieldActionMessage'\)/);
 assert.match(js,/hv-tracking-dialog/);
});
test('vista aprobada: tres pestañas y progreso real sin datos ficticios',()=>{
 for(const label of ['Seguimiento','Paciente','Pruebas','Estado de la visita','Paciente y ubicación','Actualizar estado','Ver ubicación'])assert.ok(js.includes(label),label);
 assert.match(js,/v\.patientName/);
 assert.match(js,/v\.document/);
 assert.match(js,/v\.phone/);
 assert.match(js,/v\.address/);
 assert.doesNotMatch(js,/ALEXIS IBATH/);
 assert.match(js,/setTab\(dialog,selectedTab\)/);
});
test('ubicaciones: link original Google Maps o búsqueda segura',()=>{
 const context={window:{},URL,encodeURIComponent};
 runInNewContext(js,context);
 const link=context.window.FleboTrackUtils.mapLink;
 assert.equal(link('https://www.google.com/maps/place/Panama'), 'https://www.google.com/maps/place/Panama');
 assert.equal(link('https://maps.app.goo.gl/abcd'), 'https://maps.app.goo.gl/abcd');
 assert.equal(link('Calle 50, Panamá'), 'https://www.google.com/maps/search/?api=1&query=Calle%2050%2C%20Panam%C3%A1');
 assert.match(link('https://www.google.com.evil.com/maps/phishing'), /^https:\/\/www\.google\.com\/maps\/search\/\?/);
 assert.equal(link(''), '');
});
test('vista aprobada: estilos responsivos, legibilidad y archivos versionados',()=>{
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/@media\(max-width:360px\)/);
 assert.match(css, /prefers-reduced-motion:reduce/);
 assert.match(css, /\.hv-track-footer\{position:sticky/);
 assert.match(css, /\.hv-track-tabpanel\[hidden\]/);
 assert.match(html, /domicilios-seguimiento-exacto\.css\?v=20261116-ui1/);
 assert.match(html, /domicilios-seguimiento-exacto\.js\?v=20261116-ui1/);
});
