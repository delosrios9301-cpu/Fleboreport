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
   colorName:'',color:'',shape:'tube',volume:opt.volume||'',method:opt.method||'',
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
   color:'#9670BD',shape:'tube',volume:'Mayo: 3 mL de sangre total EDTA (verificar requisito local)',fasting:'No suele requerir ayuno si se realiza solo el hemograma; confirmar si se solicitan otros exámenes.',conditions:'Evitar coágulos; conservar y transportar según el protocolo del laboratorio procesador.',
   instructions:'Enviar en tubo original; no alicuotar. Verificar volumen y estabilidad con el laboratorio receptor.',
   source:'Mayo Clinic Laboratories · CBC',url:'https://www.mayocliniclabs.com/test-catalog/Overview/9109'},
  {id:'hba1c',label:'Hemoglobina A1c',aliases:['hba1c','hba 1c','hemoglobina a1c','hemoglobina glicosilada','hemoglobina glucosilada','hemoglobina glicada','glicohemoglobina','hemoglobina glicosilada hba1c','hemoglobina a1c hba1c','hgb a1c'],
   sample:'Sangre total con EDTA',vessel:'Tubo con EDTA (tapa lila)',colorName:'Morado',
   color:'#9670BD',shape:'tube',volume:'Mayo: 3 mL de sangre total EDTA (verificar requisito local)',conditions:'Evitar coagulación; conservar y transportar según protocolo del laboratorio.',
   instructions:'Enviar en tubo original; no alicuotar. El volumen requerido debe verificarse localmente.',
   source:'Mayo Clinic Laboratories · HBA1C',url:'https://www.mayocliniclabs.com/test-catalog/overview/82080'},
  {id:'pt',label:'Tiempo de protrombina / INR',aliases:['tiempo de protrombina','tiempo de protrombina inr','pt inr','tp inr','protime inr','tiempo de protrombina tp'],
   sample:'Plasma citratado',vessel:'Tubo de citrato de sodio al 3,2 % (tapa celeste)',
   colorName:'Celeste',color:'#79BEDC',shape:'tube',volume:'Mayo: 1 mL de plasma pobre en plaquetas para envío (llenar correctamente el tubo azul)',method:'Coagulométrico (turbidimétrico)',
   conditions:'Respetar la proporción sangre/citrato y el llenado correcto. Confirmar centrifugación y estabilidad con el laboratorio.',
   instructions:'El tubo de recolección y el recipiente de envío pueden ser distintos; verificar procedimiento local.',
   source:'Mayo Clinic Laboratories · PTTP',url:'https://www.mayocliniclabs.com/test-catalog/Overview/40934'},
  {id:'urine-culture',label:'Urocultivo',aliases:['urocultivo','cultivo de orina','cultivo urinario'],
   sample:'Orina',vessel:'Envase limpio para recolección; transporte en tubo con ácido bórico según el método URNS de Mayo',colorName:'',
   color:'',shape:'jar',volume:'Mayo URNS: 4 mL en tubo de transporte con ácido bórico',
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
    fields:{sample:r.sample,vessel:r.vessel,colorName:r.colorName,color:r.color,shape:r.shape,volume:r.volume||'',method:r.method||'',fasting:r.fasting||'',
     conditions:r.conditions,instructions:r.instructions}};
  }
  const sample=explicitlyNamedSample(name);
  if(!sample)return null;
  return {id:'sample-hint',label:'Muestra indicada en el nombre',source:'Texto del nombre, sin referencia de recipiente',url:'',level:'sample_only',
   fields:{sample,vessel:'',colorName:'',color:'',shape:'',volume:'',method:'',fasting:'',conditions:'',instructions:''}};
 }
 const editable=['sample','vessel','colorName','shape','volume','method','fasting','conditions','instructions'];
 function isLegacyPlaceholder(test){
  // Importación histórica asignaba Verde/tube sin conocer muestra ni recipiente.
  // Una configuración real, aprobada o con datos clínicos, no se considera placeholder.
  return !!test&&!String(test.sample||'').trim()&&!String(test.vessel||'').trim()
   &&String(test.colorName||'').toLocaleLowerCase('es')==='verde'
   &&String(test.color||'').toLowerCase()==='#237c49'
   &&String(test.shape||'')==='tube';
 }
 function missingFields(test,proposal){
  if(!proposal)return {};
  const legacy=isLegacyPlaceholder(test),out={};
  // Una muestra o recipiente YA configurados por un laboratorio prevalecen.
  // Si difieren de la referencia, no añadir un aditivo/color/volumen
  // incompatible solo porque el nombre de la prueba coincida.
  const sampleConflict=!!String(test?.sample||'').trim()&&!!proposal.fields.sample
   &&normalize(test.sample)!==normalize(proposal.fields.sample);
  const vesselConflict=!!String(test?.vessel||'').trim()&&!!proposal.fields.vessel
   &&normalize(test.vessel)!==normalize(proposal.fields.vessel);
  for(const key of editable){
   if(!proposal.fields[key])continue;
   if(sampleConflict&&key!=='sample')continue;
   if(vesselConflict&&['vessel','colorName','shape','volume','conditions','instructions'].includes(key))continue;
   if(!test||!String(test[key]||'').trim()||(legacy&&['colorName','shape'].includes(key)))out[key]=proposal.fields[key];
  }
  if(out.colorName&&proposal.fields.color)out.color=proposal.fields.color;
  // El color verde heredado de una importación no representa un tubo clínico.
  // Sin referencia específica, pasar a "sin color validado", NO conservar verde.
  if(legacy&&!proposal.fields.colorName&&(out.sample||out.vessel)){
   out.colorName='';out.color='#94A3B8';
   if(!proposal.fields.shape)out.shape='';
  }
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
  color:'testColor',shape:'testShape',volume:'testVolume',method:'testMethod',fasting:'testFasting',conditions:'testConditions',instructions:'testInstructions'};
 const member=()=>window.FleboAuth?.membership;
 const authorized=()=>member()?.active===true&&member()?.role==='admin';
 function catalog(){const rows=window.FleboAppState?.get?.()?.catalog;return Array.isArray(rows)?rows:[];}
 function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
 function currentFormRecord(){const id=$('catalogEditId')?.value;return id?catalog().find(row=>String(row.id)===id):null;}
 function eligible(record){
  if(!record||record.active===false)return null;
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
  button.hidden=!hasFields;
  button.disabled=!hasFields;
  if(!name)note.textContent='Escribe una prueba para buscar coincidencias exactas en las referencias disponibles.';
  else if(!suggestion)note.textContent='No hay una coincidencia inequívoca. Configura la prueba según el protocolo del laboratorio; no se asignará ningún recipiente ni color.';
  else if(!hasFields)note.textContent='Los campos sugeridos ya están completos. Comprueba que corresponden al método de tu laboratorio.';
  else if(suggestion.level==='sample_only')note.textContent='Muestra deducida del nombre: '+suggestion.fields.sample+'. El tipo de tubo, el aditivo y el color siguen sin referencia: no se asignarán automáticamente.';
  else note.textContent='Referencia específica: '+suggestion.label+'. Completaría '+Object.keys(pending).filter(k=>k!=='color').length+' campo(s) vacío(s), sin reemplazar datos existentes. '+(suggestion.fields.colorName?'Color respaldado: '+suggestion.fields.colorName+'.':'Tubo con alternativas: color pendiente de protocolo local.');
  source.replaceChildren();
  if(suggestion?.url){
   const link=el('a','','Ver fuente técnica: '+suggestion.source);
   link.href=suggestion.url;link.target='_blank';link.rel='noopener noreferrer';
   source.append(link);
  }
  button.dataset.suggestedName=suggestion?core.normalize(name):'';
 }
 function applyToForm(){
  if(!authorized())return;
  const name=$('testName')?.value||'',current=currentFormRecord(),suggestion=core.suggest(name);
  if(!suggestion)return;
  const changes=core.missingFields(current||{},suggestion),legacy=core.isLegacyPlaceholder(current);
  let applied=0;
  for(const [key,id] of Object.entries(formFields)){
   if(!Object.prototype.hasOwnProperty.call(changes,key))continue;
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
  const msg=$('catalogAutoMessage');
  if(msg)msg.textContent=applied+' campo(s) completado(s) con datos identificados. Los campos sin fuente suficiente permanecen vacíos. Guarda la prueba si modificaste su ficha.';
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
  const old=candidates.map(x=>({index:x.index,original:x.item}));
  const now=new Date().toISOString();
  for(const {item,index,match} of candidates){
   state.catalog[index]={...item,...match.fields,updatedAt:now,autoConfigSource:match.proposal.source,autoConfigUrl:match.proposal.url};
  }
  if(!api.save()){
   for(const {index,original} of old)state.catalog[index]=original;
   window.toast?.('No se pudo guardar la configuración. No se modificó el catálogo en la nube.');
   return;
  }
  api.refresh();
  if(typeof window.auditAdd==='function'){
   window.auditAdd('Catálogo de pruebas','Completó automáticamente '+candidates.length+' fichas con datos respaldados o muestra explícita, sin inventar colores ni volúmenes');
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
   ?'Datos identificados sincronizados. Los campos sin protocolo específico permanecen sin definir.'
   :'Cambios guardados localmente; sincronización pendiente. Los campos desconocidos siguen sin definir.';
 }
 let autoCompleting=false;
 async function autoCompleteFromCloud(){
  // Solo tras recibir la versión actual de la nube y con permisos administrativos.
  // Sin aprobaciones ni cambios en la disponibilidad (activa/inactiva).
  if(autoCompleting||!authorized()||!window.FleboCloudSync?.status?.ready)return;
  if(!catalog().some(item=>eligible(item)))return;
  autoCompleting=true;
  try{await applyReviewedBatch();}
  finally{autoCompleting=false;}
 }
 let reviewQuery='',reviewMode='all',reviewLimit=60;
 function renderReviewRows(){
  const host=$('catalogAutoReviewRows'),summary=$('catalogAutoReviewSummary');
  if(!host)return;
  const active=catalog().filter(t=>t&&t.active!==false);
  const all=active.map(item=>({item,proposal:core.suggest(item.name),match:eligible(item)}));
  const exact=all.filter(x=>x.proposal?.level==='specific').length;
  const partial=all.filter(x=>x.proposal?.level==='sample_only').length;
  if(summary)summary.textContent=all.length+' pruebas activas: '+exact+' con referencia específica, '+partial+' con muestra explícita y '+(all.length-exact-partial)+' sin referencia suficiente. La actividad no implica que los datos de recolección estén completos.';
  const q=core.normalize(reviewQuery);
  const shown=all.filter(x=>{
   const level=x.proposal?.level||'pending';
   if(reviewMode!=='all'&&level!==reviewMode)return false;
   return !q||core.normalize([x.item.name,x.item.code,x.item.sample,x.item.vessel,x.proposal?.label].join(' ')).includes(q);
  });
  host.replaceChildren();
  if(!shown.length){host.append(el('p','catalog-auto-help','No hay pruebas que coincidan con esta búsqueda.'));return;}
  for(const {item,proposal} of shown.slice(0,reviewLimit)){
   const row=el('article','catalog-auto-entry'),body=el('div','catalog-auto-entry-text');
   const mark=proposal?.level==='specific'?'Referencia específica':proposal?.level==='sample_only'?'Solo muestra':'Sin fuente suficiente';
   const detail=proposal?.level==='specific'
    ?[proposal.fields.sample,proposal.fields.vessel,proposal.fields.colorName?'Tapa '+proposal.fields.colorName:'Color por confirmar'].filter(Boolean).join(' · ')
    :proposal?.level==='sample_only'?proposal.fields.sample+' · Tubo y color por confirmar'
    :'Requiere referencia del laboratorio; no se asigna muestra, tubo ni color';
   body.append(el('strong','',item.name),el('small','',mark+' · '+detail));
   const btn=el('button','btn','Abrir ficha');btn.type='button';btn.dataset.catalogAutoId=String(item.id);
   row.append(body,btn);host.append(row);
  }
  if(shown.length>reviewLimit){
   const more=el('button','btn','Mostrar más ('+reviewLimit+' de '+shown.length+')');
   more.type='button';more.addEventListener('click',()=>{reviewLimit+=60;renderReviewRows();});
   host.append(more);
  }
 }
 function renderList(){
  const list=$('catalogAutoList'),button=$('catalogAutoOpen');
  if(!list)return;
  const member=window.FleboAuth?.membership;
  const canCreate=!!(member?.active===true&&
   (member.role==='admin'||(typeof window.fleboCan==='function'&&window.fleboCan('catalog','create'))));
  const newButton=$('catalogHeaderActions')?.querySelector('.fr2-catalog-new');
  if(newButton)newButton.hidden=!canCreate;
  const can=authorized();
  if(button)button.hidden=!can;
  if(!can){list.replaceChildren();return;}
  if(!listOpen)return;
  const candidates=catalog().filter(item=>eligible(item));
  list.replaceChildren();
  list.append(el('h3','','Configuración de muestras y recipientes'));
  list.append(el('p','catalog-auto-help','La aplicación completa automáticamente solo los datos identificables. Si falta una referencia del laboratorio, el tubo, color, volumen o condición se muestran sin definir; no se inventan.'));
  const summary=el('p','catalog-auto-help');summary.id='catalogAutoReviewSummary';summary.setAttribute('role','status');
  list.append(summary);
  const controls=el('div','catalog-auto-batch-controls');
  const batch=el('button','btn catalog-auto-batch','Completar '+candidates.length+' prueba(s) identificables');
  batch.type='button';batch.disabled=!candidates.length;
  batch.addEventListener('click',()=>{void applyReviewedBatch();});
  const status=el('p','catalog-auto-help');status.id='catalogAutoBatchStatus';status.setAttribute('role','status');
  controls.append(batch,status);list.append(controls);
  const search=el('input','catalog-auto-review-search');
  search.type='search';search.placeholder='Buscar prueba o condición…';search.value=reviewQuery;
  search.setAttribute('aria-label','Buscar fichas de pruebas');
  search.addEventListener('input',()=>{reviewQuery=search.value;reviewLimit=60;renderReviewRows();});
  const mode=el('select','catalog-auto-review-filter');mode.setAttribute('aria-label','Filtrar nivel de evidencia');
  for(const [id,label] of [['all','Todas las activas'],['specific','Referencia específica'],['sample_only','Solo muestra conocida'],['pending','Sin referencia suficiente']]){
   const option=el('option','',label);option.value=id;mode.append(option);
  }
  mode.value=reviewMode;
  mode.addEventListener('change',()=>{reviewMode=mode.value;reviewLimit=60;renderReviewRows();});
  const tools=el('div','catalog-auto-review-tools');tools.append(search,mode);list.append(tools);
  const host=el('div','catalog-auto-review-rows');host.id='catalogAutoReviewRows';list.append(host);
  renderReviewRows();
 }
 function mount(){
  const name=$('testName'),settings=$('settings-catalog'),view=$('view-catalog');
  if(!name||!settings||!view)return false;
  if(!$('catalogAutoForm')){
   const panel=el('section','catalog-auto-form');panel.id='catalogAutoForm';
   const header=el('div','catalog-auto-head');
   header.append(el('strong','','Configuración automática asistida'),el('span','','Sin validaciones individuales'));
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
   // El panel administrativo vive en Configuración → Catálogo.
   // No trasladar estas acciones a la biblioteca de consulta.
   const actions=$('catalogHeaderActions');
   if(!actions)return false;
   actions.append(button);
   const list=el('section','panel catalog-auto-list');list.id='catalogAutoList';list.hidden=true;
   list.addEventListener('click',event=>{
    const action=event.target.closest('button[data-catalog-auto-id]');
    if(!action||!authorized())return;
    const id=action.dataset.catalogAutoId;
    const row=catalog().find(item=>String(item.id)===id);
    if(!row||typeof window.editTest!=='function')return;
    window.editTest(id);
    setTimeout(updateForm,0);
   });
   actions.insertAdjacentElement('afterend',list);
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
  updateForm();renderList();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
 window.addEventListener('flebo:auth-changed',refresh);
 window.addEventListener('flebo:cloud-sync-ready',()=>{refresh();void autoCompleteFromCloud();});
 window.addEventListener('flebo:cloud-state-applied',()=>{refresh();});
 window.addEventListener('focus',refresh);
 window.FleboAutoConfig={updateForm,refresh,applyToForm,autoCompleteFromCloud};
})();