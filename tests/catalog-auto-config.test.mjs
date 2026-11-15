import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [auto,css,html,sw,importer,dom]=await Promise.all([
 read('catalog-auto-config.js'),read('catalog-auto-config.css'),
 read('index.html'),read('service-worker.js'),
 read('catalog-import-core.js'),read('domicilios.js')
]);
const sandbox={module:{exports:{}}};
vm.runInNewContext(auto,sandbox,{filename:'catalog-auto-config.js'});
const core=sandbox.module.exports;

test('Reconocimiento exacto y muestra + recipiente + color + forma con fuente',()=>{
 const cbc=core.suggest('  HEMOGRAMA completo ');
 assert.equal(cbc.fields.sample,'Sangre total con EDTA');
 assert.match(cbc.fields.vessel,/tapa lila/);
 assert.equal(cbc.fields.colorName,'Morado');
 assert.equal(cbc.fields.shape,'tube');
 assert.match(cbc.url,/mayocliniclabs\.com/);
 assert.equal(core.suggest('Hemoglobina Glicosilada').id,'hba1c');
 assert.equal(core.suggest('PT / INR').fields.colorName,'Celeste');
 const urine=core.suggest('Urocultivo');
 assert.equal(urine.fields.sample,'Orina');
 assert.equal(urine.fields.shape,'jar');
 assert.equal(urine.fields.colorName,'');
});

test('Nombres desconocidos o ambiguos nunca producen configuraciones falsas',()=>{
 for(const name of ['Glucosa','Creatinina','HCG','Orina','Coprológico','', 'Hemograma para mascotas']){
  assert.equal(core.suggest(name),null,name);
 }
});

test('Propuestas preservan datos existentes y no alteran protocolos confirmados',()=>{
 const p=core.suggest('Hemograma');
 const existing={name:'Hemograma',sample:'Muestra local',vessel:'Tubo aprobado',colorName:'Azul',validated:false};
 const before=JSON.stringify(existing),changes=core.missingFields(existing,p);
 assert.equal(changes.sample,undefined);
 assert.equal(changes.vessel,undefined);
 assert.equal(changes.colorName,undefined);
 assert.equal(changes.shape,'tube');
 assert.equal(JSON.stringify(existing),before);
 assert.equal(Object.keys(core.missingFields({...existing,validated:true},p)).length,0);
});

test('Interfaz segura, revisión de administrador y recurso PWA',()=>{
 new vm.Script(auto);
 assert.match(auto,/member\(\)\?\.active===true&&member\(\)\?\.role==='admin'/);
 assert.match(auto,/Aplicar sugerencia a campos vacíos/);
 assert.match(auto,/Configuración automática/);
 assert.match(auto,/auditAdd/);
 assert.doesNotMatch(auto,/\.upsert\(|\.delete\(|\.insert\(|\.from\('services'\)/);
 assert.ok(html.includes('./catalog-auto-config.js?v=20261115-autoconfig1'));
 assert.ok(html.includes('./catalog-auto-config.css?v=20261115-autoconfig1'));
 assert.ok(sw.includes("'./catalog-auto-config.js'"));
 assert.ok(sw.includes("'./catalog-auto-config.css'"));
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/#view-catalog \.catalog-auto-open\[hidden\]/);
});

test('Importación sin datos no atribuye tubo verde ni otro color clínico',()=>{
 assert.match(importer,/color:'#94A3B8',colorName:item\.colorName\|\|'',shape:/);
 assert.doesNotMatch(importer,/colorName:'Verde',shape:'tube'/);
 assert.match(html,/<option value="">Sin definir<\/option><option value="tube">Tubo/);
 assert.match(dom,/shape:item\.shape\|\|f\.shape\|\|''/);
 assert.match(dom,/shape:f\.shape\|\|''/);
});
