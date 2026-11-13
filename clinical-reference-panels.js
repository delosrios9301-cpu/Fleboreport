/* FleboReport · Estudios y Procesamiento · referencias visuales v303
   Capa de interfaz: conserva el catálogo clínico, las bandejas originales,
   los botones de transición y la sincronización existente. */
(function(){
 'use strict';
 const get=id=>document.getElementById(id);
 const icon={
  flask:'<path d="M9 3h6M10 3v7l-6 9a2 2 0 0 0 1.7 3h12.6a2 2 0 0 0 1.7-3l-6-9V3M7 16h10"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  sliders:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="white"/><circle cx="16" cy="12" r="2" fill="white"/><circle cx="9" cy="18" r="2" fill="white"/>',
  droplet:'<path d="M12 2s-7 8-7 13a7 7 0 0 0 14 0c0-5-7-13-7-13Z"/>',
  tubes:'<path d="M9 3h6M10 3v11l-4 5a2 2 0 0 0 2 3h8a2 2 0 0 0 2-3l-4-5V3M9 16h6"/>',
  layers:'<path d="m12 2 10 6-10 6L2 8l10-6ZM2 13l10 6 10-6M2 18l10 5 10-5"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  clipboard:'<rect x="4" y="5" width="16" height="17" rx="2"/><path d="M9 5V3h6v2M8 11h8M8 15h5"/>',
  database:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
  check:'<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 9a8 8 0 0 1 14-2l1 1M19 15a8 8 0 0 1-14 2l-1-1"/>',
  filter:'<path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  user:'<circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
  boxes:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M8 10h8M12 6v12"/>'
 };
 function svg(name,klass){
  const s=document.createElement('span');
  s.className=klass||'crx-icon';
  s.setAttribute('aria-hidden','true');
  s.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'+(icon[name]||icon.tubes)+'</svg>';
  return s;
 }
 function node(tag,klass,text){
  const e=document.createElement(tag);
  if(klass)e.className=klass;
  if(text!==undefined&&text!==null)e.textContent=String(text);
  return e;
 }
 function data(){
  try {return window.FleboAppState&&typeof window.FleboAppState.get==='function'?window.FleboAppState.get():null;}catch(_){return null}
 }
 function stateOf(sample){
  if(sample.workflowStatus)return sample.workflowStatus;
  return ({'Recibida':'REGISTRADO','En revisión':'EN_REVISION','Pendiente de procesamiento':'PENDIENTE_PROCESO','Procesando':'PROCESANDO','Procesada':'ALMACENAMIENTO_TEMPORAL','Almacenamiento temporal':'ALMACENAMIENTO_TEMPORAL','Almacenada':'CONGELADOR_DEFINITIVO'})[sample.status]||'REGISTRADO';
 }
 function makeHeader(title,subtitle,shape){
  const bar=node('header','crx-page-header');
  const row=node('div','crx-page-row');
  const heading=node('div','crx-page-title');
  heading.append(svg(shape,'crx-heading-symbol'),node('h1','',title));
  const dots=node('div','crx-heading-dots');
  dots.setAttribute('aria-hidden','true');
  for(let n=0;n<3;n++)dots.append(node('span',n===0?'is-active':''));
  row.append(heading,dots);
  bar.appendChild(row);
  if(subtitle)bar.append(node('p','crx-page-subtitle',subtitle));
  return bar;
 }
 function setSection(root,klass){
  const el=node('section',klass);
  root.appendChild(el);
  return el;
 }
 function pill(iconName,label){
  const tag=node('span','crx-meta-pill');
  tag.append(svg(iconName),node('span','',label));
  return tag;
 }
 function matches(q,fields){return !q||fields.some(v=>String(v||'').toLocaleLowerCase('es').includes(q));}
 function hasDeletePermission(){
  return !!(window.FleboAuth&&window.FleboAuth.membership&&window.FleboAuth.membership.role==='admin');
 }
 function notify(message){
  if(typeof window.toast==='function')window.toast(message);
  else console.info('[FleboReport]',message);
 }
 function sampleIcon(type){
  return /orina|urin|urine/i.test(type||'')?'droplet':'tubes';
 }
 function noData(message){return node('p','crx-empty',message);}
 function primaryButton(original,override){
  const b=node('button',/danger/i.test(original.className)?'crx-action danger':'crx-action',override||original.textContent.trim());
  b.type='button';
  b.disabled=!!original.disabled;
  b.addEventListener('click',()=>{if(!original.isConnected){notify('La bandeja cambió. Actualiza la vista.');return;}original.click();});
  return b;
 }
 function cardBase(theme){
  const card=node('article','crx-card crx-'+(theme||'violet'));
  return card;
 }
 // ESTUDIOS: tarjetas de protocolos reales y revisión de recepción.
 let studyTab='todos',studyQ='',studyStatus='todos';
 let studiesInitialized=false;
 function currentStudyTab(key){
  studyTab=key;
  const view=get('view-clinical-studies');
  if(!view)return;
  const catalog=get('crxStudyCatalog'),reception=get('crxStudyReception'),review=get('crxStudyReview');
  if(catalog)catalog.hidden=key!=='todos'&&key!=='catalogo';
  if(reception)reception.hidden=key!=='recepcion';
  if(review)review.hidden=key!=='todos'&&key!=='revision';
  view.querySelectorAll('.crx-study-tab').forEach(b=>{
   const selected=b.dataset.tab===key;
   b.classList.toggle('is-selected',selected);
   b.setAttribute('aria-selected',String(selected));
  });
  renderStudyCards();
  renderReviewCards();
 }
 function pickStudy(id){
  currentStudyTab('recepcion');
  const select=get('clinicalProcessStudy');
  if(select&&Array.from(select.options).some(o=>String(o.value)===String(id))){
   select.value=id;
   select.dispatchEvent(new Event('change',{bubbles:true}));
  }
  const target=get('crxStudyReception');
  target&&target.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
 }
 function renderStudyCards(){
  if(!studiesInitialized)return;
  const host=get('crxStudyCards');
  if(!host)return;
  const app=data(),studies=Array.isArray(app?.clinicalStudies)?app.clinicalStudies:[],
   types=Array.isArray(app?.clinicalSampleTypes)?app.clinicalSampleTypes:[],
   visits=Array.isArray(app?.clinicalVisits)?app.clinicalVisits:[];
  const visible=studies.filter(s=>{
   const status=String(s.status||'').toLocaleLowerCase('es');
   return (studyStatus==='todos'||status===studyStatus)&&matches(studyQ,[s.name,s.protocol,s.client,s.sponsor,s.notes]);
  });
  const cards=document.createDocumentFragment();
  if(!visible.length){
   cards.append(noData(studies.length?'No hay estudios que coincidan con la búsqueda o el filtro.':'No hay protocolos clínicos configurados. Regístralos en Configuración → Registro de sujetos.'));
  }
  visible.forEach((study,index)=>{
   const card=cardBase(index%2?'cyan':'violet');
   card.classList.add('crx-study-card');
   const emblem=node('span','crx-card-emblem');emblem.append(svg(index%3===1?'droplet':'flask'));
   const info=node('div','crx-study-card-info');
   info.append(node('strong','crx-card-title',study.name||study.protocol||'Estudio sin nombre'),
    node('small','crx-card-subtitle',[study.protocol,study.client].filter(Boolean).join(' · ')||'Protocolo registrado'));
   const meta=node('div','crx-card-meta');
   const allowedTypes=(study.sampleTypeIds||[]).map(id=>types.find(t=>String(t.id)===String(id))).filter(Boolean);
   const type=allowedTypes[0],spec=type&&study.sampleSpecs?.[type.id]||{};
   const tube=spec.tube||type?.tube;
   if(tube)meta.append(pill('tubes','Tubo: '+tube));
   else if(type)meta.append(pill(sampleIcon(type.name),'Muestra: '+type.name));
   else meta.append(pill('tubes','Tipos según protocolo'));
   const visitCount=(study.visitIds||[]).length||visits.filter(v=>String(v.studyId)===String(study.id)).length;
   if(visitCount)meta.append(pill('clock',visitCount+' visita'+(visitCount===1?'':'s')));
   else meta.append(pill('check',study.status||'Configurado'));
   info.appendChild(meta);
   const arrow=node('span','crx-card-chevron');arrow.append(svg('chevron'));
   const hit=node('button','crx-card-hit');
   const active=String(study.status||'').toLocaleLowerCase('es')==='activo';
   hit.type='button';
   hit.disabled=!active;
   hit.setAttribute('aria-label',active?'Abrir recepción para '+(study.name||study.protocol):'Protocolo no activo: '+(study.name||study.protocol));
   if(!active){
    card.classList.add('crx-unavailable');
    meta.append(pill('clock','No activo'));
   }else hit.addEventListener('click',()=>pickStudy(study.id));
   card.append(emblem,info,arrow,hit);cards.appendChild(card);
  });
  host.replaceChildren(cards);
  const count=get('crxCatalogCount');if(count)count.textContent=visible.length+' estudios';
 }
 function cellText(cell){
  return String(cell?.innerText||cell?.textContent||'').replace(/\s+/g,' ').trim();
 }

 // Revisión clínica: ficha modal vinculada al mismo identificador único.
 // Nunca se cambia un estado en el cliente sin confirmación de la RPC.
 function reviewAllowed(){
  const role=window.FleboClinicalCloud?.role;
  return ['admin','clinician','reception'].includes(role);
 }
 function reviewSample(id){
  return (data()?.clinicalSamples||[]).find(s=>String(s.id)===String(id)||String(s.cloudId)===String(id))||null;
 }
 function reviewRowSample(row){
  const native=Array.from(row.lastElementChild?.querySelectorAll('button')||[])
    .find(b=>/iniciar revisión|aprobar y enviar a proceso/i.test(b.textContent||''));
  const raw=native?.getAttribute('onclick')||'';
  const match=raw.match(/setClinicalSampleStatus\('([^']+)'/);
  return match?{sample:reviewSample(match[1]),id:match[1]}:null;
 }
 function reviewDateTime(value,date,time){
  const raw=value||(date?(date+(time?'T'+time:'')):'');
  if(!raw)return '—';
  // La cadena local de toma se conserva en hora local (sin conversión UTC).
  if(!value&&date){
   const ds=String(date).split('-');
   if(ds.length===3&&ds.every(Boolean)){
    const clock=String(time||'').slice(0,5);
    return ds[2]+'/'+ds[1]+'/'+ds[0]+(clock?' · '+clock:'');
   }
  }
  const parsed=new Date(raw);
  if(Number.isNaN(parsed.getTime()))return String(raw);
  return parsed.toLocaleString('es-PA',{dateStyle:'medium',timeStyle:'short'});
 }
 function openClinicalReviewCard(sampleId){
  const sample=reviewSample(sampleId);
  if(!sample){notify('La muestra ya no está disponible en la bandeja de revisión.');return;}
  if(!reviewAllowed()){notify('Tu rol no tiene permiso para revisar o aprobar muestras.');return;}
  const current=stateOf(sample);
  if(!['REGISTRADO','EN_REVISION'].includes(current)){
   notify('Esta muestra ya avanzó de etapa. Actualiza la bandeja.');
   return;
  }
  const previous=document.activeElement;
  get('clinicalReviewModal')?.remove();
  const app=data()||{};
  const lookup=(collection,id)=>Array.isArray(collection)?collection.find(item=>String(item.id)===String(id)):null;
  const study=lookup(app.clinicalStudies,sample.studyId);
  const visit=lookup(app.clinicalVisits,sample.visitId);
  const sampleType=lookup(app.clinicalSampleTypes,sample.sampleTypeId);
  const overlay=node('div','crx-review-overlay');
  overlay.id='clinicalReviewModal';
  overlay.setAttribute('role','dialog');
  overlay.setAttribute('aria-modal','true');
  overlay.setAttribute('aria-labelledby','clinicalReviewModalTitle');
  overlay.setAttribute('aria-describedby','clinicalReviewModalDescription');
  const card=node('section','crx-review-dialog');
  card.setAttribute('tabindex','-1');
  const hero=node('div','crx-review-hero');
  const emblem=node('span','crx-review-hero-icon');emblem.append(svg('clipboard'));
  const titleArea=node('div','crx-review-headlines');
  const title=node('h2','','Revisión de muestra');title.id='clinicalReviewModalTitle';
  const subtitle=node('p','','Verifica los datos registrados antes de autorizar el procesamiento.');
  subtitle.id='clinicalReviewModalDescription';
  titleArea.append(title,subtitle);
  const closeButton=node('button','crx-review-close','×');
  closeButton.type='button';closeButton.setAttribute('aria-label','Cerrar ficha de revisión');
  hero.append(emblem,titleArea,closeButton);
  const scroll=node('div','crx-review-scroll');
  const identity=node('div','crx-review-subject');
  identity.append(svg('user'),node('span','','Número de sujeto'));
  const identityValue=node('strong','',sample.subjectCode||sample.subjectId||'—');
  identity.append(identityValue);
  const status=node('span','crx-review-status');
  const details=node('div','crx-review-details');
  const readValues=new Map();
  function field(label,value){
   const item=node('div','crx-review-field');
   const strong=node('strong','',value==null||String(value).trim()===''?'—':String(value));
   item.append(node('small','',label),strong);
   readValues.set(label,strong);
   details.appendChild(item);
  }
  field('Estudio',study?[study.protocol,study.name].filter(Boolean).join(' · '):(sample.study||sample.studyId||'—'));
  field('Visita',sample.visit||visit?.name||visit?.code||'—');
  field('Tipo de muestra',sample.sampleType||sampleType?.name||'—');
  field('Fecha y hora de toma',reviewDateTime(sample.collectedAt,sample.collectionDate,sample.collectionTime));
  field('Fecha y hora de recepción',reviewDateTime(sample.receivedAt,sample.date,sample.time));
  field('Tubos / recipientes',sample.tubes==null?'—':sample.tubes);
  field('Responsable de recepción',sample.receivedBy||'—');
  const note=node('div','crx-review-notes');
  const noteValue=node('p','',sample.notes||sample.observations||'');
  note.append(node('small','','Observaciones registradas'),noteValue);
  note.hidden=!(sample.notes||sample.observations);
  scroll.appendChild(note);
  const guidance=node('p','crx-review-guidance','Confirma que el estudio, la visita, el tipo de muestra y las fechas corresponden al sujeto registrado.');
  scroll.prepend(identity,status,details,guidance);
  const feedback=node('p','crx-review-feedback');
  feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
  feedback.hidden=true;
  const actions=node('footer','crx-review-footer');
  const cancel=node('button','crx-review-cancel','Cerrar');cancel.type='button';
  const editButton=node('button','crx-review-edit-trigger','Editar datos');editButton.type='button';
  editButton.hidden=true;
  const approve=node('button','crx-review-approve','Aprobar y enviar a proceso');approve.type='button';
  actions.append(cancel,editButton,approve);
  card.append(hero,scroll,feedback,actions);
  overlay.appendChild(card);
  let busy=false,closed=false,editMode=false,canEdit=false;
  const editor=node('section','crx-review-editor');
  editor.hidden=true;
  const editorTitle=node('h3','','Modificar datos antes de aprobar');
  const editorHint=node('p','crx-review-edit-hint',
   'Verifica los valores correctos. El estudio permanece asociado al protocolo original.');
  const editorGrid=node('div','crx-review-edit-grid');
  function inputField(label,control,full){
   const group=node('label','crx-review-edit-field');
   if(full)group.classList.add('full');
   group.append(node('span','',label),control);
   editorGrid.appendChild(group);
   return control;
  }
  const subjectInput=node('input','crx-review-edit-input');
  subjectInput.type='text';subjectInput.required=true;subjectInput.maxLength=128;
  inputField('Número de sujeto',subjectInput,true);
  const visitInput=node('select','crx-review-edit-input');visitInput.required=true;
  inputField('Visita',visitInput);
  const sampleTypeInput=node('select','crx-review-edit-input');sampleTypeInput.required=true;
  inputField('Tipo de muestra',sampleTypeInput);
  const collectionInput=node('input','crx-review-edit-input');
  collectionInput.type='datetime-local';collectionInput.required=true;
  inputField('Fecha y hora de toma',collectionInput);
  const receptionInput=node('input','crx-review-edit-input');
  receptionInput.type='datetime-local';receptionInput.required=true;
  inputField('Fecha y hora de recepción',receptionInput);
  const tubesInput=node('input','crx-review-edit-input');
  tubesInput.type='number';tubesInput.min='1';tubesInput.max='10000';
  tubesInput.step='1';tubesInput.required=true;
  inputField('Cantidad de recipientes',tubesInput);
  const notesInput=node('textarea','crx-review-edit-input crx-review-edit-notes');
  notesInput.rows=2;notesInput.maxLength=4000;
  inputField('Observaciones de la muestra',notesInput,true);
  const reasonInput=node('textarea','crx-review-edit-input crx-review-edit-reason');
  reasonInput.rows=2;reasonInput.required=true;reasonInput.minLength=5;
  reasonInput.placeholder='Indica qué dato se corrigió y por qué';
  inputField('Motivo de la corrección (obligatorio)',reasonInput,true);
  editor.append(editorTitle,editorHint,editorGrid);
  scroll.insertBefore(editor,note);
  const setText=(label,value)=>{
   const el=readValues.get(label);
   if(el)el.textContent=value==null||String(value).trim()===''?'—':String(value);
  };
  function updateReadOnly(){
   const fresh=reviewSample(sampleId);
   if(!fresh)return;
   const appNow=data()||{};
   const studyNow=(appNow.clinicalStudies||[]).find(x=>String(x.id)===String(fresh.studyId));
   identityValue.textContent=fresh.subjectCode||'—';
   setText('Estudio',studyNow?[studyNow.protocol,studyNow.name].filter(Boolean).join(' · '):fresh.studyId);
   setText('Visita',fresh.visit||'—');
   setText('Tipo de muestra',fresh.sampleType||'—');
   setText('Fecha y hora de toma',reviewDateTime(fresh.collectedAt,fresh.collectionDate,fresh.collectionTime));
   setText('Fecha y hora de recepción',reviewDateTime(fresh.receivedAt,fresh.date,fresh.time));
   setText('Tubos / recipientes',fresh.tubes);
   setText('Responsable de recepción',fresh.receivedBy||'—');
   noteValue.textContent=fresh.notes||'';
   note.hidden=!fresh.notes;
  }
  function populateEditor(){
   const fresh=reviewSample(sampleId);
   if(!fresh)return false;
   const appNow=data()||{};
   const list=(items)=>Array.isArray(items)?items.filter(item=>
    String(item.studyId)===String(fresh.studyId)&&item.active!==false&&item.cloudId):[];
   const fillSelect=(select,items,current)=>{
    select.replaceChildren();
    for(const item of items){
     const opt=node('option','',([item.code,item.name].filter(Boolean).join(' · ')||item.name||'Sin nombre'));
     opt.value=String(item.id);
     select.appendChild(opt);
    }
    select.value=String(current||'');
   };
   fillSelect(visitInput,list(appNow.clinicalVisits),fresh.visitId);
   fillSelect(sampleTypeInput,list(appNow.clinicalSampleTypes),fresh.sampleTypeId);
   subjectInput.value=fresh.subjectCode||'';
   collectionInput.value=localInputTime(fresh.collectedAt);
   receptionInput.value=localInputTime(fresh.receivedAt);
   tubesInput.value=String(fresh.tubes||'');
   notesInput.value=fresh.notes||'';
   reasonInput.value='';
   return !!visitInput.value&&!!sampleTypeInput.value&&!!collectionInput.value&&!!receptionInput.value;
  }
  function toggleEditor(active){
   editMode=active;
   editor.hidden=!active;
   details.hidden=active;
   guidance.hidden=active;
   note.hidden=active||!noteValue.textContent;
   approve.hidden=active;
   cancel.textContent=active?'Cancelar edición':'Cerrar';
   editButton.textContent=active?'Guardar correcciones':'Editar datos';
   refreshModal();
  }
  async function saveReviewEdits(){
   if(busy||!editMode||!canEdit)return;
   const cloud=window.FleboClinicalCloud;
   const fresh=reviewSample(sampleId);
   if(!fresh||!['REGISTRADO','EN_REVISION'].includes(stateOf(fresh))){
    message('La muestra avanzó de etapa. Actualiza la ficha antes de continuar.',true);return;
   }
   const appNow=data()||{};
   const visit=(appNow.clinicalVisits||[]).find(x=>String(x.id)===visitInput.value&&
    String(x.studyId)===String(fresh.studyId)&&x.active!==false);
   const type=(appNow.clinicalSampleTypes||[]).find(x=>String(x.id)===sampleTypeInput.value&&
    String(x.studyId)===String(fresh.studyId)&&x.active!==false);
   const subject=subjectInput.value.trim();
   const tubes=Number(tubesInput.value);
   const collectionAt=new Date(collectionInput.value);
   const receptionAt=new Date(receptionInput.value);
   const reason=reasonInput.value.trim();
   if(!subject||!visit?.cloudId||!type?.cloudId||!collectionInput.value||!receptionInput.value||
    !Number.isInteger(tubes)||tubes<1||tubes>10000||!Number.isFinite(collectionAt.getTime())||
    !Number.isFinite(receptionAt.getTime())){
    message('Completa sujeto, visita, tipo, fechas y cantidad válida de recipientes.',true);return;
   }
   if(receptionAt<collectionAt){message('La recepción no puede ser anterior a la toma.',true);return;}
   if(reason.length<5){message('Indica el motivo de corrección (al menos cinco caracteres).',true);return;}
   if(!cloud?.ready||typeof cloud.correctReviewSample!=='function'){
    message('No hay conexión con el registro clínico en la nube.',true);return;
   }
   busy=true;editButton.disabled=true;cancel.disabled=true;closeButton.disabled=true;
   message('Guardando correcciones en Supabase...');
   try{
    await cloud.correctReviewSample(fresh,{
     subjectCode:subject,visit,sampleType:type,collectedAt:collectionAt.toISOString(),
     receivedAt:receptionAt.toISOString(),tubes,notes:notesInput.value,reason
    });
    busy=false;cancel.disabled=false;closeButton.disabled=false;
    updateReadOnly();toggleEditor(false);
    message('Correcciones guardadas y auditadas. Verifica los datos antes de aprobar.');
   }catch(e){
    busy=false;cancel.disabled=false;closeButton.disabled=false;
    message(e?.message||'No se pudieron guardar los cambios.',true);
    refreshModal();
   }
  }
  const handleKeys=e=>{
   if(e.key==='Escape'&&!busy){e.preventDefault();dismiss();}
   if(e.key!=='Tab')return;
   const items=Array.from(card.querySelectorAll('button:not([disabled])'));
   if(!items.length)return;
   const first=items[0],last=items[items.length-1];
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  };
  function dismiss(){
   if(busy||closed)return;
   closed=true;document.removeEventListener('keydown',handleKeys);
   overlay.remove();if(previous&&previous.isConnected&&typeof previous.focus==='function')previous.focus({preventScroll:true});
  }
  function message(text,isError){
   feedback.hidden=!text;
   feedback.textContent=text||'';
   feedback.classList.toggle('is-error',!!isError);
  }
  function refreshModal(){
   const now=reviewSample(sampleId),phase=now?stateOf(now):'';
   if(!now||!['REGISTRADO','EN_REVISION'].includes(phase)){
    approve.disabled=true;status.textContent='Estado actualizado fuera de revisión';
    if(!busy)message('La muestra cambió de estado. Cierra la ficha y actualiza la bandeja.',true);
    return false;
   }
   status.textContent=phase==='EN_REVISION'?'En revisión':'Registrada';
   approve.disabled=busy||editMode||phase!=='EN_REVISION'||!reviewAllowed();
   editButton.disabled=busy;
   editButton.hidden=!canEdit;
   return true;
  }
  async function transition(next,notes){
   const now=reviewSample(sampleId);
   if(!now||!reviewAllowed())throw new Error('No se encuentra la muestra o no tienes permiso de revisión.');
   const from=stateOf(now);
   const expected=next==='En revisión'?'REGISTRADO':'EN_REVISION';
   if(from!==expected)throw new Error('La muestra cambió de estado. Actualiza la revisión antes de continuar.');
   if(typeof window.setClinicalSampleStatus!=='function')throw new Error('La transición clínica no está disponible.');
   await window.setClinicalSampleStatus(now.id,next,notes);
   // La función existente confirma la RPC antes de actualizar el estado;
   // si falló, permanece en la etapa anterior y se mantiene la ficha.
   const confirmed=reviewSample(sampleId);
   const target=next==='En revisión'?'EN_REVISION':'PENDIENTE_PROCESO';
   return !!confirmed&&stateOf(confirmed)===target;
  }
  approve.addEventListener('click',async()=>{
   if(busy||editMode||!refreshModal()||approve.disabled)return;
   busy=true;approve.disabled=true;cancel.disabled=true;closeButton.disabled=true;
   message('Confirmando aprobación con el sistema...');
   try{
    const ok=await transition('Pendiente de procesamiento','Aprobada en ficha de revisión y enviada a procesamiento');
    if(!ok)throw new Error('No se confirmó el envío a procesamiento. Comprueba la conexión y los datos obligatorios.');
    busy=false;cancel.disabled=false;closeButton.disabled=false;
    dismiss();
    notify('Muestra aprobada y enviada a Procesamiento.');
   }catch(e){
    message(e?.message||'No se pudo aprobar la muestra.',true);
    busy=false;cancel.disabled=false;closeButton.disabled=false;refreshModal();
   }
  });
  closeButton.addEventListener('click',dismiss);
  cancel.addEventListener('click',()=>{
   if(busy)return;
   if(editMode){toggleEditor(false);message('Edición cancelada; no se guardaron cambios.');}
   else dismiss();
  });
  editButton.addEventListener('click',()=>{
   if(busy||!canEdit)return;
   if(editMode){saveReviewEdits();return;}
   if(!populateEditor()){
    message('Faltan visitas, tipos de muestra o fechas sincronizadas. Actualiza el catálogo.',true);return;
   }
   message('');toggleEditor(true);subjectInput.focus({preventScroll:true});
  });
  overlay.addEventListener('click',e=>{if(e.target===overlay)dismiss();});
  document.body.appendChild(overlay);
  document.addEventListener('keydown',handleKeys);
  refreshModal();
  closeButton.focus({preventScroll:true});
  Promise.resolve().then(async()=>{
   const cloud=window.FleboClinicalCloud;
   if(!cloud?.ready||typeof cloud.getReviewEditPermission!=='function')return false;
   return await cloud.getReviewEditPermission();
  }).then(ok=>{
   if(closed||!overlay.isConnected)return;
   canEdit=ok===true;
   refreshModal();
  }).catch(e=>{
   console.warn('[FleboReport] No se pudieron verificar permisos de edición clínica:',e);
  });
  if(current==='REGISTRADO'){
   busy=true;cancel.disabled=true;closeButton.disabled=true;approve.disabled=true;
   message('Registrando el inicio de revisión...');
   transition('En revisión','Revisión iniciada desde la ficha clínica')
   .then(ok=>{
    if(!ok)throw new Error('El servidor no confirmó el inicio de revisión. Comprueba tu conexión.');
    message('Revisión iniciada. Comprueba los datos y, si todo está correcto, aprueba la muestra.');
   })
   .catch(e=>message(e?.message||'No se pudo iniciar la revisión.',true))
   .finally(()=>{
    busy=false;cancel.disabled=false;closeButton.disabled=false;refreshModal();
   });
  }
 }
 function renderReviewCards(){
  if(!studiesInitialized)return;
  const host=get('crxReviewCards'),body=get('clinicalReviewRows');
  if(!host||!body)return;
  const rows=Array.from(body.querySelectorAll('tr'));
  const frag=document.createDocumentFragment();
  if(!rows.length)frag.append(noData('No hay muestras pendientes de revisión. Las aprobadas aparecen en Procesamiento.'));
  rows.forEach((row,index)=>{
   const tds=Array.from(row.children);
   if(tds.length<7)return;
   const status=cellText(tds[5]);
   const card=cardBase(index%2?'cyan':'violet');card.classList.add('crx-review-card');
   const emblem=node('span','crx-card-emblem');emblem.append(svg('clipboard'));
   const info=node('div','crx-study-card-info');
   info.append(node('strong','crx-card-title',cellText(tds[1])||'Estudio'),
    node('small','crx-card-subtitle','Sujeto: '+(cellText(tds[2])||'—')));
   const meta=node('div','crx-card-meta');
   meta.append(pill('tubes',cellText(tds[3])||'Tipo de muestra'),pill('check',status||'Registrada'));
   info.appendChild(meta);
   const actions=node('div','crx-review-actions');
   const reference=reviewRowSample(row);
   Array.from(tds[6].querySelectorAll('button')).forEach(original=>{
    if(/eliminar|quitar local/i.test(original.textContent)&&!hasDeletePermission())return;
    if(/iniciar revisión|aprobar y enviar a proceso/i.test(original.textContent||'')){
     if(!reviewAllowed()||!reference?.sample)return;
     const open=node('button','crx-action','Iniciar revisión');
     open.type='button';
     open.setAttribute('aria-label','Abrir ficha de revisión del sujeto '+(reference.sample.subjectCode||''));
     open.addEventListener('click',()=>openClinicalReviewCard(reference.id));
     actions.appendChild(open);
    }else{
     actions.appendChild(primaryButton(original));
    }
   });
   card.append(emblem,info,actions);
   frag.appendChild(card);
  });
  host.replaceChildren(frag);
  const count=get('crxReviewCount');if(count)count.textContent=rows.length+' pendientes';
 }
 function initStudies(){
  if(studiesInitialized||!get('view-clinical-studies'))return;
  const root=get('view-clinical-studies');
  const layout=root.querySelector('.clinical-layout'),review=get('clinicalReviewPanel'),
   reception=layout&&Array.from(layout.children).find(x=>x.tagName==='SECTION'&&!x.hasAttribute('hidden')&&x.id!=='clinicalReviewPanel'),
   history=layout?.querySelector('.clinical-history-study'),metrics=root.querySelector(':scope > .clinical-kpis');
  if(!layout||!review||!reception||!metrics)return;
  root.insertBefore(makeHeader('Estudios','Catálogo de protocolos, requisitos y recepción de muestras','flask'),root.firstChild);
  const toolbar=node('div','crx-study-toolbar');
  const search=node('div','crx-study-search');
  search.append(svg('search'));
  const input=node('input','crx-search-input');
  input.type='search';input.placeholder='Buscar estudio...';input.setAttribute('aria-label','Buscar estudios por nombre, código o cliente');
  input.addEventListener('input',()=>{studyQ=input.value.trim().toLocaleLowerCase('es');renderStudyCards();});
  search.appendChild(input);
  const extra=node('details','crx-study-filters');
  const filterTrigger=node('summary','crx-filter-toggle');
  filterTrigger.setAttribute('aria-label','Filtrar estudios');filterTrigger.append(svg('sliders'));
  const filterBody=node('div','crx-filter-panel');
  const statusLabel=node('label','', 'Estado del protocolo');
  const select=node('select','crx-select');
  for(const [value,title] of [['todos','Todos'],['activo','Activo'],['cerrado','Cerrado'],['suspendido','Suspendido']]){
   const option=node('option','',title);option.value=value;select.appendChild(option);
  }
  select.addEventListener('change',()=>{studyStatus=select.value;renderStudyCards();});
  filterBody.append(statusLabel,select);extra.append(filterTrigger,filterBody);
  toolbar.append(search,extra);
  const tabs=node('div','crx-study-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Secciones de Estudios');
  for(const [key,title,shape] of [['todos','Todos','layers'],['catalogo','Catálogo','flask'],['recepcion','Recepción','tubes'],['revision','Revisión','clipboard']]){
   const b=node('button','crx-study-tab',title);b.type='button';b.dataset.tab=key;b.setAttribute('role','tab');
   b.appendChild(svg(shape));
   b.addEventListener('click',()=>currentStudyTab(key));
   tabs.appendChild(b);
  }
  const catalog=setSection(root,'crx-catalog-stage');catalog.id='crxStudyCatalog';
  const catHead=node('div','crx-stage-heading');
  catHead.append(node('h2','','Estudios registrados'),node('span','crx-count','0 estudios'));catHead.lastChild.id='crxCatalogCount';
  const cards=node('div','crx-study-cards');cards.id='crxStudyCards';catalog.append(catHead,cards);
  const reviewStage=setSection(root,'crx-review-stage');reviewStage.id='crxStudyReview';
  reviewStage.appendChild(review);
  const reviewCards=node('div','crx-review-cards');reviewCards.id='crxReviewCards';
  const counter=node('span','crx-count');counter.id='crxReviewCount';counter.textContent='0 pendientes';
  const panelHead=review.querySelector('.panel-head');
  if(panelHead)panelHead.appendChild(counter);
  review.insertBefore(reviewCards,review.querySelector('.clinical-table-wrap'));
  const receptionStage=setSection(root,'crx-reception-stage');receptionStage.id='crxStudyReception';
  receptionStage.appendChild(reception);
  const stats=node('details','crx-metrics-details');
  const statsSummary=node('summary','','Indicadores de Estudios');
  stats.append(statsSummary,metrics);
  root.appendChild(stats);
  if(history)root.appendChild(history);
  root.insertBefore(toolbar,catalog);root.insertBefore(tabs,catalog);
  root.classList.add('crx-ready');
  studiesInitialized=true;
  currentStudyTab('todos');
  const nativeList=get('clinicalStudyList');
  if(nativeList)new MutationObserver(()=>renderStudyCards()).observe(nativeList,{childList:true});
  const reviewBody=get('clinicalReviewRows');
  if(reviewBody)new MutationObserver(renderReviewCards).observe(reviewBody,{childList:true});
  // La recepción confirmada marca el panel nativo de revisión. No navegar
  // por nuevos registros remotos mientras el usuario está llenando su ficha.
  new MutationObserver(()=>{
   if(studyTab!=='recepcion'||!review.classList.contains('clinical-review-highlight'))return;
   currentStudyTab('revision');
   requestAnimationFrame(()=>{
    get('crxStudyReview')?.scrollIntoView({behavior:'smooth',block:'start'});
   });
  }).observe(review,{attributes:true,attributeFilter:['class']});
  window.addEventListener('flebo:auth-changed',()=>{renderStudyCards();renderReviewCards();});
  window.addEventListener('flebo:local-state-saved',()=>{renderStudyCards();renderReviewCards();});
 }
 // PROCESAMIENTO: las mismas filas y botones originales, presentados como tarjetas.
 let processingInitialized=false;
 function shortDate(raw){
  const d=raw?new Date(raw):null;
  return d&&!Number.isNaN(d.getTime())?d.toLocaleTimeString('es-PA',{hour:'2-digit',minute:'2-digit'}):'';
 }
 function matchSampleForRow(row){
  const tds=row.children,subject=tds[0]?.querySelector('strong')?.textContent.trim()||'';
  const command=tds[7]?.querySelector('button[onclick]');
  const m=command?.getAttribute('onclick')?.match(/\(['"]([^'"]+)['"]\)/);
  const samples=data()?.clinicalSamples||[];
  if(m)return samples.find(s=>String(s.id)===m[1]||String(s.cloudId)===m[1])||null;
  // Algunos permisos no muestran acciones originales: resolver por campos
  // de la fila y exigir coincidencia única para evitar editar otro tubo.
  const rowStudy=String(tds[0]?.firstChild?.textContent||'').trim();
  const visitType=String(tds[1]?.textContent||'');
  const rowSubject=subject;
  const studyList=data()?.clinicalStudies||[];
  const matches=samples.filter(s=>{
   if(String(s.subjectCode||'')!==rowSubject||!storedSample(s))return false;
   const study=studyList.find(st=>String(st.id)===String(s.studyId));
   const title=study?[study.protocol,study.name].filter(Boolean).join(' · '):'';
   if(title&&rowStudy&&title!==rowStudy)return false;
   if(s.visit&&!visitType.includes(s.visit))return false;
   if(s.sampleType&&!visitType.includes(s.sampleType))return false;
   return true;
  });
  return matches.length===1?matches[0]:null;
 }
 function showSampleDetails(row,sample){
  const tds=Array.from(row.children);
  const modal=node('div','crx-detail-overlay');
  modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
  modal.setAttribute('aria-label','Detalle de muestra');
  const card=node('section','crx-detail-dialog');
  const top=node('div','crx-detail-head');
  top.append(node('h2','','Detalle de la muestra'));
  const dismiss=node('button','crx-close','×');dismiss.type='button';dismiss.setAttribute('aria-label','Cerrar detalle');
  const close=()=>{modal.remove();document.removeEventListener('keydown',onKey);};
  const onKey=e=>{if(e.key==='Escape')close();};
  dismiss.addEventListener('click',close);modal.addEventListener('click',e=>{if(e.target===modal)close();});
  document.addEventListener('keydown',onKey);
  top.append(dismiss);card.append(top);
  const names=['Estudio y sujeto','Visita y tipo de muestra','Toma y recepción','Recipientes','Alícuotas','Estado','Responsables y fechas'];
  tds.slice(0,7).forEach((c,i)=>{
   const r=node('div','crx-detail-row');
   r.append(node('small','',names[i]||'Detalle'),node('strong','',cellText(c)||'—'));
   card.append(r);
  });
  if(sample){
   if(sample.processingNotes)card.append(node('p','crx-detail-notes',sample.processingNotes));
   if(sample.notes)card.append(node('p','crx-detail-notes',sample.notes));
  }
  modal.append(card);document.body.appendChild(modal);dismiss.focus();
 }

 // Gestión de muestras almacenadas. Estos permisos los determina Supabase,
 // no la apariencia ni los valores editables de la cuenta en el navegador.
 let management={can_edit:false,can_delete:false};
 let permissionsLoading=false;
 async function loadManagementPermissions(){
  if(permissionsLoading)return;
  const cloud=window.FleboClinicalCloud;
  if(!cloud?.ready||typeof cloud.getManagementPermissions!=='function')return;
  permissionsLoading=true;
  try{
   const checked=await cloud.getManagementPermissions();
   management={can_edit:checked.can_edit===true,can_delete:checked.can_delete===true};
  }catch(e){management={can_edit:false,can_delete:false};console.error('[FleboReport] Permisos de muestras:',e)}
  finally{permissionsLoading=false;renderProcessingCards();}
 }
 function storedSample(sample){
  return !!(sample?.cloudId&&['ALMACENAMIENTO_TEMPORAL','CONGELADOR_DEFINITIVO'].includes(stateOf(sample)));
 }
 function localInputTime(value){
  if(!value)return '';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return '';
  const pad=v=>String(v).padStart(2,'0');
  return [d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join('-')+'T'+[pad(d.getHours()),pad(d.getMinutes())].join(':');
 }
 function administrativeDialog(kind,sample){
  if(!storedSample(sample)||!management[kind==='correct'?'can_edit':'can_delete']){
   notify('No tienes permiso para esta operación o la muestra cambió de estado.');return;
  }
  const past=document.activeElement;
  get('crxAdministrationModal')?.remove();
  const modal=node('div','crx-admin-overlay');modal.id='crxAdministrationModal';
  modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
  modal.setAttribute('aria-labelledby','crxAdminTitle');
  const content=node('section','crx-admin-card');
  const heading=node('div','crx-admin-heading');
  heading.append(svg(kind==='correct'?'clipboard':'filter','crx-admin-heading-icon'));
  const title=node('h2','','');
  title.id='crxAdminTitle';
  title.textContent=kind==='correct'?'Corregir datos de muestra':'Eliminar muestra de la bandeja';
  const dismiss=node('button','crx-admin-close','×');
  dismiss.type='button';dismiss.setAttribute('aria-label','Cerrar');
  heading.append(title,dismiss);
  const details=node('div','crx-admin-body');
  const summary=node('div','crx-admin-identity');
  summary.append(node('strong','','Sujeto '+(sample.subjectCode||'—')),node('small','',sample.sampleType||'Muestra clínica'));
  details.append(summary);
  const oldState=node('p','crx-admin-state','Estado conservado: '+(stateOf(sample)==='CONGELADOR_DEFINITIVO'?'Almacenamiento definitivo':'Almacenamiento temporal'));
  details.append(oldState);
  let visitField,collectionField,receivedField,reasonField;
  function field(label,el){
   const group=node('label','crx-admin-field');
   group.append(node('span','',label),el);
   details.append(group);return el;
  }
  if(kind==='correct'){
   const state=data()||{};
   const available=(state.clinicalVisits||[]).filter(v=>
     String(v.studyId)===String(sample.studyId)&&v.active!==false
   );
   visitField=node('select','crx-admin-input');visitField.required=true;
   for(const visit of available){
    const option=node('option','',([visit.code,visit.name].filter(Boolean).join(' · ')||visit.name));
    option.value=String(visit.id);
    option.selected=String(visit.id)===String(sample.visitId);
    visitField.append(option);
   }
   field('Visita',visitField);
   collectionField=node('input','crx-admin-input');collectionField.type='datetime-local';
   collectionField.value=localInputTime(sample.collectedAt);
   collectionField.required=true;
   field('Fecha y hora de toma',collectionField);
   receivedField=node('input','crx-admin-input');receivedField.type='datetime-local';
   receivedField.value=localInputTime(sample.receivedAt);
   receivedField.required=true;
   field('Fecha y hora de recepción',receivedField);
   details.append(node('p','crx-admin-hint','Se corregirán los datos administrativos sin reiniciar el procesamiento ni perder las alícuotas almacenadas.'));
  }else{
   details.append(node('p','crx-admin-warning','Esta acción retira la muestra de las bandejas activas. No borra físicamente sus datos ni el historial; quedará registrada en la auditoría.'));
  }
  reasonField=node('textarea','crx-admin-input crx-admin-reason');
  reasonField.rows=3;reasonField.required=true;reasonField.minLength=5;
  reasonField.placeholder=kind==='correct'?'Explica el dato ingresado incorrectamente':'Indica el motivo de eliminación';
  field('Motivo obligatorio (mínimo 5 caracteres)',reasonField);
  const feedback=node('p','crx-admin-feedback');feedback.hidden=true;feedback.setAttribute('role','alert');
  const footer=node('footer','crx-admin-footer');
  const cancel=node('button','crx-admin-cancel','Cancelar');cancel.type='button';
  const confirm=node('button','crx-admin-confirm',kind==='correct'?'Guardar corrección':'Confirmar eliminación');confirm.type='button';
  if(kind==='delete')confirm.classList.add('is-danger');
  footer.append(cancel,confirm);
  content.append(heading,details,feedback,footer);modal.append(content);
  let saving=false;
  const onKey=e=>{if(e.key==='Escape'&&!saving){e.preventDefault();close();}};
  function close(){
   if(saving)return;
   document.removeEventListener('keydown',onKey);
   modal.remove();
   if(past?.isConnected&&typeof past.focus==='function')past.focus({preventScroll:true});
  }
  dismiss.addEventListener('click',close);cancel.addEventListener('click',close);
  modal.addEventListener('click',e=>{if(e.target===modal)close();});
  function error(message){feedback.hidden=false;feedback.textContent=message;}
  confirm.addEventListener('click',async()=>{
   if(saving)return;
   const reason=reasonField.value.trim();
   if(reason.length<5){error('Indica un motivo de al menos cinco caracteres.');reasonField.focus();return;}
   const cloud=window.FleboClinicalCloud;
   if(!cloud?.ready){error('No hay conexión clínica. Vuelve a intentarlo después de sincronizar.');return;}
   const fresh=reviewSample(sample.id);
   if(!storedSample(fresh)){error('Esta muestra cambió de estado. Actualiza la bandeja.');return;}
   let visit;
   if(kind==='correct'){
    visit=(data()?.clinicalVisits||[]).find(v=>String(v.id)===visitField.value);
    if(!visit?.cloudId||!collectionField.value||!receivedField.value){
     error('Completa una visita sincronizada y ambas fechas y horas.');return;
    }
    if(new Date(receivedField.value).getTime()<new Date(collectionField.value).getTime()){
     error('La recepción no puede ser anterior a la toma.');return;
    }
   }
   saving=true;confirm.disabled=true;cancel.disabled=true;dismiss.disabled=true;
   feedback.hidden=false;feedback.textContent='Guardando y verificando en la nube...';
   try{
    if(kind==='correct'){
     if(!management.can_edit)throw new Error('No tienes permiso de edición.');
     await cloud.correctSample(fresh,visit,new Date(collectionField.value).toISOString(),new Date(receivedField.value).toISOString(),reason);
    }else{
     if(!management.can_delete)throw new Error('No tienes permiso de eliminación.');
     await cloud.deleteSample(fresh,reason);
     await cloud.refreshSamples();
    }
    saving=false;cancel.disabled=false;dismiss.disabled=false;
    close();renderProcessingCards();
    notify(kind==='correct'?'Corrección registrada con auditoría.':'Muestra retirada con trazabilidad.');
   }catch(e){
    saving=false;confirm.disabled=false;cancel.disabled=false;dismiss.disabled=false;
    error(e?.message||'No se pudo confirmar la operación en Supabase.');
   }
  });
  document.body.appendChild(modal);document.addEventListener('keydown',onKey);
  dismiss.focus({preventScroll:true});
 }
 function makeSwipeCard(card,sample){
  if(!storedSample(sample)||(!management.can_edit&&!management.can_delete))return card;
  const container=node('div','crx-swipe-frame');
  const underneath=node('div','crx-swipe-actions');
  function action(side,name,onClick){
   const b=node('button','crx-swipe-reveal crx-swipe-'+side,name);
   b.type='button';b.setAttribute('aria-label',name+' muestra del sujeto '+sample.subjectCode);
   b.addEventListener('click',onClick);
   underneath.append(b);
   return b;
  }
  if(management.can_edit)action('right','Corregir',()=>administrativeDialog('correct',sample));
  if(management.can_delete)action('left','Eliminar',()=>administrativeDialog('delete',sample));
  const help=node('small','crx-swipe-hint',
   [management.can_edit?'→ corregir':null,management.can_delete?'← eliminar':null].filter(Boolean).join(' · '));
  card.querySelector('.crx-process-identity')?.append(help);
  container.append(underneath,card);
  let startX=0,startY=0,dx=0,horizontal=false,tracking=false;
  const max=104;
  function reset(){
   card.style.transform='';
   container.classList.remove('crx-swiping');
   tracking=false;horizontal=false;dx=0;
  }
  card.addEventListener('touchstart',e=>{
   if(e.touches.length!==1||e.target.closest('button,input,select,textarea'))return;
   startX=e.touches[0].clientX;startY=e.touches[0].clientY;
   dx=0;horizontal=false;tracking=true;
  },{passive:true});
  card.addEventListener('touchmove',e=>{
   if(!tracking||e.touches.length!==1)return;
   const x=e.touches[0].clientX-startX,y=e.touches[0].clientY-startY;
   if(!horizontal&&Math.abs(y)>Math.abs(x)) {tracking=false;return;}
   if(!horizontal&&Math.abs(x)>15&&Math.abs(x)>Math.abs(y)*1.4)horizontal=true;
   if(!horizontal)return;
   if(e.cancelable)e.preventDefault();
   const allowed=(x>0&&management.can_edit)||(x<0&&management.can_delete);
   dx=allowed?Math.max(-max,Math.min(max,x)):0;
   container.classList.add('crx-swiping');
   card.style.transform='translate3d('+dx+'px,0,0)';
  },{passive:false});
  card.addEventListener('touchend',()=>{
   if(!tracking)return;
   const chosen=dx>76?'correct':dx< -76?'delete':null;
   reset();
   if(chosen)administrativeDialog(chosen,sample);
  },{passive:true});
  card.addEventListener('touchcancel',reset,{passive:true});
  const desktop=node('div','crx-swipe-desktop-actions');
  if(management.can_edit){
   const b=node('button','','Corregir');b.type='button';
   b.addEventListener('click',()=>administrativeDialog('correct',sample));desktop.append(b);
  }
  if(management.can_delete){
   const b=node('button','','Eliminar');b.type='button';
   b.addEventListener('click',()=>administrativeDialog('delete',sample));desktop.append(b);
  }
  card.querySelector('.crx-process-actions')?.append(desktop);
  return container;
 }
 function renderProcessingCards(){
  if(!processingInitialized)return;
  const tbody=get('clinicalQueueRows'),host=get('crxProcessCards');
  if(!tbody||!host)return;
  const rows=Array.from(tbody.querySelectorAll('tr')),fragment=document.createDocumentFragment();
  if(!rows.length)fragment.append(noData('No hay muestras para estos filtros. Las muestras aprobadas aparecen aquí.'));
  rows.forEach((row,index)=>{
   const c=Array.from(row.children);
   if(c.length<8)return;
   const sample=matchSampleForRow(row);
   const raw=cellText(c[5]).toLocaleLowerCase('es');
   const final=/definitiv|finalizad/.test(raw),temporary=/temporal/.test(raw),
    processing=/procesando/.test(raw);
   const theme=final?'mint':temporary?'cyan':processing?'violet':'blue';
   const logo=final?'check':temporary?'database':'tubes';
   const card=cardBase(theme);card.classList.add('crx-processing-card');
   const emblem=node('span','crx-card-emblem');emblem.append(svg(logo));
   const info=node('div','crx-process-identity');
   const subject=c[0]?.querySelector('strong')?.textContent.trim()||'Sujeto';
   const study=String(c[0]?.firstChild?.textContent||'').trim();
   info.append(node('strong','crx-process-name',subject),node('small','crx-process-study',study||'Estudio clínico'));
   const typeText=String(c[1]?.lastChild?.textContent||c[1]?.innerText||c[1]?.textContent||'').trim();
   info.append(node('small','crx-process-type','Tipo: '+(typeText||'Muestra')));
   const middle=node('div','crx-process-state');
   const st=node('span','crx-state-pill');
   st.append(svg(final?'check':temporary?'database':processing?'refresh':'clock'),
    node('strong','',final?'Definitivo':temporary?'Almacenamiento temporal':processing?'Procesando':'Pendiente'));
   middle.appendChild(st);
   const rawTime=final?sample?.storedAt:temporary?sample?.processedAt:processing?sample?.processingStartedAt:sample?.reviewedAt;
   const time=shortDate(rawTime);
   const clock=node('span','crx-process-time');
   clock.append(svg('clock'),node('span','',time?(final?'Fin: ':temporary?'Desde: ':processing?'Inicio: ':'Revisión: ')+time:'Información registrada'));
   middle.appendChild(clock);
   const actions=node('div','crx-process-actions');
   const original=Array.from(c[7].querySelectorAll('button')).find(b=>!/danger/.test(b.className));
   const label=final?'Revisar':temporary?'Actualizar estado':processing?'Pasar a temporal':'Iniciar';
   if(original)actions.append(primaryButton(original,label));
   else{
    const b=node('button','crx-action','Revisar');b.type='button';b.addEventListener('click',()=>showSampleDetails(row,sample));
    actions.appendChild(b);
   }
   const detail=node('button','crx-detail-link','Ver ficha');
   detail.type='button';detail.addEventListener('click',()=>showSampleDetails(row,sample));
   info.appendChild(detail);
   card.append(emblem,info,middle,actions);fragment.append(makeSwipeCard(card,sample));
  });
  host.replaceChildren(fragment);
  const count=get('crxProcessTotal');if(count)count.textContent='('+rows.length+')';
  const pending=get('crxPendingCount');if(pending)pending.textContent=get('clinicalQueueKpiReceived')?.textContent||'0';
  const updated=get('crxLastUpdated');if(updated)updated.textContent='Actualizado: '+new Date().toLocaleTimeString('es-PA',{hour:'2-digit',minute:'2-digit'});
 }
 async function refreshSamples(){
  const b=get('crxRefreshSamples');
  if(b?.disabled)return;
  if(b)b.disabled=true;
  try{
   if(!window.FleboClinicalCloud?.refreshSamples)throw new Error('La sincronización clínica no está disponible.');
   await window.FleboClinicalCloud.refreshSamples();
   if(typeof window.renderClinicalStudies==='function')window.renderClinicalStudies();
  }catch(e){
   notify(e?.message||'No se pudo actualizar la bandeja clínica.');
  }finally{if(b)b.disabled=false;}
 }
 function initProcessing(){
  if(processingInitialized||!get('view-clinical-processing'))return;
  const root=get('view-clinical-processing');
  const layout=root.querySelector('.clinical-layout'),panel=layout?.querySelector(':scope > section.panel'),
   filters=panel?.querySelector('.clinical-filter'),
   search=get('clinicalQueueSearch'),kpis=root.querySelector(':scope > .clinical-kpis');
  if(!layout||!panel||!filters||!search||!kpis)return;
  root.insertBefore(makeHeader('Procesamiento','','layers'),root.firstChild);
  // Las métricas auténticas siguen siendo actualizadas por renderQueue().
  kpis.classList.add('crx-process-kpis');
  const images=['clock','database','check'];
  Array.from(kpis.children).slice(1).forEach((metric,i)=>{
   metric.insertBefore(svg(images[i],'crx-kpi-symbol'),metric.firstChild);
  });
  const toolbar=node('div','crx-process-toolbar');
  const searchOuter=node('div','crx-process-search');
  searchOuter.append(svg('search'));
  const field=search.closest('.field');
  if(!field)return;
  field.classList.add('crx-search-field');search.placeholder='Buscar muestra (sujeto, estudio...)';
  searchOuter.appendChild(field);
  const details=node('details','crx-process-filters');
  const summary=node('summary','crx-filter-button');
  summary.append(svg('filter'),node('span','','Filtros'),svg('chevron'));
  details.append(summary,filters);
  toolbar.append(searchOuter,details);
  const listbar=node('div','crx-process-listhead');
  const left=node('div','crx-list-title');left.append(node('h2','','Muestras en proceso '));
  const total=node('span','');total.id='crxProcessTotal';total.textContent='(0)';left.querySelector('h2').appendChild(total);
  const stamp=node('div','crx-list-status');
  const pending=node('span','crx-pending-pill');pending.append(node('span','','Pendientes: '));
  const number=node('strong','','0');number.id='crxPendingCount';pending.appendChild(number);
  const updated=node('span','crx-updated','Actualizado: —');updated.id='crxLastUpdated';
  const refresh=node('button','crx-refresh');refresh.type='button';refresh.id='crxRefreshSamples';
  refresh.setAttribute('aria-label','Actualizar muestras');refresh.title='Actualizar muestras';refresh.append(svg('refresh'));
  refresh.addEventListener('click',refreshSamples);
  stamp.append(pending,updated,refresh);
  listbar.append(left,stamp);
  const cards=node('div','crx-process-cards');cards.id='crxProcessCards';
  const sourceTable=panel.querySelector('.clinical-table-wrap');
  if(!sourceTable)return;
  panel.insertBefore(toolbar,sourceTable);
  panel.insertBefore(listbar,sourceTable);
  panel.insertBefore(cards,sourceTable);
  root.classList.add('crx-ready');
  processingInitialized=true;
  renderProcessingCards();
  const body=get('clinicalQueueRows');
  if(body)new MutationObserver(renderProcessingCards).observe(body,{childList:true});
  const kpiValue=get('clinicalQueueKpiReceived');
  if(kpiValue)new MutationObserver(()=>{const pill=get('crxPendingCount');if(pill)pill.textContent=kpiValue.textContent;}).observe(kpiValue,{childList:true,characterData:true,subtree:true});
 }
 let permissionRetries=0,permissionRetryTimer=null;
 function pollPermissions(){
  if(window.FleboClinicalCloud?.ready){permissionRetries=0;loadManagementPermissions();return;}
  if(permissionRetries>=12)return;
  permissionRetries+=1;
  clearTimeout(permissionRetryTimer);
  permissionRetryTimer=setTimeout(pollPermissions,700);
 }
 function boot(){
  initStudies();initProcessing();
  management={can_edit:false,can_delete:false};
  renderProcessingCards();
  pollPermissions();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
 else boot();
 window.addEventListener('flebo:auth-changed',()=>{permissionRetries=0;boot();});
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible')loadManagementPermissions();
 });
})();
