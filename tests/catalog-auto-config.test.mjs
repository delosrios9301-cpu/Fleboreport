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
 for(const name of ['Glucosa','Creatinina','HCG','', 'Hemograma para mascotas']){
  assert.equal(core.suggest(name),null,name);
 }
 const sample=core.suggest('Ácido úrico urinario');
 assert.equal(sample.level,'sample_only');
 assert.equal(sample.fields.sample,'Orina');
 assert.equal(sample.fields.vessel,'');
 assert.equal(sample.fields.colorName,'');
 assert.equal(sample.fields.color,'');
 assert.equal(core.suggest('Coprológico').fields.sample,'Heces');
});

test('Propuestas preservan datos existentes y no alteran protocolos confirmados',()=>{
 const p=core.suggest('Hemograma');
 const existing={name:'Hemograma',sample:'Muestra local',vessel:'Tubo aprobado',colorName:'Azul',validated:false};
 const before=JSON.stringify(existing),changes=core.missingFields(existing,p);
 assert.equal(changes.sample,undefined);
 assert.equal(changes.vessel,undefined);
 assert.equal(changes.colorName,undefined);
 assert.equal(changes.shape,undefined,'No inferir forma por nombre cuando el recipiente ya es distinto');
 assert.equal(JSON.stringify(existing),before);
 assert.equal(core.missingFields({...existing,validated:true},p).shape,undefined);
 const unknown={name:'Hemograma',sample:'',vessel:''};
 assert.equal(core.missingFields(unknown,p).shape,'tube');
 const conflictingSample={name:'Hemograma',sample:'Suero',vessel:''};
 const safe=core.missingFields(conflictingSample,p);
 assert.equal(safe.vessel,undefined,'No recomendar tubo EDTA si el laboratorio configuró Suero');
 assert.equal(safe.colorName,undefined);
 assert.equal(safe.volume,undefined);
 const conflictingColor={name:'Hemograma',sample:'',vessel:'',colorName:'Rojo',color:'#cf4352'};
 const safeColor=core.missingFields(conflictingColor,p);
 assert.equal(safeColor.sample,'Sangre total con EDTA');
 assert.equal(safeColor.vessel,undefined,'No se combina una tapa roja preexistente con EDTA lila');
 assert.equal(safeColor.shape,undefined);
});

