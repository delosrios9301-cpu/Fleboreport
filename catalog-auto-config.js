/* FleboReport · Configuración automática asistida del catálogo.
   Reglas específicas con referencias públicas: NO sustituyen el POE del laboratorio.
   Las sugerencias no se guardan sin revisión y confirmación del administrador. */
(function(root,factory){
 'use strict';
 const core=factory();
 if(typeof module==='object'&&module.exports)module.exports=core;
 if(root)root.FleboAutoConfigCore=core;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 function normalize(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
   .toLocaleLowerCase('es').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
 }
 function serumRule(id,label,aliases,url,options){
  const opt=options||{};
  return {id,label,aliases,sample:'Suero',
   vessel:'Preferido: tubo separador de suero (con gel). Alternativa: tubo rojo sin gel, según laboratorio.',
   colorName:'',color:'',shape:'tube',
   fasting:opt.fasting||'',conditions:opt.conditions||'Separar suero y transportar según protocolo del laboratorio procesador.',
   instructions:opt.instructions||'El color de la tapa del tubo separador no es universal. Validar marca, aditivo, tubo y recipiente de envío antes de aprobar.',
   source:'Mayo Clinic Laboratories · '+id,url};
 }
 const reference=Object.freeze([
  serumRule('stsh','TSH ultrasensible',
   ['tsh ultrasensible','tsh sensible','hormona estimulante de la tiroides tsh','tirotropina tsh','tsh serica'],
   'https://www.mayocliniclabs.com/test-catalog/overview/8939',
   {conditions:'Separar suero y centrifugar según el método; Mayo indica hacerlo dentro de 2 horas.'}),
  serumRule('frt4','Tiroxina libre T4',
   ['tiroxina libre t4 libre','t4 libre','tiroxina libre','free t4'],
   'https://www.mayocliniclabs.com/test-catalog/overview/8725',
   {fasting:'Consultar al laboratorio sobre suplementos con biotina antes de la toma.'}),
  serumRule('t3','Triyodotironina total T3',
   ['triyodotironina total t3','t3 total','triyodotironina total'],
   'https://www.mayocliniclabs.com/test-catalog/overview/8613'),
  serumRule('ferr1','Ferritina',
   ['ferritina','ferritina serica'],
   'https://www.mayocliniclabs.com/test-catalog/overview/619953',
   {fasting:'Revisar suplementos con biotina: Mayo recomienda evitar suplementos que la contengan 12 horas antes; confirmar protocolo local.'}),
  serumRule('chol','Colesterol total',
   ['colesterol total','colesterol total serico'],
   'https://www.mayocliniclabs.com/test-catalog/overview/8320'),
  serumRule('trig1','Triglicéridos',
   ['trigliceridos','trigliceridos sericos'],
   'https://www.mayocliniclabs.com/test-catalog/overview/616665',
   {fasting:'Registrar si el paciente está en ayunas; requerimiento depende del perfil y del laboratorio.'}),
  serumRule('crts1','Creatinina sérica',
   ['creatinina serica','creatinina en suero'],
   'https://www.mayocliniclabs.com/test-catalog/overview/48216'),
  serumRule('psa','PSA total',
   ['antigeno prostatico especifico total psa total','psa total','antigeno prostatico especifico total'],
   'https://www.mayocliniclabs.com/test-catalog/overview/9284'),
  serumRule('bhcg','Beta-hCG cuantitativa',
   ['beta hcg cuantitativa','beta hcg cuantitativa serica','beta gonadotropina corionica cuantitativa'],
   'https://www.mayocliniclabs.com/test-catalog/overview/61718',
   {fasting:'Confirmar posibles interferencias por biotina y uso clínico del ensayo con el laboratorio.'}),
  serumRule('glura','Glucosa aleatoria',
   ['glucosa aleatoria','glucosa al azar'],
   'https://www.mayocliniclabs.com/test-catalog/overview/89115',
   {fasting:'Sin ayuno requerido por tratarse de glucosa aleatoria; registrar hora y alimentación según laboratorio.'}),
  serumRule('sfec','Hierro y capacidad total de fijación',
   ['hierro serico','hierro y capacidad de fijacion','hierro y capacidad total de fijacion'],
   'https://www.mayocliniclabs.com/test-catalog/overview/621385',
   {fasting:'Ayuno de 8 horas preferible, no obligatorio según Mayo; verificar uso de suplementos de hierro con el laboratorio.'}),
  serumRule('bmama','Panel metabólico básico',
   ['panel metabolico basico','perfil metabolico basico'],
   'https://www.mayocliniclabs.com/test-catalog/overview/113630'),
  serumRule('rfama','Panel de función renal',
   ['perfil renal','panel de funcion renal'],
   'https://www.mayocliniclabs.com/test-catalog/overview/113634'),
  {id:'acth',label:'ACTH plasmática',aliases:['acth plasmatica','hormona adrenocorticotropica plasmatica'],
   sample:'Plasma EDTA',vessel:'Tubo EDTA preenfriado (tapa lila), luego alícuota de plasma en vial según laboratorio.',
   colorName:'Morado',color:'#9670BD',shape:'tube',
   fasting:'Consultar suplementación con biotina con el laboratorio.',
   conditions:'Referencia Mayo: toma preferentemente en la mañana, tubo frío y transporte sobre hielo; centrifugación refrigerada y congelación del plasma.',
   instructions:'Requiere manejo preanalítico urgente; confirmar recursos y estabilidad antes de programar.',
   source:'Mayo Clinic Laboratories · ACTH',url:'https://www.mayocliniclabs.com/test-catalog/Overview/800208'},
  {id:'cbc',label:'Hemograma completo',aliases:['hemograma','hemograma completo','biometria hematica','cuadro hematico','cbc','hemograma con diferencial','hemograma completo con diferencial','hemograma completo cbc','hemograma completo con formula leucocitaria'],
   sample:'Sangre total con EDTA',vessel:'Tubo con EDTA (tapa lila)',colorName:'Morado',
   color:'#9670BD',shape:'tube',fasting:'No suele requerir ayuno si se realiza solo el hemograma; confirmar si se solicitan otros exámenes.',conditions:'Evitar coágulos; conservar y transportar según el protocolo del laboratorio procesador.',
   instructions:'Enviar en tubo original; no alicuotar. Verificar volumen y estabilidad con el laboratorio receptor.',
   source:'Mayo Clinic Laboratories · CBC',url:'https://www.mayocliniclabs.com/test-catalog/Overview/9109'},
  {id:'hba1c',label:'Hemoglobina A1c',aliases:['hba1c','hba 1c','hemoglobina a1c','hemoglobina glicosilada','hemoglobina glucosilada','hemoglobina glicada','glicohemoglobina','hemoglobina glicosilada hba1c','hemoglobina a1c hba1c','hgb a1c'],
   sample:'Sangre total con EDTA',vessel:'Tubo con EDTA (tapa lila)',colorName:'Morado',
   color:'#9670BD',shape:'tube',conditions:'Evitar coagulación; conservar y transportar según protocolo del laboratorio.',
   instructions:'Enviar en tubo original; no alicuotar. El volumen requerido debe verificarse localmente.',
   source:'Mayo Clinic Laboratories · HBA1C',url:'https://www.mayocliniclabs.com/test-catalog/overview/82080'},
  {id:'pt',label:'Tiempo de protrombina / INR',aliases:['tiempo de protrombina','tiempo de protrombina inr','pt inr','tp inr','protime inr','tiempo de protrombina tp'],
   sample:'Plasma citratado',vessel:'Tubo de citrato de sodio al 3,2 % (tapa celeste)',
   colorName:'Celeste',color:'#79BEDC',shape:'tube',
   conditions:'Respetar la proporción sangre/citrato y el llenado correcto. Confirmar centrifugación y estabilidad con el laboratorio.',
   instructions:'El tubo de recolección y el recipiente de envío pueden ser distintos; verificar procedimiento local.',
   source:'Mayo Clinic Laboratories · PTTP',url:'https://www.mayocliniclabs.com/test-catalog/Overview/40934'},
  {id:'urine-culture',label:'Urocultivo',aliases:['urocultivo','cultivo de orina','cultivo urinario'],
   sample:'Orina',vessel:'Envase estéril para recolección de orina',colorName:'',
   color:'',shape:'jar',
   conditions:'Recolectar evitando contaminación; el conservante, el tiempo y la temperatura dependen del laboratorio procesador.',
   instructions:'Confirmar si la muestra se transportará en envase estéril o en tubo de transporte con conservante.',
   source:'Mayo Clinic Laboratories · URNS',url:'https://www.mayocliniclabs.com/test-catalog/Overview/60515'}
 ]);
 function explicitlyNamedSample(name){
  // La inferencia es estrictamente del tipo de muestra escrito en el nombre.
  // Nunca se deduce un aditivo ni un color por categoría (suero, orina, etc.).
  const n=normalize(name);
  const hints=[
   {label:'Orina',re:/\b(orina|urinaria|urinario|urinarias|urinarios|albuminuria|microalbuminuria)\b/},
   {label:'Heces',re:/\b(heces|fecal|fecales|coproparasitario|coprologico)\b/},
   {label:'Saliva',re:/\b(saliva|salival)\b/},
   {label:'Semen',re:/\b(semen|seminal|espermatograma)\b/},
   {label:'Lavado broncoalveolar',re:/\b(lavado broncoalveolar)\b/},
   {label:'Suero',re:/\b(suero|serico|serica|sericos|sericas)\b/},
   {label:'Plasma (anticoagulante por definir)',re:/\b(plasma|plasmatica|plasmatico|plasmaticas|plasmaticos)\b/},
   {label:'Sangre total (aditivo por definir)',re:/\b(sangre total)\b/}
  ].filter(rule=>rule.re.test(n));
  return hints.length===1?hints[0].label:'';
 }
 function suggest(name){
  const norm=normalize(name);
  if(!norm)return null;
  const found=reference.filter(rule=>rule.aliases.some(a=>normalize(a)===norm));
  if(found.length>1)return null; // Nunca elegir entre referencias contradictorias.
  if(found.length===1){
   const r=found[0];
   return {id:r.id,label:r.label,source:r.source,url:r.url,level:'specific',
    fields:{sample:r.sample,vessel:r.vessel,colorName:r.colorName,color:r.color,shape:r.shape,fasting:r.fasting||'',
     conditions:r.conditions,instructions:r.instructions}};
  }
  const sample=explicitlyNamedSample(name);
  if(!sample)return null;
  return {id:'sample-hint',label:'Muestra indicada en el nombre',source:'Texto del nombre, sin referencia de recipiente',url:'',level:'sample_only',
   fields:{sample,vessel:'',colorName:'',color:'',shape:'',fasting:'',conditions:'',instructions:''}};
 }
 const editable=['sample','vessel','colorName','shape','fasting','conditions','instructions'];
 function isLegacyPlaceholder(test){
  // Importación histórica asignaba Verde/tube sin conocer muestra ni recipiente.
  // Una configuración real, aprobada o con datos clínicos, no se considera placeholder.
  return !!test&&test.validated!==true&&!String(test.sample||'').trim()&&!String(test.vessel||'').trim()
   &&String(test.colorName||'').toLocaleLowerCase('es')==='verde'
   &&String(test.color||'').toLowerCase()==='#237c49'
   &&String(test.shape||'')==='tube';
 }
 function missingFields(test,proposal){
  if(!proposal||test?.validated===true)return {};
  const legacy=isLegacyPlaceholder(test),out={};
  for(const key of editable){
   if(!proposal.fields[key])continue;
   if(!test||!String(test[key]||'').trim()||(legacy&&['colorName','shape'].includes(key)))out[key]=proposal.fields[key];
  }
  if(out.colorName&&proposal.fields.color)out.color=proposal.fields.color;
  return out;
 }
 return {normalize,suggest,missingFields,isLegacyPlaceholder,explicitlyNamedSample,referenceCount:reference.length};
});
(function(){
 'use strict';
 if(typeof window==='undefined'||typeof document==='undefined')return;
 const core=window.FleboAutoConfigCore;
 if(!core)return;
 const $=id=>document.getElementById(id);
 let listOpen=false,initialized=false;
 const formFields={sample:'testSample',vessel:'testVessel',colorName:'testColorName',
  color:'testColor',shape:'testShape',fasting:'testFasting',conditions:'testConditions',instructions:'testInstructions'};
 const member=()=>window.FleboAuth?.membership;
 const authorized=()=>member()?.active===true&&member()?.role==='admin';
 function catalog(){const rows=window.FleboAppState?.get?.()?.catalog;return Array.isArray(rows)?rows:[];}
 function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
 function currentFormRecord(){const id=$('catalogEditId')?.value;return id?catalog().find(row=>String(row.id)===id):null;}
 function eligible(record){
  if(!record||record.active===false||record.validated===true)return null;
  const proposal=core.suggest(record.name);
  if(!proposal)return null;
  const fields=core.missingFields(record,proposal);
  return Object.keys(fields).some(k=>k!=='color')?{proposal,fields}:null;
 }
 function updateForm(){
  const section=$('catalogAutoForm'),name=$('testName')?.value?.trim(),current=currentFormRecord();
  if(!section)return;
  section.hidden=!authorized();
  if(section.hidden)return;
  const note=$('catalogAutoMessage'),button=$('catalogAutoApply'),source=$('catalogAutoSource');
  const suggestion=core.suggest(name);
  const pending=core.missingFields(current||{name},suggestion);
  const hasFields=Object.keys(pending).some(key=>key!=='color');
  button.hidden=!hasFields||current?.validated===true;
  button.disabled=!hasFields;
  if(!name)note.textContent='Escribe una prueba para buscar coincidencias exactas en las referencias disponibles.';
  else if(!suggestion)note.textContent='No hay una coincidencia inequívoca. Configura la prueba según el protocolo del laboratorio; no se asignará ningún recipiente ni color.';
  else if(current?.validated===true)note.textContent='El protocolo actual está confirmado. La sugerencia no modificará configuraciones aprobadas.';
  else if(!hasFields)note.textContent='Los campos sugeridos ya están completos. Comprueba que corresponden al método de tu laboratorio.';
  else note.textContent='Sugerencia detectada: '+suggestion.label+'. Completaría '+Object.keys(pending).filter(k=>k!=='color').length+' campo(s) vacío(s), sin reemplazar datos existentes.';
  source.replaceChildren();
  if(suggestion){
   const link=el('a','','Ver fuente técnica: '+suggestion.source);
   link.href=suggestion.url;link.target='_blank';link.rel='noopener noreferrer';
   source.append(link);
  }
  button.dataset.suggestedName=suggestion?core.normalize(name):'';
 }
 function applyToForm(){
  if(!authorized())return;
  const name=$('testName')?.value||'',current=currentFormRecord(),suggestion=core.suggest(name);
  if(!suggestion||current?.validated===true)return;
  const changes=core.missingFields(current||{},suggestion),legacy=core.isLegacyPlaceholder(current);
  let applied=0;
  for(const [key,id] of Object.entries(formFields)){
   if(!changes[key])continue;
   const input=$(id);
   if(!input)continue;
   // Solo sustituir el valor ficticio exacto; respetar cualquier corrección manual.
   const inherited=legacy&&((key==='colorName'&&input.value==='Verde')
    ||(key==='color'&&String(input.value).toLowerCase()==='#237c49')
    ||(key==='shape'&&input.value==='tube'));
   if(String(input.value||'').trim()&&!inherited&&(key!=='color'||input.value!=='#94a3b8'))continue;
   if(input.tagName==='SELECT'&&![...input.options].some(option=>option.value===changes[key]))continue;
   input.value=changes[key];applied++;
  }
  if($('testValidated'))$('testValidated').value='no';
  const msg=$('catalogAutoMessage');
  if(msg)msg.textContent=applied+' campo(s) rellenado(s) como propuesta. Comprueba con el protocolo del laboratorio y marca «Confirmado por el administrador» antes de guardar.';
  const audit=window.auditAdd;
  if(typeof audit==='function'&&applied)audit('Catálogo de pruebas','Preparó una propuesta sin guardar de '+name+'; fuente: '+suggestion.source);
  const apply=$('catalogAutoApply');if(apply)apply.hidden=true;
 }
 async function applyReviewedBatch(){
  if(!authorized())return;
  const api=window.FleboAppState,state=api?.get?.();
  if(!api||!state||!Array.isArray(state.catalog))return;
  const candidates=state.catalog.map((item,index)=>({item,index,match:eligible(item)})).filter(x=>x.match);
  if(!candidates.length)return;
  if(!window.confirm('Se propondrá la configuración de '+candidates.length+' prueba(s) reconocidas por nombre exacto. Solo se completarán campos vacíos y valores verdes ficticios de importaciones anteriores. Las pruebas quedarán pendientes de validación clínica; no se modificarán protocolos aprobados. ¿Continuar?'))return;
  const old=candidates.map(x=>({index:x.index,original:x.item}));
  const now=new Date().toISOString();
  for(const {item,index,match} of candidates){
   state.catalog[index]={...item,...match.fields,validated:false,updatedAt:now,autoConfigSource:match.proposal.source,autoConfigUrl:match.proposal.url};
  }
  if(!api.save()){
   for(const {index,original} of old)state.catalog[index]=original;
   window.toast?.('No se pudo guardar la configuración. No se modificó el catálogo en la nube.');
   return;
  }
  api.refresh();
  if(typeof window.auditAdd==='function'){
   window.auditAdd('Catálogo de pruebas','Preparó '+candidates.length+' configuraciones no validadas usando referencias identificadas por nombre exacto');
  }
  renderList();
  const status=$('catalogAutoBatchStatus');
  if(status)status.textContent=candidates.length+' propuesta(s) guardadas localmente. Confirmando sincronización…';
  let synced=false;
  try{
   synced=!!(window.FleboCloudSync?.syncNow&&await window.FleboCloudSync.syncNow({verify:true}));
   if(synced&&typeof window.FleboHomeCatalogRefresh==='function')void window.FleboHomeCatalogRefresh();
  }catch(error){console.warn('[Catálogo] Propuestas pendientes de sincronización:',error);}
  if(status)status.textContent=synced
   ?'Propuestas sincronizadas con la nube. Falta validarlas según el laboratorio antes de usarlas como protocolos.'
   :'Propuestas guardadas en este dispositivo; falta confirmar sincronización con la nube. No se han declarado validadas.';
 }
 function renderList(){
  const list=$('catalogAutoList'),count=$('catalogAutoCount'),button=$('catalogAutoOpen');
  if(!list)return;
  const can=authorized();
  if(button)button.hidden=!can;
  if(!can){list.replaceChildren();return;}
  const candidates=catalog().map(item=>({item,match:eligible(item)})).filter(x=>x.match);
  if(count)count.textContent=' ('+candidates.length+')';
  if(!listOpen)return;
  list.replaceChildren();
  list.append(el('h3','','Pruebas con sugerencias por revisar'));
  list.append(el('p','catalog-auto-help','Solo se muestran coincidencias exactas de la biblioteca de referencia. Revisar no modifica la prueba. La aprobación se realiza en Configuración.'));
  const controls=el('div','catalog-auto-batch-controls');
  const batch=el('button','btn catalog-auto-batch','Preparar '+candidates.length+' propuesta(s) reconocidas');
  batch.type='button';batch.disabled=!candidates.length;
  batch.addEventListener('click',()=>{void applyReviewedBatch();});
  const status=el('p','catalog-auto-help');status.id='catalogAutoBatchStatus';status.setAttribute('role','status');
  controls.append(batch,status);list.append(controls);
  if(!candidates.length){list.append(el('p','','No hay propuestas pendientes entre las pruebas reconocidas. Las demás requieren configuración manual.'));return;}
  for(const {item,match} of candidates.slice(0,100)){
   const row=el('article','catalog-auto-entry'),body=el('div','catalog-auto-entry-text');
   body.append(el('strong','',item.name),el('small','',match.proposal.fields.sample+' · '+match.proposal.fields.vessel));
   const btn=el('button','btn','Revisar');
   btn.type='button';btn.dataset.catalogAutoId=String(item.id);
   row.append(body,btn);list.append(row);
  }
  if(candidates.length>100)list.append(el('p','','Se muestran las primeras 100 propuestas. Usa el catálogo para revisar las demás.'));
 }
 function mount(){
  const name=$('testName'),settings=$('settings-catalog'),view=$('view-catalog');
  if(!name||!settings||!view)return false;
  if(!$('catalogAutoForm')){
   const panel=el('section','catalog-auto-form');panel.id='catalogAutoForm';
   const header=el('div','catalog-auto-head');
   header.append(el('strong','','Configuración automática asistida'),el('span','','Revisión clínica obligatoria'));
   const status=el('p','catalog-auto-help');status.id='catalogAutoMessage';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
   const source=el('div','catalog-auto-source');source.id='catalogAutoSource';
   const apply=el('button','btn');apply.type='button';apply.id='catalogAutoApply';apply.textContent='Aplicar sugerencia a campos vacíos';
   apply.addEventListener('click',applyToForm);
   panel.append(header,status,source,apply);
   const section=name.closest('.form-panel')||settings;
   const heading=section.querySelector('.section-description')||section.querySelector('#catalogFormTitle');
   heading?.insertAdjacentElement('afterend',panel);
   name.addEventListener('input',updateForm);
   // Al terminar de escribir una prueba reconocida, preparar la propuesta sin guardarla.
   name.addEventListener('change',()=>{applyToForm();updateForm();});
   $('testValidated')?.addEventListener('change',updateForm);
   section.addEventListener('click',event=>{
    if(event.target.closest('button[onclick*="resetTestForm"]'))setTimeout(updateForm,0);
   });
  }
  if(!$('catalogAutoOpen')){
   const button=el('button','btn catalog-auto-open','Configuración automática');
   button.type='button';button.id='catalogAutoOpen';button.dataset.permissionModule='catalog';button.dataset.permissionAction='edit';
   button.addEventListener('click',()=>{
    if(!authorized())return;
    listOpen=!listOpen;
    const host=$('catalogAutoList');
    if(host)host.hidden=!listOpen;
    button.setAttribute('aria-expanded',String(listOpen));
    renderList();
   });
   // Separar todas las acciones de la cabecera: el diseño original reserva
   // tres columnas solo para icono, título y una acción. Insertar un botón
   // adicional allí comprimía su texto verticalmente en móviles.
   const hero=view.querySelector('.fr2-catalog-hero');
   let actions=$('catalogHeaderActions');
   if(!actions){
    actions=el('div','catalog-auto-actions');
    actions.id='catalogHeaderActions';
    actions.setAttribute('role','group');
    actions.setAttribute('aria-label','Acciones del catálogo de pruebas');
    hero?.insertAdjacentElement('afterend',actions);
   }
   const newTest=view.querySelector('.fr2-catalog-new');
   const importButton=view.querySelector('#catalogImportOpen');
   if(newTest)actions.append(newTest);
   if(importButton)actions.append(importButton);
   actions.append(button);
   const list=el('section','panel catalog-auto-list');list.id='catalogAutoList';list.hidden=true;
   list.addEventListener('click',event=>{
    const action=event.target.closest('button[data-catalog-auto-id]');
    if(!action||!authorized())return;
    const id=action.dataset.catalogAutoId;
    const row=catalog().find(item=>String(item.id)===id);
    if(!eligible(row)||typeof window.editTest!=='function')return;
    window.editTest(id);
    setTimeout(updateForm,0);
   });
   (view.querySelector('.fr2-catalog-toolbar')||hero)?.insertAdjacentElement('afterend',list);
  }
  const catalogList=$('catalogList');
  if(catalogList&&!catalogList.dataset.catalogAutoWatch){
   catalogList.dataset.catalogAutoWatch='1';
   catalogList.addEventListener('click',()=>setTimeout(updateForm,0));
  }
  initialized=true;
  updateForm();renderList();return true;
 }
 function refresh(){
  if(!initialized){mount();return;}
  // La importación puede montarse después en navegadores de carga lenta.
  // Mantener las tres acciones fuera de la cuadrícula del encabezado.
  const actions=$('catalogHeaderActions'),view=$('view-catalog');
  const importButton=view?.querySelector('#catalogImportOpen');
  if(actions&&importButton&&importButton.parentElement!==actions){
   const auto=$('catalogAutoOpen');
   if(auto)actions.insertBefore(importButton,auto);else actions.append(importButton);
  }
  updateForm();renderList();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
 window.addEventListener('flebo:auth-changed',refresh);
 window.addEventListener('focus',refresh);
 window.FleboAutoConfig={updateForm,refresh,applyToForm};
})();