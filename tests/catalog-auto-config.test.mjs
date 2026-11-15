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


test('La cabecera móvil mantiene icono y título, con acciones fuera de su cuadrícula',()=>{
 assert.match(auto,/actions\.id='catalogHeaderActions'/);
 assert.match(auto,/hero\?\.insertAdjacentElement\('afterend',actions\)/);
 assert.match(auto,/actions\.append\(newTest\)/);
 assert.match(auto,/actions\.append\(importButton\)/);
 assert.match(auto,/actions\.append\(button\)/);
 assert.doesNotMatch(auto,/newTest\.insertAdjacentElement\('beforebegin',button\)/);
 assert.match(css,/#view-catalog #catalogHeaderActions\s*\{/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
 assert.match(css,/writing-mode:horizontal-tb!important/);
 assert.match(css,/word-break:normal!important/);
 assert.match(css,/\.fr2-catalog-new\{\s*grid-column:auto!important/);
});


test('Reconoce los nombres reales importados y la preparación del hemograma',()=>{
 const cbc=core.suggest('Hemograma completo (CBC)');
 assert.equal(cbc.id,'cbc');
 assert.equal(cbc.fields.colorName,'Morado');
 assert.match(cbc.fields.fasting,/No suele requerir ayuno/);
 assert.equal(core.suggest('Hemoglobina glicosilada (HbA1c)').id,'hba1c');
 assert.equal(core.suggest('Tiempo de protrombina (TP)').id,'pt');
});

test('Corrige solo valores verdes heredados sin tocar datos aprobados',()=>{
 const cbc=core.suggest('Hemograma completo (CBC)');
 const legacy={name:'Hemograma completo (CBC)',sample:'',vessel:'',colorName:'Verde',color:'#237C49',shape:'tube',validated:false};
 const snapshot=JSON.stringify(legacy);
 assert.equal(core.isLegacyPlaceholder(legacy),true);
 const proposal=core.missingFields(legacy,cbc);
 assert.equal(proposal.sample,'Sangre total con EDTA');
 assert.equal(proposal.colorName,'Morado');
 assert.equal(proposal.color,'#9670BD');
 assert.match(proposal.fasting,/No suele requerir ayuno/);
 assert.equal(JSON.stringify(legacy),snapshot);
 assert.equal(Object.keys(core.missingFields({...legacy,validated:true},cbc)).length,0);
 assert.equal(core.isLegacyPlaceholder({...legacy,sample:'Sangre'}),false);
 assert.equal(core.missingFields({...legacy,sample:'Sangre'},cbc).colorName,undefined);
});

test('Buscar prueba funciona sin acentos y con listado limitado a 70 tarjetas',()=>{
 const extracted=html.match(/function normalizeCatalogSearch\(text\)\{[^\n]+\}/);
 assert.ok(extracted,'Existe normalizador de búsqueda');
 const normalize=vm.runInNewContext(extracted[0]+';normalizeCatalogSearch');
 assert.equal(normalize('HEMOGRÁMA completo'),'hemograma completo');
 assert.equal(normalize('  HbA1C (glicosilada)  '),'hba1c glicosilada');
 assert.match(html,/const matching=active\.filter/);
 assert.match(html,/const visible=matching\.slice\(0,catalogListLimit\)/);
 assert.match(html,/let catalogListLimit=70/);
 assert.match(html,/function showMoreCatalog\(\)\{catalogListLimit\+=70;renderCatalog\(\);\}/);
 assert.match(html,/catalog-search-more/);
 assert.match(html,/if\(settings&&detailsChanged\)settings\.innerHTML/);
 assert.match(html,/catalogSearch'\)\.addEventListener\('input',renderCatalog\)/);
});

test('Preparación agrupada requiere autorización y confirmación y conserva pendientes clínicos',()=>{
 assert.match(auto,/async function applyReviewedBatch\(\)/);
 assert.match(auto,/if\(!authorized\(\)\)return/);
 assert.match(auto,/window\.confirm\('Se propondrá la configuración/);
 assert.match(auto,/state\.catalog\[index\]=\{\.\.\.item,\.\.\.match\.fields,validated:false/);
 assert.match(auto,/if\(!api\.save\(\)\)/);
 assert.match(auto,/await window\.FleboCloudSync\.syncNow\(\{verify:true\}\)/);
 assert.match(auto,/name\.addEventListener\('change',\(\)=>\{applyToForm\(\);updateForm\(\);\}\)/);
 assert.match(html,/window\.FleboAutoConfig\?\.applyToForm\?\.\(\)/);
 assert.match(html,/Recipiente por configurar/);
});

test('Importación sin datos no atribuye tubo verde ni otro color clínico',()=>{
 assert.match(importer,/color:'#94A3B8',colorName:item\.colorName\|\|'',shape:/);
 assert.doesNotMatch(importer,/colorName:'Verde',shape:'tube'/);
 assert.match(html,/<option value="">Sin definir<\/option><option value="tube">Tubo/);
 assert.match(dom,/shape:item\.shape\|\|f\.shape\|\|''/);
 assert.match(dom,/shape:f\.shape\|\|''/);
});