test('Interfaz segura, revisión de administrador y recurso PWA',()=>{
 new vm.Script(auto);
 assert.match(auto,/member\(\)\?\.active===true&&member\(\)\?\.role==='admin'/);
 assert.match(auto,/Aplicar sugerencia a campos vacíos/);
 assert.match(auto,/Configuración automática/);
 assert.match(auto,/auditAdd/);
 assert.doesNotMatch(auto,/\.upsert\(|\.delete\(|\.insert\(|\.from\('services'\)/);
 assert.ok(html.includes('./catalog-auto-config.js?v=20261119-autoconfig-modal2'));
 assert.ok(html.includes('./catalog-auto-config.css?v=20261119-autoconfig-modal2'));
 assert.ok(sw.includes("'./catalog-auto-config.js'"));
 assert.ok(sw.includes("'./catalog-auto-config.css'"));
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/#settings-catalog \.catalog-auto-open\[hidden\]/);
});


test('Gestión y carga de pruebas únicamente desde Configuración, fuera del catálogo de consulta',()=>{
 assert.match(html,/id="settings-catalog"/);
 assert.match(html,/id="catalogHeaderActions"/);
 assert.match(html,/id="catalogArchivedPanel"/);
 assert.match(auto,/const actions=\$\('catalogHeaderActions'\)/);
 assert.match(auto,/actions\.append\(button\)/);
 assert.doesNotMatch(auto,/newTest\.insertAdjacentElement\('beforebegin',button\)/);
 assert.match(css,/#settings-catalog #catalogHeaderActions\s*\{/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
 assert.match(css,/writing-mode:horizontal-tb!important/);
 assert.match(css,/word-break:normal!important/);
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
 assert.equal(core.missingFields({...legacy,validated:true},cbc).colorName,'Morado');
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
 assert.match(html,/oninput="queueCatalogSearch\(\)"/);
 assert.match(html,/function catalogSearchMatches\(t,term\)/);
 assert.match(html,/'tp':\['tiempo de protrombina'/);
 assert.match(html,/function queueCatalogSearch\(\)/);
});

test('Preparación agrupada requiere autorización y confirmación y conserva pendientes clínicos',()=>{
 assert.match(auto,/async function applyReviewedBatch\(\)/);
 assert.match(auto,/if\(!authorized\(\)\)return/);
 assert.doesNotMatch(auto,/window\.confirm\('Se prepararán '/);
 assert.match(auto,/const updated=\{\.\.\.item,\.\.\.match\.fields,updatedAt:now/);
 assert.match(auto,/state\.catalog\[index\]=updated/);
 assert.match(auto,/const placeholders=state\.catalog\.map/);
 assert.match(auto,/if\(!core\.isLegacyPlaceholder\(row\)\)continue/);
 assert.match(auto,/window\.addEventListener\('flebo:cloud-state-applied'/);
 assert.match(auto,/if\(!api\.save\(\)\)/);
 assert.match(auto,/await window\.FleboCloudSync\.syncNow\(\{verify:true\}\)/);
 assert.match(auto,/name\.addEventListener\('change',\(\)=>\{applyToForm\(\);updateForm\(\);\}\)/);
 assert.match(html,/window\.FleboAutoConfig\?\.applyToForm\?\.\(\)/);
 assert.match(html,/Color de tapa pendiente/);
 assert.doesNotMatch(html,/id="testValidated"/);
 assert.match(html,/id="testActive"/);
 assert.match(auto,/flebo:cloud-sync-ready/);
 assert.match(auto,/autoCompleteFromCloud/);
});


test('Amplía propuestas específicas sin inventar color en analíticas con tubos alternativos',()=>{
 assert.ok(core.referenceCount>=17,'La biblioteca ampliada incluye al menos 17 fichas');
 for(const [name,sample] of [
  ['TSH ultrasensible','Suero'],['Tiroxina libre (T4 libre)','Suero'],
  ['Ferritina','Suero'],['Colesterol total','Suero'],['Creatinina sérica','Suero'],
  ['Triglicéridos','Suero'],['PSA total','Suero'],['Beta-hCG cuantitativa','Suero'],
  ['Glucosa aleatoria','Suero'],['ACTH plasmática','Plasma EDTA']
 ]){
  const p=core.suggest(name);
  assert.ok(p,'No reconoció '+name);
  assert.equal(p.level,'specific');
  assert.equal(p.fields.sample,sample);
  assert.ok(p.fields.vessel,'Falta recipiente: '+name);
  assert.match(p.url,/mayocliniclabs\.com/);
 }
 assert.equal(core.suggest('TSH ultrasensible').fields.colorName,'');
 assert.equal(core.suggest('Ferritina').fields.colorName,'');
 assert.equal(core.suggest('TSH ultrasensible').fields.color,'');
 assert.equal(core.suggest('ACTH plasmática').fields.colorName,'Morado');
 assert.equal(core.suggest('Tiempo de protrombina (TP)').fields.colorName,'Celeste');
 assert.equal(core.suggest('Hemograma completo (CBC)').fields.colorName,'Morado');
});

test('Muestras explícitas no infieren color o aditivo por pertenecer a una categoría',()=>{
 for(const [name,sample] of [
  ['Ácido úrico urinario','Orina'],
  ['ACTH no específica en plasma','Plasma (anticoagulante por definir)'],
  ['Beta-D-glucano sérico','Suero'],
  ['Ascaris lumbricoides huevos en heces','Heces'],
  ['Análisis de líquido seminal (espermatograma)','Semen'],
  ['Aspergillus galactomanano en lavado broncoalveolar','Lavado broncoalveolar']
 ]){
  const found=core.suggest(name);
  assert.ok(found,name);
  assert.equal(found.level,'sample_only',name);
  assert.equal(found.fields.sample,sample);
  assert.equal(found.fields.vessel,'');
  assert.equal(found.fields.colorName,'');
 }
 assert.equal(core.explicitlyNamedSample('Líquido sin definir'),'');
 assert.equal(core.suggest('Glucosa'),null);
});

test('El verde ficticio se neutraliza sin inventar un color para muestras parciales',()=>{
 const legacy={name:'Ácido úrico urinario',sample:'',vessel:'',colorName:'Verde',color:'#237C49',shape:'tube',validated:false};
 const changes=core.missingFields(legacy,core.suggest(legacy.name));
 assert.equal(changes.sample,'Orina');
 assert.equal(changes.colorName,'');
 assert.equal(changes.color,'#94A3B8');
 assert.equal(changes.shape,'');
 assert.equal(core.missingFields({...legacy,validated:true},core.suggest(legacy.name)).sample,'Orina');
});

test('Todas las pruebas pendientes pueden filtrarse por nivel y buscarse para revisión',()=>{
 assert.match(auto,/Configuración de muestras y recipientes/);
 assert.match(auto,/function renderReviewRows\(\)/);
 assert.match(auto,/reviewMode='all'/);
 assert.match(auto,/Sin fuente suficiente/);
 assert.match(auto,/Color por confirmar/);
 assert.match(auto,/search\.addEventListener\('input'/);
 assert.match(auto,/reviewLimit\+=60/);
 assert.match(css,/catalog-auto-review-tools/);
});

test('Importación sin datos no atribuye tubo verde ni otro color clínico',()=>{
 assert.match(importer,/color:'#94A3B8',colorName:item\.colorName\|\|'',shape:/);
 assert.doesNotMatch(importer,/colorName:'Verde',shape:'tube'/);
 assert.match(html,/<option value="">Sin definir<\/option><option value="tube">Tubo/);
 assert.match(dom,/shape:item\.shape\|\|f\.shape\|\|''/);
 assert.match(dom,/shape:f\.vessel\?f\.shape\|\|''/);
 assert.match(dom,/colorName:f\.vessel\?f\.colorName\|\|''/);
});

test('La búsqueda por siglas obtiene TP, TTPa, hemograma CBC y evita coincidencias extrañas',()=>{
 const start=html.indexOf('function normalizeCatalogSearch(text){');
 const end=html.indexOf('function showMoreCatalog(){',start);
 assert.ok(start>0&&end>start,'El motor de búsqueda está definido');
 const search=vm.runInNewContext(html.slice(start,end)+';({normalizeCatalogSearch,catalogSearchMatches})');
 const run=(t,q)=>search.catalogSearchMatches({name:t,sample:'',vessel:'',code:'',testCode:''},search.normalizeCatalogSearch(q));
 assert.equal(run('Tiempo de protrombina (TP)','TP'),true);
 assert.equal(run('Tiempo de protrombina','tp'),true);
 assert.equal(run('Tiempo de tromboplastina parcial activada','ttpa'),true);
 assert.equal(run('Perfil lipídico','pl'),true);
 assert.equal(run('Terapia hepática','tp'),false);

 assert.equal(run('Prueba de mezcla de TP','tp'),true);
 assert.equal(run('Tiempo de tromboplastina parcial activada (TTPa)','TTPA'),true);
 assert.equal(run('Hemograma completo (CBC)','CBC'),true);
 assert.equal(run('Hemoglobina glicosilada (HbA1c)','hba1c'),true);
 assert.equal(run('Ferritina','TP'),false);
 assert.equal(run('ANTIDOPING THC-COC','TP'),false);
 assert.equal(run('Hemograma completo (CBC)','hemograma'),true);
});

test('Gestión de pruebas alojada en Configuración y biblioteca separada',()=>{
 const library=html.slice(html.indexOf('id="view-catalog"'),html.indexOf('id="view-reports"'));
 const config=html.slice(html.indexOf('id="settings-catalog"'),html.indexOf('id="settings-templates"'));
 assert.doesNotMatch(library,/id="catalogHeaderActions"|catalogImportOpen|fr2-catalog-new/);
 assert.match(config,/id="catalogHeaderActions"/);
 assert.match(config,/onclick="startNewCatalogTest\(\)"/);
 assert.match(config,/id="catalogArchivedPanel"/);
 assert.match(html,/oninput="queueCatalogSearch\(\)"/);
});

test('Solo activas e inactivas; volúmenes documentados y sin aprobación manual obligatoria',()=>{
 assert.match(html,/id="testActive"/);
 assert.match(html,/option value="inactive"/);
 assert.match(html,/Pruebas inactivas/);
 assert.doesNotMatch(html,/id="testValidated"/);
 assert.doesNotMatch(auto,/Revisión clínica obligatoria/);
 assert.doesNotMatch(auto,/Falta validarlas según el laboratorio/);
 assert.match(auto,/flebo:cloud-sync-ready/);
 assert.match(auto,/autoCompleteFromCloud/);
 assert.match(html,/active:\$\('testActive'\)\.value==='active'/);
 assert.equal(core.suggest('Hemograma completo (CBC)').fields.volume.includes('3 mL'),true);
 assert.equal(core.suggest('Hemoglobina glicosilada').fields.volume.includes('3 mL'),true);
 assert.equal(core.suggest('Tiempo de protrombina (TP)').fields.volume.includes('1 mL'),true);
 assert.equal(core.suggest('Urocultivo').fields.volume.includes('4 mL'),true);
 assert.equal(core.suggest('Ácido úrico urinario').fields.volume,'');
 assert.equal(core.suggest('Ácido úrico urinario').fields.colorName,'');
 const p=core.suggest('Hemograma completo (CBC)');
 assert.equal(core.missingFields({sample:'',volume:'',validated:true},p).volume,p.fields.volume);
 assert.equal(core.missingFields({sample:'Sangre local',volume:'2 mL'},p).volume,undefined);
});


test('Un recipiente registrado conserva su icono aun sin color, sin mostrar interrogación ni colores ficticios',()=>{
 const normalizeLine=html.match(/function normalizeCatalogSearch\(text\)\{[^\n]+\}/)?.[0];
 assert.ok(normalizeLine,'Normalizador del catálogo disponible');
 const start=html.indexOf('function specimenVesselShape(test){');
 const end=html.indexOf('function updateCompanyPreview(){',start);
 assert.ok(start>0&&end>start,'La representación del recipiente está disponible');
 const source=normalizeLine+'\n'+html.slice(start,end)+';({specimenVesselShape,specimenVesselColor,vesselSvg})';
 const visual=vm.runInNewContext(source,{esc:x=>String(x)});
 const jar={name:'Urocultivo',sample:'Orina',vessel:'Recipiente estéril',shape:'tube',colorName:'',color:'#237c49'};
 assert.equal(visual.specimenVesselShape(jar),'jar','Recipiente debe ser envase, aunque exista forma heredada incorrecta');
 const jarIcon=visual.vesselSvg(jar);
 assert.match(jarIcon,/Envase o frasco registrado/);
 assert.doesNotMatch(jarIcon,/\?/);
 assert.doesNotMatch(jarIcon,/#237c49/i);
 const pendingTube={name:'Prueba por revisar',vessel:'Tubo de recolección',shape:'tube',colorName:'',color:'#237c49'};
 assert.equal(visual.specimenVesselShape(pendingTube),'tube');
 const pendingIcon=visual.vesselSvg(pendingTube);
 assert.match(pendingIcon,/con color de tapa pendiente/);
 assert.doesNotMatch(pendingIcon,/\?/);
 assert.doesNotMatch(pendingIcon,/#237c49/i);
 const approved={vessel:'Tubo con EDTA',shape:'tube',colorName:'Morado',color:'#237c49'};
 assert.equal(visual.specimenVesselColor(approved),'#8258bf','El color documentado prevalece sobre el color visual obsoleto');
 assert.match(visual.vesselSvg(approved),/#8258bf/);
 const generic={vessel:'Medio de transporte específico',shape:'',colorName:''};
 assert.equal(visual.specimenVesselShape(generic),'generic');
 assert.match(visual.vesselSvg(generic),/forma por confirmar/);
 const missing={vessel:'',shape:'tube',colorName:'Morado'};
 assert.equal(visual.specimenVesselShape(missing),'');
 assert.match(visual.vesselSvg(missing),/Recipiente por configurar/);
 assert.match(html,/Color de tapa pendiente/);
 assert.match(html,/Color de tapa \(si aplica\)/);
});


test('La limpieza de colores heredados requiere confirmación administrativa y no elimina pruebas',()=>{
 assert.match(auto,/async function clearLegacyPlaceholders\(\)/);
 assert.match(auto,/core\.isLegacyPlaceholder\(item\)/);
 assert.match(auto,/window\.confirm\('Se corregirán '/);
 assert.match(auto,/colorName:'',color:'#94A3B8',shape:''/);
 assert.match(auto,/Corregir '\+legacyCount\+' colores verdes sin respaldo/);
 assert.doesNotMatch(auto,/\.splice\(.*catalog/);
});

test('Abrir ficha abre una ventana flotante, mantiene el editor original y cierra al guardar',()=>{
 assert.match(auto,/function openEditor\(id\)/);
 assert.match(auto,/function closeEditor\(\)/);
 assert.match(auto,/window\.editTest\(id\)/);
 assert.match(auto,/form\.parentNode\.replaceChild\(editorMarker,form\)/);
 assert.match(auto,/dialog\.setAttribute\('role','dialog'\)/);
 assert.match(auto,/dialog\.setAttribute\('aria-modal','true'\)/);
 assert.match(auto,/dialog\.append\(heading,form\)/);
 assert.match(auto,/openEditor\(id\)/);
 assert.match(html,/window\.FleboAutoConfig\?\.closeEditor\?\.\(\)/);
 assert.match(css,/\.catalog-auto-editor-overlay/);
 assert.match(css,/\.catalog-auto-editor-dialog/);
 assert.match(css,/overflow-y:auto/);
});

test('Configuración identificable y color heredado se corrigen sin pedir aprobación por ficha',()=>{
 assert.match(auto,/async function autoCompleteFromCloud\(\)/);
 assert.match(auto,/async function applyReviewedBatch\(\)/);
 assert.match(auto,/if\(!catalog\(\)\.some\(item=>!!eligible\(item\)\|\|core\.isLegacyPlaceholder\(item\)\)\)return/);
 assert.match(auto,/state\.catalog\[index\]=\{\.\.\.row,colorName:'',color:'#94A3B8',shape:'',updatedAt:now\}/);
 assert.match(auto,/catalogBatchBusy=true/);
 assert.match(auto,/await window\.FleboCloudSync\.syncNow\(\{verify:true\}\)/);
});
