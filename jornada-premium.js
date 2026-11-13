/* FleboReport Jornada — Variante C fiel a la referencia.
   Reorganiza los elementos EXISTENTES; no registra pacientes, edita estados
   ni escribe en Supabase. Todos los controles y sus IDs se conservan. */
(function(){
 'use strict';
 const byId=id=>document.getElementById(id);
 const icon=paths=>'<svg viewBox="0 0 24 24" width="27" height="27" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">'+paths+'</svg>';
 const icons={
  clipboard:icon('<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4V2h6v2M9 9h1m3 0h3M9 13h1m3 0h3M9 17h1m3 0h3"/>'),
  active:icon('<path d="m8 5 11 7-11 7V5Z"/>'),
  search:icon('<circle cx="10" cy="10" r="6"/><path d="m14.5 14.5 6 6"/>'),
  id:icon('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M5.5 16c.5-2 6.5-2 7 0M15 10h4M15 14h4"/>'),
  flask:icon('<path d="M9 3h6M10 3v7L5 19a1.5 1.5 0 0 0 1.3 2h11.4a1.5 1.5 0 0 0 1.3-2L14 10V3M8 16h8"/>'),
  users:icon('<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 6a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5"/>'),
  report:icon('<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 17v-3m3 3v-6m3 6v-4"/>'),
  chevron:icon('<path d="m9 5 7 7-7 7"/>'),
  scan:icon('<path d="M4 9V5a1 1 0 0 1 1-1h4m6 0h4a1 1 0 0 1 1 1v4M4 15v4a1 1 0 0 0 1 1h4m6 0h4a1 1 0 0 0 1-1v-4"/>')
 };
 function motionReduced(){return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}
 function ensureFieldVisible(field){
  const scroller=field?.closest?.('.journey-entry-panel');
  if(!scroller)return;
  const targetRect=field.getBoundingClientRect();
  const visibleRect=scroller.getBoundingClientRect();
  const space=18;
  if(targetRect.bottom>visibleRect.bottom-space)
   scroller.scrollTop+=targetRect.bottom-visibleRect.bottom+space;
  else if(targetRect.top<visibleRect.top+space)
   scroller.scrollTop-=visibleRect.top+space-targetRect.top;
 }
 function updateWorkspaceViewport(){
  const view=byId('view-journey');
  if(!view?.classList.contains('jp-workspace-open'))return;
  const viewport=window.visualViewport;
  const keyboardClearance=viewport?Math.max(0,window.innerHeight-viewport.height-viewport.offsetTop):0;
  // Navegación principal: si está presente, reservar el espacio real que ocupa.
  // El teclado y el dock no se suman: se usa el que más altura ocluye.
  const mobile=!!(window.matchMedia&&window.matchMedia('(max-width:760px)').matches);
  const dock=mobile?byId('cmMobileDock'):null;
  const dockStyle=dock?window.getComputedStyle(dock):null;
  const dockVisible=!!(dock&&dockStyle&&dockStyle.display!=='none'&&dockStyle.visibility!=='hidden');
  const dockRect=dockVisible?dock.getBoundingClientRect():null;
  const dockClearance=dockRect&&dockRect.height>0?Math.max(0,window.innerHeight-dockRect.top+12):0;
  const clearance=Math.max(keyboardClearance,dockClearance);
  view.style.setProperty('--jp-viewport-clearance',Math.ceil(clearance)+'px');
  const active=document.activeElement;
  if(active&&view.contains(active)&&active.closest?.('.journey-entry-panel'))
   requestAnimationFrame(()=>ensureFieldVisible(active));
 }
 function closeWorkspace(){
  const view=byId('view-journey');if(!view)return;
  view.classList.remove('jp-workspace-open');
  document.body.classList.remove('jp-workspace-modal-open');
  view.style.removeProperty('--jp-viewport-clearance');
  byId('jpJourneyActiveButton')?.focus({preventScroll:true});
 }
 function syncNavState(){
  const view=byId('view-journey');
  const active=!!(view&&view.classList.contains('active'));
  document.body.classList.toggle('jp-journey-active',active);
  if(!active&&view?.classList.contains('jp-workspace-open'))closeWorkspace();
  if(!active&&lookup&&!lookup.hidden)closeLookup();
 }
 function swipeToPane(index,animate=true){
  const layout=byId('view-journey')?.querySelector('.journey-layout');
  if(!layout)return;
  const maxIndex=Math.max(0,layout.children.length-1);
  const next=Math.max(0,Math.min(index,maxIndex));
  layout.scrollTo({left:next*layout.clientWidth,behavior:animate&&!motionReduced()?'smooth':'auto'});
  const label=byId('jpSwipePage');if(label)label.textContent=(next+1)+' / '+(maxIndex+1);
  const prev=byId('jpSwipePrev'),right=byId('jpSwipeNext');
  if(prev)prev.disabled=next===0;
  if(right)right.disabled=next===maxIndex;
 }
 function openWorkspace(mode){
  const view=byId('view-journey');
  if(!view)return;
  view.classList.add('jp-workspace-open');
  document.body.classList.add('jp-workspace-modal-open');
  updateWorkspaceViewport();
  requestAnimationFrame(()=>{
   updateWorkspaceViewport();
   swipeToPane(mode==='patients'?1:0,false);
   const focusId=mode==='patient'?'journeyPatientName':mode==='identity'?'journeyPatientId':mode==='tests'?'journeyPatientTestSearch':null;
   if(focusId)requestAnimationFrame(()=>{
    const field=byId(focusId);
    if(!field)return;
    ensureFieldVisible(field);
    field.focus({preventScroll:true});
   });
  });
 }
 // Búsqueda independiente del registro. Solo consulta expedientes sincronizados,
 // y nunca guarda ni crea pacientes hasta que se pulse Guardar en el formulario.
 let lookup=null,lookupInput=null,lookupList=null,lookupStatus=null,lookupReturnFocus=null;
 const normalized=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase('es').trim().replace(/\s+/g,' ');
 const documentKey=value=>String(value||'').toLocaleLowerCase('es').replace(/[^a-z0-9]/g,'');
 function patientRecords(){
  const all=window.FleboAppState?.get?.()?.patients||[];
  const unique=new Map();
  for(const person of Array.isArray(all)?all:[]){
   const id=String(person.document||person.cedula||'').trim(),key=documentKey(id);
   if(!key)continue; // Nunca usar coincidencia solo por nombre como identidad.
   const old=unique.get(key);
   const newer=Date.parse(person.updatedAt||person.createdAt||0)||0;
   const prior=old?(Date.parse(old.updatedAt||old.createdAt||0)||0):-1;
   if(!old||newer>=prior)unique.set(key,person);
  }
  return Array.from(unique.values());
 }
 function personName(p){
  return String(p.fullName||p.name||[p.firstName,p.lastName].filter(Boolean).join(' ')||'Paciente').trim();
 }
 function ensureLookup(){
  if(lookup)return;
  lookup=document.createElement('div');
  lookup.className='jp-lookup-overlay';
  lookup.hidden=true;
  lookup.id='jpPatientLookupOverlay';
  lookup.innerHTML=
   '<div class="jp-lookup-backdrop"></div>'+
   '<section class="jp-lookup-dialog" role="dialog" aria-modal="true" aria-labelledby="jpLookupTitle">'+
    '<header class="jp-lookup-head"><div><small>EXPEDIENTES EXISTENTES</small><h2 id="jpLookupTitle">Buscar paciente</h2><p>Busca por nombre, apellido o número de cédula.</p></div>'+
    '<button class="jp-lookup-close" type="button" aria-label="Cerrar búsqueda">×</button></header>'+
    '<label class="jp-lookup-search-label" for="jpPatientLookupInput">Nombre o cédula</label>'+
    '<input id="jpPatientLookupInput" type="search" autocomplete="off" placeholder="Escribe un nombre o cédula…" aria-controls="jpPatientLookupResults">'+
    '<div class="jp-lookup-status" role="status" aria-live="polite" id="jpPatientLookupStatus"></div>'+
    '<div class="jp-lookup-results" id="jpPatientLookupResults" role="list" aria-label="Pacientes encontrados"></div>'+
    '<footer class="jp-lookup-foot"><button class="jp-lookup-new" type="button">＋ Registrar paciente nuevo</button></footer>'+
   '</section>';
  document.body.appendChild(lookup);
  lookupInput=lookup.querySelector('#jpPatientLookupInput');
  lookupList=lookup.querySelector('#jpPatientLookupResults');
  lookupStatus=lookup.querySelector('#jpPatientLookupStatus');
  lookup.querySelector('.jp-lookup-close').addEventListener('click',closeLookup);
  lookup.querySelector('.jp-lookup-backdrop').addEventListener('click',closeLookup);
  lookup.querySelector('.jp-lookup-new').addEventListener('click',()=>{
   closeLookup();
   openWorkspace('patient');
  });
  lookupInput.addEventListener('input',renderLookup);
  lookup.addEventListener('keydown',e=>{
   if(e.key==='Escape'){e.preventDefault();closeLookup();}
   if(e.key!=='Tab')return;
   const items=Array.from(lookup.querySelectorAll('button:not([disabled]),input:not([disabled])'));
   if(!items.length)return;
   const first=items[0],last=items[items.length-1];
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  });
 }
 function closeLookup(){
  if(!lookup||lookup.hidden)return;
  lookup.hidden=true;
  document.body.classList.remove('jp-lookup-open');
  if(lookupReturnFocus?.isConnected)lookupReturnFocus.focus({preventScroll:true});
  lookupReturnFocus=null;
 }
 function openPatientLookup(){
  ensureLookup();
  lookupReturnFocus=document.activeElement;
  lookup.hidden=false;
  document.body.classList.add('jp-lookup-open');
  lookupInput.value='';
  renderLookup();
  requestAnimationFrame(()=>lookupInput.focus({preventScroll:true}));
 }
 function openMatchedPatient(p){
  const documentId=String(p.document||p.cedula||'').trim();
  if(!documentId)return;
  const field=byId('journeyPatientId');
  const existingDoc=documentKey(field?.value||'');
  if(existingDoc&&existingDoc!==documentKey(documentId)){
   const hasDraft=!!(byId('journeyPatientName')?.value||byId('journeyPatientLastName')?.value);
   if(hasDraft&&!window.confirm('Tienes un paciente diferente en el formulario. ¿Cargar el expediente seleccionado y reemplazar esos datos sin guardar?'))return;
  }
  const full=personName(p);
  const first=String(p.firstName||'').trim()||full.split(/\s+/)[0]||'';
  const last=String(p.lastName||'').trim()||full.slice(first.length).trim();
  // Si cambia la identidad se limpian solo las pruebas aún sin guardar del
  // formulario. Nunca se modifican pruebas ya registradas en la jornada.
  const switchingPatient=existingDoc!==documentKey(documentId);
  const previousTests=typeof window.readJourneyDraft==='function'
   ?window.readJourneyDraft().selectedTestIds||[]:[];
  const patch={name:first,lastName:last,document:documentId,birthDate:p.birthDate||'',sex:p.sex||'',search:'',
   selectedTestIds:switchingPatient?[]:previousTests};
  const form={journeyPatientName:patch.name,journeyPatientLastName:patch.lastName,
   journeyPatientId:patch.document,journeyPatientBirth:patch.birthDate,journeyPatientSex:patch.sex,
   journeyPatientTestSearch:''};
  for(const [id,value] of Object.entries(form)){const n=byId(id);if(n)n.value=value;}
  if(typeof window.persistJourneyDraft==='function')window.persistJourneyDraft(patch);
  if(typeof window.lookupExistingJourneyPatient==='function')window.lookupExistingJourneyPatient();
  if(typeof window.renderJourneyPatientChoices==='function')window.renderJourneyPatientChoices();
  closeLookup();
  openWorkspace(last?'tests':'patient');
  const hint=byId('journeyPatientLookupHint');
  const active=(window.FleboAppState?.get?.()?.journeyEntries||[]).some(e=>
   !e.removedAt&&String(e.journeyId)===String(window.FleboAppState?.get?.()?.journey?.id)&&
   String(e.patientId)===String(p.id));
  if(hint)hint.textContent=active
   ?'Este expediente ya participa en la jornada. Puedes agregar otras pruebas sin duplicar al paciente.'
   :'Expediente existente cargado. Selecciona las pruebas antes de guardar en la jornada.';
 }
 function renderLookup(){
  if(!lookupList)return;
  lookupList.replaceChildren();
  const term=normalized(lookupInput.value),doc=documentKey(lookupInput.value);
  if(term.length<2&&doc.length<2){
   lookupStatus.textContent='Escribe al menos 2 caracteres para buscar en expedientes registrados.';
   return;
  }
  const matches=patientRecords().filter(p=>
   normalized(personName(p)).includes(term)||documentKey(p.document||p.cedula).includes(doc));
  const ordered=matches.sort((a,b)=>personName(a).localeCompare(personName(b),'es')).slice(0,25);
  lookupStatus.textContent=matches.length
   ?matches.length+' expediente'+(matches.length===1?'':'s')+' encontrado'+(matches.length===1?'':'s')+
     (matches.length>25?' · Mostrando los primeros 25':'')
   :'No hay pacientes registrados que coincidan. Puedes registrar uno nuevo.';
  for(const p of ordered){
   const row=document.createElement('div');
   row.className='jp-lookup-result';row.setAttribute('role','listitem');
   const info=document.createElement('span');info.className='jp-lookup-result-copy';
   const name=document.createElement('strong');name.textContent=personName(p);
   const detail=document.createElement('small');
   detail.textContent='Cédula: '+String(p.document||p.cedula||'—');
   info.append(name,detail);
   const action=document.createElement('button');action.type='button';
   action.className='jp-lookup-select';action.textContent='Seleccionar';
   action.setAttribute('aria-label','Seleccionar expediente de '+personName(p));
   action.addEventListener('click',()=>openMatchedPatient(p));
   row.append(info,action);lookupList.appendChild(row);
  }
 }

 function updatePreview(){
  const chips=byId('journeySelectedTestChips');
  const labels=chips?Array.from(chips.querySelectorAll('.journey-test-chip strong')).map(x=>(x.textContent||'').trim()).filter(Boolean):[];
  const summary=byId('jpSelectedSummary');
  if(summary)summary.textContent=labels.length?labels.slice(0,2).join(', ')+(labels.length>2?' y '+(labels.length-2)+' más':'')+' ('+labels.length+')':'Busca y agrega pruebas del catálogo';
  const count=byId('journeyKpiInProgress')?.textContent?.trim()||'0';
  const pending=byId('jpPatientsInTakeSummary');
  if(pending)pending.textContent=count+' paciente'+(count==='1'?'':'s')+' con muestras pendientes';
 }
 function makeCard(action,title,subtitle,svg,variant){
  const button=document.createElement('button');
  button.type='button';
  button.className='jp-action-card jp-'+variant;
  button.setAttribute('aria-label',title);
  button.innerHTML='<span class="jp-action-icon">'+svg+'</span><span class="jp-action-copy"><strong>'+title+'</strong><small>'+subtitle+'</small></span><span class="jp-action-chevron">'+icons.chevron+'</span>';
  button.addEventListener('click',action);
  return button;
 }
 function enhance(){
  const view=byId('view-journey');
  if(!view||view.dataset.jpReference==='1')return;
  const oldHeading=view.querySelector(':scope > .page-heading');
  const kpis=view.querySelector(':scope > .journey-kpis');
  const layout=view.querySelector(':scope > .journey-layout');
  const report=view.querySelector(':scope > .journey-report-footer');
  const idField=byId('journeyPatientId')?.closest('.field');
  if(!oldHeading||!kpis||!layout||!report||!idField)return;
  view.dataset.jpReference='1';
  view.classList.add('jp-reference');
  const heading=document.createElement('header');
  heading.className='jp-heading';
  heading.innerHTML='<span class="jp-heading-icon">'+icons.clipboard+'</span><span class="jp-heading-copy"><h1>Jornada</h1><p>Registro y toma de pruebas</p></span><span class="jp-heading-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
  view.insertBefore(heading,kpis);
  // KPI existentes y actualizados por el motor clínico; solo se cambia su presentación.
  const kpiIcons=[icons.users,icons.flask,icon('<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>'),icon('<path d="M9 3h6M9 21h6M10 3v5l3 4-3 4v5M14 3v5l-3 4 3 4v5"/>')];
  kpis.querySelectorAll('.journey-kpi-icon').forEach((node,index)=>{
   if(kpiIcons[index])node.innerHTML=kpiIcons[index];
  });
  const active=document.createElement('button');
  active.type='button';active.className='jp-active-card';active.id='jpJourneyActiveButton';
  active.setAttribute('aria-label','Ver controles de la jornada activa');
  active.innerHTML='<span class="jp-action-icon jp-active-icon">'+icons.active+'</span><span class="jp-action-copy"><strong>Jornada activa</strong><small id="jpJourneyCurrentLabel">Jornada en curso</small></span><span class="jp-current-status"><i></i> En curso</span><span class="jp-action-chevron">'+icons.chevron+'</span>';
  active.addEventListener('click',()=>openWorkspace('overview'));
  kpis.insertAdjacentElement('afterend',active);
  const actions=document.createElement('div');actions.className='jp-actions';
  const search=makeCard(openPatientLookup,'Buscar paciente','Consulta expedientes por nombre o cédula',icons.search,'search');
  actions.appendChild(search);
  // La identificación y la selección de pruebas permanecen dentro del
  // formulario completo; la portada solo ofrece un acceso a ese registro.
  const register=makeCard(()=>openWorkspace('patient'),'Registrar paciente',
   'Nombre, apellidos, cédula, nacimiento, sexo y pruebas',icons.id,'register');
  actions.appendChild(register);
  const input=byId('journeyPatientId');
  if(input){input.placeholder='Ingresa la cédula o identificación';input.setAttribute('aria-label','Cédula o identificación del paciente');}
  const patients=makeCard(()=>openWorkspace('patients'),'Pacientes en toma','0 pacientes con muestras pendientes',icons.users,'patients');
  patients.querySelector('small').id='jpPatientsInTakeSummary';
  actions.appendChild(patients);
  active.insertAdjacentElement('afterend',actions);
  // Reubicamos la acción REAL de reportes: mantiene openJourneyReportSetup().
  actions.insertAdjacentElement('afterend',report);
  // El botón real de registro se conserva (sin duplicados) y se fija al
  // fondo del panel deslizante, en lugar de quedar oculto tras el formulario.
  const intake=view.querySelector('.journey-entry-panel');
  const registerActions=intake?.querySelector('.journey-submit-actions');
  if(intake&&registerActions)intake.insertAdjacentElement('afterend',registerActions);
  // Nueva jornada y resumen permanecen accesibles en herramientas, sin
  // ocupar la portada visual y sin eliminar ninguna función.
  const details=document.createElement('details');
  details.className='jp-tools';
  const summary=document.createElement('summary');summary.textContent='Opciones de jornada';
  details.appendChild(summary);
  details.appendChild(oldHeading);
  layout.insertAdjacentElement('afterend',details);
  const backdrop=document.createElement('div');
  backdrop.className='jp-swipe-backdrop';
  backdrop.setAttribute('aria-hidden','true');
  backdrop.addEventListener('click',closeWorkspace);
  layout.insertAdjacentElement('beforebegin',backdrop);
  const swipeHeader=document.createElement('nav');
  swipeHeader.className='jp-swipe-header';
  swipeHeader.setAttribute('aria-label','Controles del espacio de jornada');
  swipeHeader.innerHTML='<button class="jp-swipe-close" type="button" aria-label="Cerrar espacio de jornada">×</button><span class="jp-swipe-heading"><strong>Jornada activa</strong><small>Desliza a los lados para cambiar de sección</small></span><button class="jp-swipe-arrow" id="jpSwipePrev" type="button" aria-label="Sección anterior">‹</button><span id="jpSwipePage" aria-live="polite">1 / 2</span><button class="jp-swipe-arrow" id="jpSwipeNext" type="button" aria-label="Siguiente sección">›</button>';
  backdrop.insertAdjacentElement('afterend',swipeHeader);
  swipeHeader.querySelector('.jp-swipe-close').addEventListener('click',closeWorkspace);
  byId('jpSwipePrev').addEventListener('click',()=>swipeToPane(Math.round(layout.scrollLeft/Math.max(layout.clientWidth,1))-1));
  byId('jpSwipeNext').addEventListener('click',()=>swipeToPane(Math.round(layout.scrollLeft/Math.max(layout.clientWidth,1))+1));
  let swipeTick=false;
  layout.addEventListener('scroll',()=>{
   if(swipeTick)return;swipeTick=true;
   requestAnimationFrame(()=>{
    swipeTick=false;
    const current=Math.round(layout.scrollLeft/Math.max(layout.clientWidth,1));
    const label=byId('jpSwipePage'),prev=byId('jpSwipePrev'),next=byId('jpSwipeNext');
    if(label)label.textContent=(current+1)+' / '+layout.children.length;
    if(prev)prev.disabled=current===0;
    if(next)next.disabled=current===layout.children.length-1;
   });
  },{passive:true});
  layout.setAttribute('role','region');
  layout.setAttribute('aria-label','Registro y seguimiento de la jornada, deslizable horizontalmente');
  const workspaceToggle=document.createElement('button');
  workspaceToggle.type='button';workspaceToggle.className='jp-collapse-workspace';
  workspaceToggle.textContent='Cerrar detalles de jornada';
  workspaceToggle.addEventListener('click',closeWorkspace);
  layout.insertAdjacentElement('afterend',workspaceToggle);
  const chips=byId('journeySelectedTestChips');
  if(chips)new MutationObserver(updatePreview).observe(chips,{childList:true,subtree:true,characterData:true});
  const inProgress=byId('journeyKpiInProgress');
  if(inProgress)new MutationObserver(updatePreview).observe(inProgress,{characterData:true,childList:true,subtree:true});
  if(window.visualViewport){
   window.visualViewport.addEventListener('resize',updateWorkspaceViewport,{passive:true});
   window.visualViewport.addEventListener('scroll',updateWorkspaceViewport,{passive:true});
  }
  window.addEventListener('resize',updateWorkspaceViewport,{passive:true});
  view.addEventListener('focusin',updateWorkspaceViewport);
  updatePreview();syncNavState();
  new MutationObserver(syncNavState).observe(view,{attributes:true,attributeFilter:['class']});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance,{once:true});
 else enhance();
})();
