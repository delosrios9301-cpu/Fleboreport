/* FleboReport · Interacciones compactas progresivas.
   Sin llamadas a Supabase, escrituras ni lógica clínica. Se reutilizan
   los componentes originales y sus mismos identificadores. */
(()=>{
 'use strict';
 const byId=id=>document.getElementById(id);
 const modules={
  operacion:{label:'Operación',selectors:['.hp-trend-group','.hp-final-group']},
  muestras:{label:'Muestras',selectors:['[data-fr5-area="clinical-trace"]']},
  pruebas:{label:'Pruebas',selectors:['.hp-donuts-group','.hp-performance-group']},
  finanzas:{label:'Finanzas',selectors:['[data-fr5-area="financial-summary"]']}
 };
 let activeTab='operacion';
 let homeAttempts=0;
 function enhanceHome(){
  const home=byId('view-home');
  const flow=home?.querySelector('.hp-dashboard-flow');
  if(!flow||flow.querySelector('.frc-home-tabs'))return !!flow;
  const groupSelectors=Object.values(modules).flatMap(item=>item.selectors);
  const affected=groupSelectors.map(selector=>flow.querySelector(selector)).filter(Boolean);
  if(!affected.length)return false;
  const bar=document.createElement('nav');
  bar.className='frc-home-tabs';
  bar.setAttribute('role','tablist');
  bar.setAttribute('aria-label','Indicadores y gráficas por área');
  const buttons=[];
  const select=next=>{
   activeTab=next;
   for(const group of affected){
    const matches=modules[next].selectors.some(selector=>group.matches(selector));
    group.classList.toggle('frc-hidden',!matches);
    group.setAttribute('aria-hidden',matches?'false':'true');
   }
   for(const button of buttons){
    const selected=button.dataset.frcTab===next;
    button.setAttribute('aria-selected',String(selected));
    button.tabIndex=selected?0:-1;
   }
   // Los componentes gráficos conservan su mismo DOM y datos.
   // Resize permite recalcular el ancho cuando la sección vuelve a ser visible.
   window.dispatchEvent(new Event('resize'));
  };
  for(const [key,item] of Object.entries(modules)){
   if(!item.selectors.some(selector=>affected.some(group=>group.matches(selector))))continue;
   const button=document.createElement('button');
   button.type='button';button.role='tab';
   button.dataset.frcTab=key;
   button.textContent=item.label;
   button.addEventListener('click',()=>select(key));
   button.addEventListener('keydown',event=>{
    if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
    event.preventDefault();
    const all=buttons.filter(x=>x.isConnected),index=all.indexOf(button);
    const next=event.key==='Home'?0:event.key==='End'?all.length-1:
      (index+(event.key==='ArrowRight'?1:-1)+all.length)%all.length;
    select(all[next].dataset.frcTab);
    all[next].focus();
   });
   buttons.push(button);
   bar.appendChild(button);
  }
  const first=affected[0];
  const insertion=first?.closest('.hp-trend-group,.hp-donuts-group,.hp-performance-group,.hp-final-group')||first;
  flow.insertBefore(bar,insertion);
  select(modules[activeTab]?activeTab:'operacion');
  return true;
 }
 function enhanceProcessing(){
  const view=byId('view-clinical-processing');
  const search=byId('clinicalQueueSearch');
  const filter=search?.closest('.clinical-filter');
  if(!view||!filter||filter.dataset.frcCompact==='1')return false;
  const searchField=search.closest('.field');
  if(!searchField||searchField.parentNode!==filter||!filter.parentNode)return false;
  filter.dataset.frcCompact='1';
  const details=document.createElement('details');
  details.className='frc-processing-filters';
  const summary=document.createElement('summary');
  summary.textContent='Filtros avanzados · Estudio, visita, muestra, estado y fecha';
  details.appendChild(summary);
  // El buscador sigue visible; los selectores originales mantienen sus eventos.
  filter.parentNode.insertBefore(searchField,filter);
  searchField.classList.add('frc-processing-search');
  filter.replaceWith(details);
  details.appendChild(filter);
  const active=[...filter.querySelectorAll('input,select')].some(el=>Boolean(el.value));
  details.open=active;
  return true;
 }
 function enhanceJourney(){
  const view=byId('view-journey');
  const panel=view?.querySelector('.journey-tests-panel');
  if(!panel||panel.closest('.frc-journey-summary')||!panel.parentNode)return !!panel;
  const details=document.createElement('details');
  details.className='frc-journey-summary';
  const summary=document.createElement('summary');
  summary.setAttribute('aria-label','Mostrar u ocultar las pruebas acumuladas de la jornada');
  const title=document.createElement('span');
  title.textContent='Pruebas acumuladas';
  const count=document.createElement('strong');
  count.className='frc-summary-count';
  summary.append(title,count);
  const originalCount=byId('journeyTotal');
  if(originalCount){
   const update=()=>{count.textContent=originalCount.textContent.trim();};
   update();
   new MutationObserver(update).observe(originalCount,{childList:true,characterData:true,subtree:true});
  }
  details.appendChild(summary);
  panel.replaceWith(details);
  details.appendChild(panel);
  return true;
 }
 function enhanceNotifications(){
  const panel=byId('frNotifPanel');
  const list=byId('frNotifList');
  if(!panel||!list||panel.querySelector('.frc-notif-filters'))return false;
  const filters=document.createElement('div');
  filters.className='frc-notif-filters';
  filters.setAttribute('role','group');
  filters.setAttribute('aria-label','Mostrar notificaciones');
  const all=document.createElement('button'),unread=document.createElement('button');
  all.type='button';unread.type='button';
  all.textContent='Todas';unread.textContent='No leídas';
  const placeholder=document.createElement('p');
  placeholder.className='frc-unread-empty';
  placeholder.textContent='No hay avisos sin leer.';
  placeholder.hidden=true;
  const refresh=()=>{
   const selected=panel.classList.contains('frc-unread-only');
   all.setAttribute('aria-pressed',String(!selected));
   unread.setAttribute('aria-pressed',String(selected));
   const notices=list.querySelectorAll('.fr-notif-item');
   // No sustituir mensajes originales de error ni estados vacíos del servidor.
   placeholder.hidden=!selected||!notices.length||!!list.querySelector('.fr-notif-item.unread');
  };
  all.addEventListener('click',()=>{panel.classList.remove('frc-unread-only');refresh();});
  unread.addEventListener('click',()=>{panel.classList.add('frc-unread-only');refresh();});
  filters.append(unread,all);
  panel.insertBefore(filters,list);
  list.insertAdjacentElement('afterend',placeholder);
  new MutationObserver(refresh).observe(list,{childList:true});
  refresh();
  return true;
 }
 function install(){
  enhanceProcessing();
  enhanceJourney();
  enhanceNotifications();
  if(enhanceHome())return;
  // Inicio premium se monta tras restaurar autenticación y layout.
  // Reintentos acotados; no observar cada actualización clínica.
  if(homeAttempts++<30)window.setTimeout(()=>{if(!byId('view-home')?.querySelector('.frc-home-tabs'))enhanceHome()||install();},200);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
 else install();
 window.addEventListener('flebo:auth-changed',()=>{
  enhanceProcessing();enhanceJourney();enhanceHome();enhanceNotifications();
 });
 // El centro de notificaciones se crea solo al autenticarse; inicializar
 // sus pestañas cuando se abre por primera vez.
 document.addEventListener('click',event=>{
  if(event.target.closest('#frNotifBell'))window.setTimeout(enhanceNotifications,0);
 },true);
})();
