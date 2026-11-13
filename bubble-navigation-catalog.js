/* FleboReport · Drawer de burbujas 2026-11-13
   Solo presentación y accesibilidad: el botón de notificaciones delega
   en el centro real y el menú conserva la navegación/roles originales. */
(function(){
 'use strict';
 function mount(){
  const sidebar=document.getElementById('sidebar');
  if(!sidebar||sidebar.dataset.bubbleMenuMounted==='true')return;
  sidebar.dataset.bubbleMenuMounted='true';
  sidebar.classList.add('bubble-navigation');
  const atmosphere=document.createElement('div');
  atmosphere.className='bubble-atmosphere';
  atmosphere.setAttribute('aria-hidden','true');
  for(const place of ['top','middle','bottom']){
   const orb=document.createElement('span');
   orb.className='bubble-atmosphere-orb '+place;
   atmosphere.appendChild(orb);
  }
  sidebar.insertBefore(atmosphere,sidebar.firstChild);
  const head=sidebar.querySelector('.module-menu-head');
  const close=head?.querySelector('.module-menu-close');
  if(head&&close&&!head.querySelector('.bubble-notification')){
   const bell=document.createElement('button');
   bell.type='button';bell.className='bubble-notification';
   bell.setAttribute('aria-label','Abrir notificaciones de FleboReport');
   bell.title='Notificaciones';
   bell.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-2 8-3 10h18c-1-2-3-3-3-10"/><path d="M10 21h4"/></svg>';
   bell.addEventListener('click',()=>{
    const control=document.getElementById('frNotifBell');
    if(control&&!control.hidden)control.click();
   });
   head.insertBefore(bell,close);
  }
  const nav=sidebar.querySelector('.nav-list');
  if(nav){
   nav.addEventListener('click',event=>{
    const item=event.target.closest('button[data-nav]');
    if(!item||item.disabled||item.hidden)return;
    // La navegación real la ejecuta el onclick de cada módulo;
    // las animaciones no sustituyen esas acciones ni saltan permisos.
    item.setAttribute('aria-current','page');
    nav.querySelectorAll('button[data-nav]').forEach(b=>{
     if(b!==item)b.removeAttribute('aria-current');
    });
   });
  }
  const update=()=>{
   // Historial general es único: el shell controla la ruta y el permiso.
   const history=[...sidebar.querySelectorAll('button[data-nav="audit"]')];
   if(history.length>1)history.slice(1).forEach(item=>item.remove());
   sidebar.querySelectorAll('button[data-nav]').forEach(item=>{
    if(item.classList.contains('active')&&!item.hidden)item.setAttribute('aria-current','page');
    else item.removeAttribute('aria-current');
   });
  };
  update();
  const shell=document.querySelector('.app-shell');
  if(shell)new MutationObserver(records=>{
   if(records.some(x=>x.target.classList?.contains('view')))update();
  }).observe(shell,{subtree:true,attributes:true,attributeFilter:['class']});
  window.addEventListener('flebo:auth-changed',update);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
 else mount();
})();