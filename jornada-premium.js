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
 function closeWorkspace(){
  const view=byId('view-journey');if(!view)return;
  view.classList.remove('jp-workspace-open');
  document.body.classList.remove('jp-workspace-modal-open');
  byId('jpJourneyActiveButton')?.focus({preventScroll:true});
 }
 function syncNavState(){
  const view=byId('view-journey');
  const active=!!(view&&view.classList.contains('active'));
  document.body.classList.toggle('jp-journey-active',active);
  if(!active&&view?.classList.contains('jp-workspace-open'))closeWorkspace();
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
  requestAnimationFrame(()=>{
   swipeToPane(mode==='patients'?1:0,false);
   const focusId=mode==='patient'?'journeyPatientName':mode==='identity'?'journeyPatientId':mode==='tests'?'journeyPatientTestSearch':null;
   if(focusId)requestAnimationFrame(()=>byId(focusId)?.focus({preventScroll:true}));
  });
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
  const search=makeCard(()=>openWorkspace('patient'),'Buscar paciente','Nombre, cédula o identificación',icons.search,'search');
  actions.appendChild(search);
  // La cédula es la clave única del paciente. Nunca mover el input original
  // fuera del formulario: registrar o buscar necesita nombre + identificación.
  const identity=document.createElement('button');
  identity.type='button';identity.className='jp-identity-card jp-aqua';
  identity.setAttribute('aria-label','Abrir registro para ingresar cédula o identificación');
  identity.innerHTML='<span class="jp-action-icon">'+icons.id+'</span><span class="jp-action-copy jp-identity-content"><strong>Cédula / identificación</strong><small>Ingresa el número único del paciente</small></span><span class="jp-action-chevron">'+icons.chevron+'</span>';
  identity.addEventListener('click',()=>openWorkspace('identity'));
  const input=byId('journeyPatientId');
  if(input){input.placeholder='Ingresa la cédula o identificación';input.setAttribute('aria-label','Cédula o identificación del paciente');}
  actions.appendChild(identity);
  const tests=makeCard(()=>openWorkspace('tests'),'Pruebas seleccionadas','Busca y agrega pruebas del catálogo',icons.flask,'tests');
  tests.querySelector('small').id='jpSelectedSummary';
  actions.appendChild(tests);
  const patients=makeCard(()=>openWorkspace('patients'),'Pacientes en toma','0 pacientes con muestras pendientes',icons.users,'patients');
  patients.querySelector('small').id='jpPatientsInTakeSummary';
  actions.appendChild(patients);
  active.insertAdjacentElement('afterend',actions);
  // Reubicamos la acción REAL de reportes: mantiene openJourneyReportSetup().
  actions.insertAdjacentElement('afterend',report);
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
  updatePreview();syncNavState();
  new MutationObserver(syncNavState).observe(view,{attributes:true,attributeFilter:['class']});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance,{once:true});
 else enhance();
})();
