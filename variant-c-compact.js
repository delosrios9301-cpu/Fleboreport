/* FleboReport — Variante C, capa visual. Reutiliza rutas originales y datos reales. */
(function(){
 'use strict';
 const $=(selector,root=document)=>root.querySelector(selector);
 const paths={
  journey:{title:'Jornada',subtitle:'Registro de tomas',icon:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 10h7M9 14h7M9 18h5"/>'},
  domicilios:{title:'Domicilios',subtitle:'Visitas asignadas',icon:'<path d="m3 10 9-7 9 7v11H3zM9 21v-7h6v7"/>'},
  'clinical-studies':{title:'Estudios',subtitle:'Catálogo y pruebas',icon:'<path d="M9 3h6M10 3v7l-5.5 8.4A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.6L14 10V3M8 15h8"/>'},
  reports:{title:'Reportes',subtitle:'Resultados y control',icon:'<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 16v-3m4 3V8m4 8v-5"/>'}
 };
 const glyph=source=>'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+source+'</svg>';
 const chevron=glyph('<path d="m9 5 7 7-7 7"/>');
 const arrowLeft=glyph('<path d="m15 5-7 7 7 7"/>');
 function permitted(key){
  const source=$('#sidebar [data-nav="'+key+'"]');
  if(!source)return false;
  for(let node=source;node&&node.id!=='sidebar';node=node.parentElement){
   if(node.hidden||node.getAttribute('aria-hidden')==='true'||getComputedStyle(node).display==='none')return false;
  }
  return true;
 }
 function navigateTo(key){
  if(!permitted(key))return;
  const source=$('#sidebar [data-nav="'+key+'"]');
  if(source)source.click();
 }
 function decorateBrand(){
  const brand=$('.topbar .fr2-brand-mark');
  if(brand&&!brand.dataset.vcDecorated){
   brand.dataset.vcDecorated='true';
   brand.innerHTML='<svg viewBox="0 0 40 40" aria-hidden="true"><g transform="rotate(30 18 17)" fill="none" stroke="#5a31cc" stroke-width="2.9" stroke-linejoin="round" stroke-linecap="round"><path d="M13 5h12M17 5v6L12 24a6 6 0 0 0 11 4l4-12-6-5V5"/><path d="M14 23h11" stroke="#08c7db" stroke-width="3"/></g><path d="M30 26c-2 3-4 5.2-4 7.5a4 4 0 1 0 8 0C34 31.2 32 29 30 26Z" fill="#05c6d7"/></svg>';
  }
  const subtitle=$('.topbar .fr2-brand-copy small');
  if(subtitle)subtitle.textContent='Panel clínico';
 }
 function mountKpis(){
  const home=$('#view-home'),kpis=$('#operationalKpis');
  if(!home||!kpis||kpis.closest('.vc-kpi-stage'))return;
  const stage=document.createElement('div');stage.className='vc-kpi-stage no-print';
  stage.setAttribute('aria-label','Indicadores del panel de hoy');
  const makeArrow=(direction,label,art)=>{
   const button=document.createElement('button');
   button.type='button';button.className='vc-kpi-arrow vc-kpi-'+direction;
   button.setAttribute('aria-label',label);button.innerHTML=art;
   button.addEventListener('click',()=>kpis.scrollBy({left:(direction==='next'?1:-1)*Math.max(180,kpis.clientWidth*.68),behavior:'smooth'}));
   return button;
  };
  const prev=makeArrow('prev','Ver indicadores anteriores',arrowLeft);
  const next=makeArrow('next','Ver más indicadores',chevron);
  stage.appendChild(prev);kpis.parentNode.insertBefore(stage,kpis);stage.appendChild(kpis);stage.appendChild(next);
  const sync=()=>{
   const max=kpis.scrollWidth-kpis.clientWidth;
   prev.disabled=max<=2||kpis.scrollLeft<2;
   next.disabled=max<=2||kpis.scrollLeft>max-2;
  };
  kpis.addEventListener('scroll',sync,{passive:true});
  new ResizeObserver(sync).observe(kpis);
  new MutationObserver(sync).observe(kpis,{childList:true});
  requestAnimationFrame(sync);
 }
 function mountShortcuts(){
  const section=$('#view-home .cm-launchpad');
  const host=section&&$('.cm-launchpad-body',section);
  if(!host||$('.vc-launch-grid',host))return;
  const grid=document.createElement('div');grid.className='vc-launch-grid';
  grid.setAttribute('aria-label','Acceso rápido a módulos');
  for(const key of ['journey','domicilios','clinical-studies','reports']){
   const item=paths[key],button=document.createElement('button');
   button.type='button';button.className='vc-shortcut';button.dataset.vcNav=key;
   const ic=document.createElement('span');ic.className='vc-shortcut-icon';ic.innerHTML=glyph(item.icon);
   const caption=document.createElement('span');
   const strong=document.createElement('strong');strong.textContent=item.title;
   const small=document.createElement('small');small.textContent=item.subtitle;
   caption.append(strong,small);
   const right=document.createElement('span');right.className='vc-shortcut-chevron';right.innerHTML=chevron;right.setAttribute('aria-hidden','true');
   button.append(ic,caption,right);
   button.addEventListener('click',()=>navigateTo(key));
   grid.appendChild(button);
  }
  host.insertBefore(grid,host.firstChild);
  const h=$('.cm-launchpad-head h2',section);if(h)h.textContent='Acceso rápido';
  refreshPermissions();
 }
 function refreshPermissions(){
  for(const button of document.querySelectorAll('.vc-shortcut[data-vc-nav]')){
   button.hidden=!permitted(button.dataset.vcNav);
  }
 }
 let queued=false;
 function updateContext(){
  const bar=$('#cmContextBar');
  if(bar?.dataset.area==='home'){
   const title=$('#cmContextTitle');if(title)title.textContent='Panel de hoy';
  }
  refreshPermissions();
 }
 function queueUpdate(){
  if(queued)return;queued=true;
  requestAnimationFrame(()=>{queued=false;decorateBrand();mountKpis();mountShortcuts();updateContext()});
 }
 function start(){
  if(!$('.app-shell .content'))return;
  document.body.classList.add('vc-compact');
  decorateBrand();mountKpis();mountShortcuts();queueUpdate();
  const bar=$('#cmContextBar');
  if(bar)new MutationObserver(queueUpdate).observe(bar,{attributes:true,attributeFilter:['data-area']});
  const content=$('.app-shell .content');
  if(content)new MutationObserver(records=>{
   if(records.some(r=>r.type==='attributes'&&r.target.classList?.contains('view')))queueUpdate();
  }).observe(content,{subtree:true,attributes:true,attributeFilter:['class']});
  const sidebar=$('#sidebar');
  if(sidebar)new MutationObserver(queueUpdate).observe(sidebar,{subtree:true,attributes:true,attributeFilter:['hidden','aria-hidden','style']});
  window.addEventListener('flebo:auth-changed',queueUpdate);
  window.addEventListener('resize',queueUpdate,{passive:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})();
