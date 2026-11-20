/* FleboReport · Shell visual 2.0 — sólo presentación y navegación */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const roleNames={admin:'Administrador',coordinator:'Coordinador',office:'Coordinador',clinician:'Profesional clínico',technician:'Flebotomista',reception:'Recepción'};
 const labels={home:'Inicio',journey:'Jornadas',companies:'Empresas',patients:'Pacientes',domicilios:'Domicilios',catalog:'Catálogo de pruebas','clinical-studies':'Estudios clínicos','clinical-processing':'Procesamiento',reports:'Reportes',audit:'Historial general',settings:'Configuración'};
 // Coincide exactamente con la media query del menú en teléfono apaisado.
 // Un teléfono horizontal supera 760px, pero no debe adquirir el panel fijo
 // reservado a escritorio o tablet. No inspeccionar marca/modelo ni datos.
 const phoneLandscapeQuery='(orientation:landscape) and (max-height:700px) and (max-width:1400px) and (pointer:coarse)';
 const phoneLandscape=window.matchMedia(phoneLandscapeQuery);
 const inPhoneLandscape=()=>phoneLandscape.matches;
 let previousPhoneLandscape=inPhoneLandscape();
 function syncLandscapeNavigation(){
  const sidebar=$('sidebar'),landscape=inPhoneLandscape();
  if(landscape){
   // Sólo cerrar al entrar en horizontal, no en cada resize:
   // Chrome y Android cambian la altura disponible al mostrar el teclado
   // o las barras y antes re-cerraban el menú inmediatamente tras abrirlo.
   if(!previousPhoneLandscape){
    sidebar?.classList.remove('open');
    document.body.classList.remove('module-menu-open');
   }
   const open=!!sidebar?.classList.contains('open');
   sidebar?.setAttribute('aria-hidden',String(!open));
   $('moduleFab')?.setAttribute('aria-expanded',String(open));
   $('moduleFab')?.setAttribute('aria-label',open?'Cerrar menú de módulos':'Abrir menú de módulos');
   $('fr2MenuToggle')?.setAttribute('aria-expanded',String(open));
  }else if(previousPhoneLandscape&&window.innerWidth>760
   &&document.body.classList.contains('fr2-app-authorized')){
   // El escritorio recupera su menú persistente y semántica accesible.
   sidebar?.setAttribute('aria-hidden','false');
  }
  previousPhoneLandscape=landscape;
 }

 function mountHeader(){
  const header=document.querySelector('.app-shell .topbar');if(!header||header.dataset.fr2Mounted)return;
  const status=$('fleboSyncStatus');
  const notificationBell=$('frNotifBell');
  header.dataset.fr2Mounted='true';
  header.innerHTML='<div class="fr2-topbar-inner"><div class="fr2-topbar-left"><button type="button" class="fr2-menu-toggle" id="fr2MenuToggle" aria-label="Abrir navegación" aria-controls="sidebar" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16M4 12h16M4 17.5h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button><a href="#" class="fr2-brand-link" id="fr2HomeLink" aria-label="TALCSYS Lab, ir a Inicio"><span class="fr2-brand-mark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8C9.2 7 5.5 10.7 5.5 15a6.5 6.5 0 0 0 13 0C18.5 10.7 14.8 7 12 2.8Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 15.2c.2 1.6 1.2 2.5 2.8 2.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></span><span class="fr2-brand-copy"><strong>TALCSYS Lab</strong><small>GESTIÓN CLÍNICA INTEGRAL</small></span></a><span class="fr2-current-area" id="fr2CurrentArea">Inicio</span></div><div class="fr2-topbar-right"><span id="todayChip" hidden></span><button type="button" class="fr2-catalog-shortcut" id="fr2CatalogShortcut"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3.5h6M10 3.5v6l-5.2 8.2A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-3.3L14 9.5v-6M7.5 15h9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Catálogo de pruebas</span></button><div class="fr2-sync-holder" id="fr2SyncHolder"></div></div></div>';
  const holder=$('fr2SyncHolder');if(status&&holder)holder.appendChild(status);
  const right=header.querySelector('.fr2-topbar-right');if(notificationBell&&right)right.appendChild(notificationBell);
  $('fr2MenuToggle')?.addEventListener('click',()=>{if(typeof window.toggleDrawer==='function')window.toggleDrawer();$('fr2MenuToggle')?.setAttribute('aria-expanded',String($('sidebar')?.classList.contains('open')));});
  $('fr2HomeLink')?.addEventListener('click',e=>{e.preventDefault();window.navigate&&window.navigate('home')});
  $('fr2CatalogShortcut')?.addEventListener('click',()=>window.navigate&&window.navigate('catalog'));
 }
 function addHistoryNavigation(){
  const groups=[...document.querySelectorAll('#sidebar .nav-group')];
  const group=groups.find(g=>(g.querySelector('summary')?.textContent||'').toLowerCase().includes('informes'));
  if(!group)return;
  const list=group.querySelector('.nav-group-items');if(!list)return;
  const existing=[...document.querySelectorAll('#sidebar [data-nav="audit"]')];
  if(existing.length){
   const original=existing[0];
   list.appendChild(original);
   existing.slice(1).forEach(duplicate=>duplicate.remove());
   return;
  }
  const button=document.createElement('button');button.type='button';button.dataset.nav='audit';
  button.hidden=!(window.fleboCan&&window.fleboCan('audit','view'));button.innerHTML='<span class="nav-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12a8.5 8.5 0 1 0 2.2-5.7M3.5 4.5v4.8h4.8M12 7v5l3.3 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="nav-copy">Historial general</span>';
  button.addEventListener('click',()=>window.navigate&&window.navigate('audit'));list.appendChild(button);
 }
 function labelCurrentView(){
  const view=document.querySelector('.view.active');if(!view)return;
  const key=(view.id||'').replace(/^view-/,'');
  const label=labels[key]||document.querySelector('#sidebar [data-nav="'+key+'"] .nav-copy')?.textContent?.trim()||'FleboReport';
  const host=$('fr2CurrentArea');if(host)host.textContent=label;
  document.querySelectorAll('#sidebar [data-nav]').forEach(el=>el.classList.toggle('active',el.dataset.nav===key));
 }
 function updateAuthLayout(){
  const auth=window.FleboAuth||{};
  const ok=!!(auth.user&&auth.membership&&auth.membership.active===true);
  document.body.classList.toggle('fr2-app-authorized',ok); const sidebar=$('sidebar');
  if(sidebar&&ok&&window.innerWidth>760&&!inPhoneLandscape())sidebar.setAttribute('aria-hidden','false');
  if(sidebar&&inPhoneLandscape()&&!sidebar.classList.contains('open'))sidebar.setAttribute('aria-hidden','true');
  const role=document.querySelector('.fr2-brand-copy small');
  if(role&&ok){const roleName=roleNames[auth.membership.role]||'Espacio de trabajo';role.textContent='GESTIÓN CLÍNICA · '+roleName.toUpperCase();}
  const signout=$('fleboGlobalSignOut');
  if(signout){
   const label=signout.querySelector('.nav-copy');
   if(label)label.textContent='Cerrar sesión';
   else signout.textContent='Cerrar sesión';
  }
  placeSignOutAfterSettings();
 }
 function placeSignOutAfterSettings(){
  const sidebar=$('sidebar');
  const settings=sidebar?.querySelector('.nav-list [data-nav="settings"]');
  const signout=$('fleboGlobalSignOut');
  if(!sidebar||!settings||!signout)return;
  // Mover el botón REAL (con su evento de cierre de sesión), no copiarlo.
  // El pie fijo anterior se elimina visualmente: Cerrar sesión aparece
  // inmediatamente debajo de Configuración dentro del mismo grupo.
  if(signout.parentElement!==settings.parentElement
   ||signout.previousElementSibling!==settings){
   settings.insertAdjacentElement('afterend',signout);
  }
  signout.classList.add('fr2-nav-signout');
  if(!signout.querySelector('.nav-copy')){
   signout.innerHTML='<span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M14 8l4 4-4 4M9 12h9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="nav-copy">Cerrar sesión</span>';
  }
  if(signout.getAttribute('aria-label')!=='Cerrar sesión')
   signout.setAttribute('aria-label','Cerrar sesión');
  const footer=sidebar.querySelector('.drawer-footer');
  if(footer&&!footer.hidden)footer.hidden=true;
 }
 function renameNavigation(){
  const names={'clinical-studies':'Estudios clínicos','clinical-processing':'Procesamiento','catalog':'Catálogo de pruebas'};
  Object.entries(names).forEach(([key,value])=>{const host=document.querySelector('#sidebar [data-nav="'+key+'"] .nav-copy');if(host)host.textContent=value;});
 }
 function start(){
  mountHeader();addHistoryNavigation();renameNavigation();updateAuthLayout();placeSignOutAfterSettings();labelCurrentView();
  syncLandscapeNavigation();
  window.addEventListener('flebo:auth-changed',()=>{updateAuthLayout();mountHeader();syncLandscapeNavigation();});
  const gate=$('fleboAuthGate');
  if(gate)new MutationObserver(updateAuthLayout).observe(gate,{attributes:true,attributeFilter:['hidden']});
  const shell=$('.app-shell');
  if(shell)new MutationObserver(records=>{if(records.some(r=>r.target.classList?.contains('view')))labelCurrentView()}).observe(shell,{subtree:true,attributes:true,attributeFilter:['class']});
  // Abrir, cerrar, cerrar al navegar o girar: conservar siempre la semántica
  // de los botones sin crear nuevos menús ni alterar permisos.
  const drawer=$('sidebar');
  // El módulo de autenticación ubica el botón después de Configuración.
  // No observar todos los cambios del menú: antes provocaba un bucle de
  // movimientos con el pie de sesión y retrasaba la apertura del APK.
  if(drawer)new MutationObserver(()=>{
   if(!inPhoneLandscape())return;
   const open=drawer.classList.contains('open');
   drawer.setAttribute('aria-hidden',String(!open));
   $('moduleFab')?.setAttribute('aria-expanded',String(open));
   $('moduleFab')?.setAttribute('aria-label',open?'Cerrar menú de módulos':'Abrir menú de módulos');
   $('fr2MenuToggle')?.setAttribute('aria-expanded',String(open));
  }).observe(drawer,{attributes:true,attributeFilter:['class']});
  document.addEventListener('click',e=>{if(e.target.closest('#sidebar [data-nav]'))setTimeout(labelCurrentView,0)});
  window.addEventListener('resize',()=>{syncLandscapeNavigation();if(window.innerWidth>760&&!inPhoneLandscape()){$('fr2MenuToggle')?.setAttribute('aria-expanded','false')}});
  phoneLandscape.addEventListener?.('change',syncLandscapeNavigation);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();