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
 function syncNavState(){
  const view=byId('view-journey');
  document.body.classList.toggle('jp-journey-active',!!(view&&view.classList.contains('active')));
 }
 function openWorkspace(mode){
  const view=byId('view-journey');
  if(!view)return;
  view.classList.add('jp-workspace-open');
  const entry=mode==='patient'||mode==='tests';
  const target=entry?view.querySelector('.journey-entry-panel'):mode==='patients'?view.querySelector('.journey-list-panel'):view.querySelector('.journey-tests-panel');
  if(target)requestAnimationFrame(()=>target.scrollIntoView({behavior:window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}));
  if(mode==='patient')requestAnimationFrame(()=>byId('journeyPatientName')?.focus({preventScroll:true}));
  if(mode==='tests')requestAnimationFrame(()=>byId('journeyPatientTestSearch')?.focus({preventScroll:true}));
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
  const idField=view.querySelector('.journey-patient-fields .field:has(#journeyPatientId)');
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
  active.type='button';active.className='jp-active-card';
  active.setAttribute('aria-label','Ver controles de la jornada activa');
  active.innerHTML='<span class="jp-action-icon jp-active-icon">'+icons.active+'</span><span class="jp-action-copy"><strong>Jornada activa</strong><small id="jpJourneyCurrentLabel">Jornada en curso</small></span><span class="jp-current-status"><i></i> En curso</span><span class="jp-action-chevron">'+icons.chevron+'</span>';
  active.addEventListener('click',()=>openWorkspace('patient'));
  kpis.insertAdjacentElement('afterend',active);
  const actions=document.createElement('div');actions.className='jp-actions';
  const search=makeCard(()=>openWorkspace('patient'),'Buscar paciente','Nombre, cédula o identificación',icons.search,'search');
  actions.appendChild(search);
  const identity=document.createElement('section');
  identity.className='jp-identity-card jp-aqua';
  identity.innerHTML='<span class="jp-action-icon">'+icons.id+'</span><div class="jp-identity-content"></div><span class="jp-scan-mark" aria-hidden="true">'+icons.scan+'</span>';
  const identityContent=identity.querySelector('.jp-identity-content');
  identityContent.appendChild(idField);
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
  const workspaceToggle=document.createElement('button');
  workspaceToggle.type='button';workspaceToggle.className='jp-collapse-workspace';
  workspaceToggle.textContent='Cerrar detalles de jornada';
  workspaceToggle.addEventListener('click',()=>{
   view.classList.remove('jp-workspace-open');
   heading.scrollIntoView({behavior:'auto',block:'start'});
  });
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
