/* FleboReport — Domicilios: gestos visuales de Variante C.
   Solo interacción de presentación: nunca ejecuta estados clínicos ni RPC. */
(function(){
 'use strict';
 const surfaceSelector=[
  '#view-domicilios .hv-premium-visit',
  '#view-domicilios .hv-module-tab',
  '#view-domicilios .hv-cal-day',
  '#view-domicilios .hv-cal-event',
  '#view-domicilios .hv-premium-hero-actions .btn',
  '#view-domicilios #hvCreatePanel .form-actions button',
  '.hv-detail-dialog .hv-actions button',
  '.hv-detail-dialog .hv-premium-detail-section button',
  '.hv-assignment-modal button',
  '.hv-review-modal button'
 ].join(',');
 const reduce=()=>!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 function onPointerDown(event){
  if(reduce()||!document.body.classList.contains('vc-compact'))return;
  const target=event.target instanceof Element?event.target:null;
  const surface=target&&target.closest(surfaceSelector);
  if(!surface||surface.disabled||surface.hidden)return;
  const r=surface.getBoundingClientRect();
  if(r.width<1||r.height<1)return;
  // La onda se dibuja dentro del botón; no intercepta eventos ni retrasa
  // las acciones preexistentes (hvSelect, hvStatus, hvCreate, etc.).
  const diameter=Math.max(r.width,r.height)*1.65;
  const pulse=document.createElement('span');
  pulse.className='hv-premium-touch-ripple';
  pulse.setAttribute('aria-hidden','true');
  pulse.style.width=diameter+'px';
  pulse.style.height=diameter+'px';
  pulse.style.left=event.clientX-r.left-diameter/2+'px';
  pulse.style.top=event.clientY-r.top-diameter/2+'px';
  pulse.addEventListener('animationend',()=>pulse.remove(),{once:true});
  surface.querySelectorAll(':scope > .hv-premium-touch-ripple').forEach(node=>node.remove());
  surface.appendChild(pulse);
 }
 function ready(){
  // Delegación única: las tarjetas se redibujan al filtrar/recibir visitas.
  document.addEventListener('pointerdown',onPointerDown,{passive:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});
 else ready();
})();
