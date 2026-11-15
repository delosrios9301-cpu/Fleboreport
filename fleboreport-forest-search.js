/* FleboReport · búsqueda rápida en la cabecera.
   Opera exclusivamente sobre filtros YA existentes en la sesión autorizada.
   No consulta datos externos, no filtra módulos sin permiso ni inventa resultados. */
(function(){
 'use strict';
 const allowed={
  patients:{search:'patientSearch',label:'Pacientes'},
  domicilios:{search:'hvSearch',label:'Domicilios'},
  'clinical-processing':{search:'clinicalQueueSearch',label:'Muestras'},
  catalog:{search:'catalogSearch',label:'Pruebas'}
 };
 let mounted=false;
 function canVisit(view){
  const btn=Array.from(document.querySelectorAll('#sidebar button[data-nav]')).find(x=>x.dataset.nav===view);
  return !!btn && !btn.hidden && !btn.disabled && btn.getAttribute('aria-hidden')!=='true';
 }
 function mount(){
  if(mounted||!document.body.classList.contains('fr2-app-authorized'))return false;
  const shell=document.querySelector('.app-shell .topbar .fr2-topbar-inner');
  if(!shell||!document.getElementById('fr2MenuToggle'))return false;
  if(document.getElementById('forestQuickSearch')){mounted=true;return true;}
  const form=document.createElement('form');
  form.id='forestQuickSearch';form.className='forest-quick-search no-print';
  form.setAttribute('role','search');
  form.setAttribute('aria-label','Búsqueda rápida en los módulos con permiso');
  const select=document.createElement('select');
  select.id='forestSearchArea';select.setAttribute('aria-label','Buscar en');
  for(const [value,entry] of Object.entries(allowed)){
   if(!canVisit(value))continue;
   const option=document.createElement('option');option.value=value;option.textContent=entry.label;
   select.appendChild(option);
  }
  if(!select.options.length)return false;
  const input=document.createElement('input');
  input.type='search';input.id='forestSearchInput';input.autocomplete='off';
  input.placeholder='Buscar nombre, cédula o muestra…';input.setAttribute('aria-label','Texto de búsqueda');
  const button=document.createElement('button');button.type='submit';button.className='forest-search-go';
  button.setAttribute('aria-label','Buscar');
  button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7.1"/><path d="m16.1 16.1 5.2 5.2"/></svg>';
  form.append(select,input,button);
  form.addEventListener('submit',event=>{
   event.preventDefault();
   const target=select.value,query=input.value.trim();
   if(!query||!allowed[target]||!canVisit(target)||typeof window.navigate!=='function')return;
   window.navigate(target);
   // Navigation uses the app's own permission and rendering controls.
   // Forward the query to the existing UI filter, never to a new data store.
   requestAnimationFrame(()=>{
    const existing=document.getElementById(allowed[target].search);
    if(!existing)return;
    existing.value=query;
    existing.dispatchEvent(new Event('input',{bubbles:true}));
    if(typeof existing.focus==='function')existing.focus({preventScroll:true});
   });
  });
  shell.insertBefore(form,shell.querySelector('.fr2-topbar-right'));
  document.addEventListener('keydown',event=>{
   if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
    if(!document.body.classList.contains('fr2-app-authorized'))return;
    event.preventDefault();input.focus();input.select();
   }
  });
  mounted=true;return true;
 }
 function start(){
  if(mount())return;
  const host=document.querySelector('.app-shell .topbar')||document.body;
  const watcher=new MutationObserver(()=>{if(mount())watcher.disconnect();});
  watcher.observe(host,{childList:true,subtree:true});
  window.addEventListener('flebo:auth-changed',mount);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})();