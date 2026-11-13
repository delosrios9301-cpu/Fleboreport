/* FleboReport Inicio Premium v300.
   Capa exclusiva de presentación: reutiliza los 7 KPI, las 6 métricas
   clínicas, los gráficos, rutas, permisos y renderizadores existentes.
   No escribe estado, no crea cifras ni altera Supabase. */
(function(){
 'use strict';
 const $=(selector,root=document)=>root.querySelector(selector);
 const home=()=>$('#view-home');
 const area=(key)=>home()?.querySelector('[data-fr5-area="'+key+'"]');
 const chartObservers=new Map();
 let dashboardMounted=false;
 function section(className,elements){
  const node=document.createElement('div');
  node.className='hp-group '+className;
  elements.filter(Boolean).forEach(el=>node.appendChild(el));
  return node;
 }
 function title(text,subtitle){
  const heading=document.createElement('div');
  heading.className='hp-section-label';
  const h=document.createElement('h2');h.textContent=text;
  heading.appendChild(h);
  if(subtitle){const p=document.createElement('p');p.textContent=subtitle;heading.appendChild(p);}
  return heading;
 }
 function buildLayout(){
  const root=home();
  if(!root||root.classList.contains('hp-layout-ready'))return true;
  const hero=$(':scope > .fr2-home-hero',root);
  const stage=$('.vc-kpi-stage',root);
  const launch=$('.cm-launchpad',root);
  if(!hero||!stage||!launch||!area('patient-trend')||!area('clinical-trace'))return false;
  const flow=document.createElement('div');
  flow.className='hp-dashboard-flow';
  flow.setAttribute('aria-label','Panel operativo y estadísticas de FleboReport');
  const heading=document.createElement('div');
  heading.className='hp-home-heading';
  const copy=document.createElement('div');
  copy.className='hp-home-title';
  copy.innerHTML='<span class="hp-home-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M4 19V13m7 6V8m7 11V4"/></svg></span><h1>Panel de hoy</h1>';
  heading.appendChild(copy);
  const date=$('.fr2-home-date',hero);
  if(date){date.classList.add('hp-date-pill');heading.appendChild(date);}
  flow.append(heading,stage);
  const pager=document.createElement('nav');
  pager.className='hp-kpi-pager';pager.id='hpKpiPager';
  pager.setAttribute('aria-label','Páginas de indicadores');
  flow.appendChild(pager);
  flow.appendChild(launch);
  flow.appendChild(section('hp-trend-group',[area('patient-trend'),area('active-journey')]));
  flow.appendChild(area('clinical-trace'));
  flow.appendChild(section('hp-donuts-group',[area('service-mix'),area('patient-retention')]));
  flow.appendChild(section('hp-performance-group',[area('company-activity'),area('staff-activity'),area('top-services')]));
  flow.appendChild(area('financial-summary'));
  flow.appendChild(section('hp-alerts-group',[area('operation-alerts'),area('attention-funnel')]));
  flow.appendChild(section('hp-final-group',[area('medical-indicators'),area('recent-journeys'),area('locations')]));
  const oldActions=area('quick-actions');
  if(oldActions){
   const details=document.createElement('details');
   details.className='hp-extra-actions';
   const summary=document.createElement('summary');
   summary.textContent='Más acciones operativas';
   details.append(summary,oldActions);flow.appendChild(details);
  }
  const footer=area('dashboard-footer');
  if(footer){footer.setAttribute('aria-hidden','true');flow.appendChild(footer);}
  root.appendChild(flow);
  root.classList.add('hp-layout-ready');
  document.body.classList.add('hp-dashboard');
  const launchHeading=$('.cm-launchpad-head h2',launch);
  if(launchHeading)launchHeading.textContent='Acceso rápido';
  return true;
 }
 function setupPager(){
  const root=home(),track=$('#operationalKpis',root),pager=$('#hpKpiPager',root);
  if(!track||!pager||pager.dataset.hpReady==='1')return;
  pager.dataset.hpReady='1';
  track.setAttribute('tabindex','0');
  track.setAttribute('aria-label','Siete indicadores operativos; desliza horizontalmente o usa las flechas');
  let raf=0;
  function update(){
   raf=0;
   const width=Math.max(1,track.clientWidth);
   const pages=Math.max(1,Math.ceil((track.scrollWidth-1)/width));
   if(pager.children.length!==pages){
    const buttons=Array.from({length:pages},(_,index)=>{
     const b=document.createElement('button');
     b.type='button';b.className='hp-page-dot';
     b.setAttribute('aria-label','Mostrar grupo '+(index+1)+' de '+pages+' indicadores');
     b.addEventListener('click',()=>{
      const max=Math.max(0,track.scrollWidth-track.clientWidth);
      track.scrollTo({left:Math.min(max,index*track.clientWidth),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
     });
     return b;
    });
    pager.replaceChildren(...buttons);
   }
   const active=pages===1?0:Math.min(pages-1,Math.round(track.scrollLeft/width));
   Array.from(pager.children).forEach((b,i)=>{
    b.classList.toggle('is-active',i===active);
    b.setAttribute('aria-current',i===active?'true':'false');
   });
   pager.hidden=pages===1;
  }
  const schedule=()=>{if(!raf)raf=requestAnimationFrame(update);};
  track.addEventListener('scroll',schedule,{passive:true});
  track.addEventListener('keydown',event=>{
   if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
   event.preventDefault();
   const dx=event.key==='ArrowRight'?track.clientWidth:-track.clientWidth;
   track.scrollBy({left:dx,behavior:'smooth'});
  });
  if(typeof ResizeObserver==='function')new ResizeObserver(schedule).observe(track);
  new MutationObserver(schedule).observe(track,{childList:true});
  window.addEventListener('resize',schedule,{passive:true});
  schedule();
 }
 function barChart(hostId,sourceSelector,rowSelector,labelSelector,valueSelector){
  const host=document.getElementById(hostId);
  if(!host)return;
  const source=host.querySelector(sourceSelector);
  if(!source)return;
  const rows=Array.from(source.querySelectorAll(rowSelector)).map(node=>{
   const label=(node.querySelector(labelSelector)?.textContent||'').split(' · ')[0].trim();
   const count=Number((node.querySelector(valueSelector)?.textContent||'0').replace(/[^0-9.-]/g,''))||0;
   return {label,value:count};
  }).filter(x=>x.label);
  if(!rows.length)return;
  const signature=JSON.stringify(rows);
  const old=host.querySelector('.hp-columns-chart');
  if(old?.dataset.signature===signature)return;
  const totalMax=Math.max(1,...rows.map(x=>x.value));
  const chart=document.createElement('div');chart.className='hp-columns-chart';chart.dataset.signature=signature;
  chart.setAttribute('role','group');chart.setAttribute('aria-label','Gráfico de barras, selecciona una columna para consultar su cantidad');
  for(const item of rows.slice(0,8)){
   const button=document.createElement('button');button.type='button';button.className='hp-chart-column';
   button.setAttribute('aria-label',item.label+': '+item.value);
   button.title=item.label+': '+item.value;
   const val=document.createElement('b');val.textContent=String(item.value);
   const bar=document.createElement('span');bar.className='hp-column-track';
   const fill=document.createElement('i');fill.className='hp-column-fill';
   fill.style.height=(item.value?Math.max(4,Math.round(item.value/totalMax*100)):0)+'%';
   bar.appendChild(fill);
   const label=document.createElement('small');label.textContent=item.label;
   button.append(val,bar,label);
   button.addEventListener('click',()=>{
    chart.querySelectorAll('.hp-chart-column').forEach(el=>el.classList.toggle('selected',el===button));
   });
   chart.appendChild(button);
  }
  if(old)old.replaceWith(chart);else host.appendChild(chart);
  source.classList.add('hp-chart-original');
  source.setAttribute('aria-hidden','true');
 }
 function enhanceCharts(){
  barChart('dashProfessionals','.op-bars','.op-bar-row','.op-bar-label','.op-bar-value');
  barChart('dashClinicalTypes','.clinical-dash-type-list','.clinical-dash-row','span','b');
 }
 function observeCharts(){
  for(const id of ['dashProfessionals','dashClinicalTypes']){
   const host=document.getElementById(id);
   if(!host||chartObservers.has(id))continue;
   let queued=false;
   const observer=new MutationObserver(()=>{
    if(queued)return;queued=true;
    requestAnimationFrame(()=>{queued=false;enhanceCharts();});
   });
   observer.observe(host,{childList:true});
   chartObservers.set(id,observer);
  }
  enhanceCharts();
 }
 function enhance(){
  if(!buildLayout())return;
  if(dashboardMounted)return;
  dashboardMounted=true;
  setupPager();observeCharts();
 }
 function start(){
  enhance();
  if(dashboardMounted)return;
  let attempts=0;
  const retry=()=>{
   if(dashboardMounted||attempts++>=12)return;
   enhance();
   if(!dashboardMounted)window.setTimeout(retry,120);
  };
  window.setTimeout(retry,120);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
 window.addEventListener('flebo:auth-changed',enhance);
})();
