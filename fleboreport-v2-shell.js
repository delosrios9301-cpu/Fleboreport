/* FleboReport · Shell visual 2.0 — sólo presentación y navegación */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const roleNames={admin:'Administrador',coordinator:'Coordinador',office:'Coordinador',clinician:'Profesional clínico',technician:'Flebotomista',reception:'Recepción'};
 const labels={home:'Inicio',journey:'Jornadas',companies:'Empresas',patients:'Pacientes',domicilios:'Domicilios',catalog:'Catálogo de pruebas','clinical-studies':'Estudios clínicos','clinical-processing':'Procesamiento',reports:'Reportes',audit:'Historial general',settings:'Configuración'};
 function mountHeader(){
  const header=document.querySelector('.app-shell .topbar');if(!header||header.dataset.fr2Mounted)return;
  const status=$('fleboSyncStatus');
  header.dataset.fr2Mounted='true';
  header.innerHTML='<div class="fr2-topbar-inner"><div class="fr2-topbar-left"><button type="button" class="fr2-menu-toggle" id="fr2MenuToggle" aria-label="Abrir navegación" aria-controls="sidebar" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16M4 12h16M4 17.5h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button><a href="#" class="fr2-brand-link" id="fr2HomeLink" aria-label="FleboReport, ir a Inicio"><span class="fr2-brand-mark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8C9.2 7 5.5 10.7 5.5 15a6.5 6.5 0 0 0 13 0C18.5 10.7 14.8 7 12 2.8Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 15.2c.2 1.6 1.2 2.5 2.8 2.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></span><span class="fr2-brand-copy"><strong>FleboReport</strong><small>GESTIÓN CLÍNICA INTEGRAL</small></span></a><span class="fr2-current-area" id="fr2CurrentArea">Inicio</span></div><div class="fr2-topbar-right"><button type="button" class="fr2-catalog-shortcut" id="fr2CatalogShortcut"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3.5h6M10 3.5v6l-5.2 8.2A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-3.3L14 9.5v-6M7.5 15h9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Catálogo de pruebas</span></button><div class="fr2-sync-holder" id="fr2SyncHolder"></div></div></div>';
  const holder=$('fr2SyncHolder');if(status&&holder)holder.appendChild(status);
  $('fr2MenuToggle')?.addEventListener('click',()=>{if(typeof window.toggleDrawer==='function')window.toggleDrawer();$('fr2MenuToggle')?.setAttribute('aria-expanded',String($('sidebar')?.classList.contains('open')));});
  $('fr2HomeLink')?.addEventListener('click',e=>{e.preventDefault();window.navigate&&window.navigate('home')});
  $('fr2CatalogShortcut')?.addEventListener('click',()=>window.navigate&&window.navigate('catalog'));
 }
 function addHistoryNavigation(){
  const groups=[...document.querySelectorAll('#sidebar .nav-group')];
  const group=groups.find(g=>(g.querySelector('summary')?.textContent||'').toLowerCase().includes('informes'));
  if(!group||group.querySelector('[data-nav="audit"]'))return;
  const list=group.querySelector('.nav-group-items');if(!list)return;
  const button=document.createElement('button');button.type='button';button.dataset.nav='audit';button.innerHTML='<span class="nav-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12a8.5 8.5 0 1 0 2.2-5.7M3.5 4.5v4.8h4.8M12 7v5l3.3 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="nav-copy">Historial general</span>';
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
  document.body.classList.toggle('fr2-app-authorized',ok); const sidebar=$('sidebar'); if(sidebar&&ok&&window.innerWidth>760)sidebar.setAttribute('aria-hidden','false');
  const role=document.querySelector('.fr2-brand-copy small');
  if(role&&ok){const roleName=roleNames[auth.membership.role]||'Espacio de trabajo';role.textContent='GESTIÓN CLÍNICA · '+roleName.toUpperCase();}
  const signout=$('fleboGlobalSignOut');
  if(signout)signout.textContent='Cerrar sesión';
 }
 function renameNavigation(){
  const names={'clinical-studies':'Estudios clínicos','clinical-processing':'Procesamiento','catalog':'Catálogo de pruebas'};
  Object.entries(names).forEach(([key,value])=>{const host=document.querySelector('#sidebar [data-nav="'+key+'"] .nav-copy');if(host)host.textContent=value;});
 }
 function start(){
  mountHeader();addHistoryNavigation();renameNavigation();updateAuthLayout();labelCurrentView();
  window.addEventListener('flebo:auth-changed',()=>{updateAuthLayout();mountHeader();});
  const gate=$('fleboAuthGate');
  if(gate)new MutationObserver(updateAuthLayout).observe(gate,{attributes:true,attributeFilter:['hidden']});
  const shell=$('.app-shell');
  if(shell)new MutationObserver(records=>{if(records.some(r=>r.target.classList?.contains('view')))labelCurrentView()}).observe(shell,{subtree:true,attributes:true,attributeFilter:['class']});
  document.addEventListener('click',e=>{if(e.target.closest('#sidebar [data-nav]'))setTimeout(labelCurrentView,0)});
  window.addEventListener('resize',()=>{if(window.innerWidth>760){const btn=$('fr2MenuToggle');btn?.setAttribute('aria-expanded','false')}});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();