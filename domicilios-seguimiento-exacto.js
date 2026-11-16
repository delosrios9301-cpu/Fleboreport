/* FleboReport · vista aprobada de seguimiento de domicilios.
   Mejora exclusiva de presentación: reutiliza los controles y callbacks
   existentes para conservar permisos, pruebas, documentos y auditoría. */
(function(){
'use strict';
var selectedVisit='', selectedTab='seguimiento';
function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]});}
function svg(kind){
 var paths={
  back:'<path d="m15 18-6-6 6-6"/><path d="M9 12h12"/>',
  pulse:'<path d="M2 12h4l3-7 5 14 3-7h5"/>',
  person:'<circle cx="12" cy="7.5" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
  vial:'<path d="M8 3h8M9 3v11a4 4 0 1 0 6 0V3M8 7h8M12 12v4"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
  pin:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  phone:'<path d="M7 3 4 6c-2 2 2 9 6 13s11 8 13 6l-3-5-4 2-7-7 2-4-4-8Z" transform="translate(-1 -2) scale(.94)"/>',
  card:'<rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="8" cy="10" r="2"/><path d="M5 16c0-3 6-3 6 0M14 9h5M14 13h5M14 17h5"/>',
  refresh:'<path d="M20 7a8 8 0 0 0-14-1L3 9"/><path d="M3 3v6h6M4 17a8 8 0 0 0 14 1l3-3M21 21v-6h-6"/>',
  external:'<path d="M14 4h6v6M20 4l-9 9"/><path d="M20 14v6H4V4h6"/>',
  truck:'<path d="M2 6h12v11H2zM14 10h4l4 4v3h-8z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  check:'<path d="m4 12 5 5L20 6"/>'
 };
 return '<svg class="hv-track-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'+(paths[kind]||paths.check)+'</svg>';
}
function mapLink(address){
 var value=String(address||'').trim();
 if(!value)return '';
 if(/^https?:\/\//i.test(value)){
  try{
   var url=new URL(value),host=url.hostname.toLowerCase();
   if(url.protocol==='https:'&&((/^((www|maps)\.)?google\.[a-z.]+$/.test(host)&&url.pathname.startsWith('/maps'))||host==='maps.app.goo.gl'||(host==='goo.gl'&&url.pathname.startsWith('/maps'))))return url.href;
  }catch(_e){}
 }
 return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(value);
}
function labelStatus(status){
 return status==='Finalizado'?'Completado':String(status||'Pendiente');
}
function statusMessage(status){
 var messages={
  'Aceptado':'El domicilio fue aceptado. Se puede iniciar el desplazamiento.',
  'En camino':'El flebotomista va en camino al domicilio.',
  'En domicilio':'El flebotomista llegó al domicilio.',
  'Muestras tomadas':'Las muestras fueron registradas. Falta finalizar la visita.',
  'Finalizado':'La visita se completó correctamente.',
  'Pendiente de asignación':'La visita está pendiente de asignación.',
  'Pendiente de aceptación':'La visita espera confirmación del asignado.',
  'Cancelado':'La visita está cancelada.',
  'Paciente ausente':'El paciente no se encontraba en el domicilio.',
  'Paciente rechazó la toma':'El paciente rechazó la toma de muestra.',
  'No realizado':'La visita no pudo realizarse.'
 };
 return messages[status]||'Consulta el historial de la visita para más detalles.';
}
function progress(status){
 var stages=[['Aceptado','check'],['En camino','pin'],['En domicilio','pin'],['Muestras tomadas','vial'],['Finalizado','check']];
 var current=stages.findIndex(function(item){return item[0]===status});
 var terminal=['Cancelado','Rechazado','Paciente ausente','Paciente rechazó la toma','No realizado'].includes(status);
 return '<div class="hv-track-progress" aria-label="Progreso del domicilio: '+esc(labelStatus(status))+'">'+stages.map(function(item,i){
  var phase=current>=0?(i<current?'done':i===current?'current':'future'):'future';
  var text=item[0]==='Finalizado'?'Completado':item[0];
  return '<div class="hv-track-step '+phase+'"><span class="hv-track-step-node">'+(phase==='done'?svg('check'):phase==='current'?svg(item[1]):'')+'</span><span class="hv-track-step-label">'+esc(text)+'</span></div>';
 }).join('')+'</div>'+(terminal?'<span class="hv-track-terminal">Estado de incidencia: '+esc(status)+'</span>':'');
}
function mapThumbnail(){
 return '<div class="hv-track-map-thumb" role="img" aria-label="Ilustración de mapa; abre el enlace para consultar la ubicación real"><span class="hv-track-map-road road-a"></span><span class="hv-track-map-road road-b"></span><span class="hv-track-map-road road-c"></span><span class="hv-track-map-marker">'+svg('pin')+'</span></div>';
}
function tabButton(tab,label,icon){
 return '<button type="button" role="tab" data-hv-track-tab="'+tab+'" aria-controls="hv-track-tab-'+tab+'" aria-selected="false">'+svg(icon)+'<span>'+label+'</span></button>';
}
function setTab(dialog,tab){
 if(!dialog||!['seguimiento','paciente','pruebas'].includes(tab))return;
 selectedTab=tab;
 dialog.querySelectorAll('[data-hv-track-tab]').forEach(function(button){
  var on=button.getAttribute('data-hv-track-tab')===tab;
  button.classList.toggle('is-active',on);button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1;
 });
 dialog.querySelectorAll('[data-hv-track-panel]').forEach(function(panel){
  panel.hidden=panel.getAttribute('data-hv-track-panel')!==tab;
 });
}
function enhance(dialog,v){
 if(!dialog||!v||!v.id)return;
 var screen=dialog.querySelector('.hv-field-screen');
 if(!screen||screen.querySelector('.hv-assignment-overlay')||screen.querySelector('.hv-track-layout'))return;
 var cards=Array.from(screen.children).filter(function(el){return el.classList.contains('hv-field-card')});
 if(cards.length<6)return; // No modifica invitaciones ni datos protegidos.
 if(selectedVisit!==v.id){selectedVisit=v.id;selectedTab='seguimiento';}
 var banner=screen.querySelector('.hv-field-banner');
 if(!banner)return;
 var name=banner.querySelector('h2')?.textContent||v.patientName||'Paciente';
 var when=banner.querySelector('p')?.textContent||'';
 var priority=banner.querySelector('.hv-priority-label')?.textContent||'Prioridad: Normal';
 var status=String(v.status||'');
 var href=mapLink(v.address);
 var addressLink=href?'<a class="hv-track-location-link" target="_blank" rel="noopener noreferrer" href="'+esc(href)+'">'+svg('pin')+'<span>Ver ubicación</span>'+svg('external')+'</a>':'<span class="hv-track-location-missing">Ubicación no registrada</span>';
 var phone=String(v.phone||'').trim(),tel=phone.replace(/[^\d+]/g,'');
 var phoneText=phone&&tel?'<a href="tel:'+esc(tel)+'">'+esc(phone)+'</a>':'No registrado';
 var statusColor=['Cancelado','No realizado','Paciente ausente','Paciente rechazó la toma','Rechazado'].includes(status)?'is-warning':'';
 var markup=
 '<div class="hv-track-layout">'+
  '<header class="hv-track-brand"><div class="hv-track-logo" aria-hidden="true">♧</div><strong>FleboReport</strong><span class="hv-track-close-slot" data-hv-track-slot="close"></span></header>'+
  '<div class="hv-track-content">'+
   '<div class="hv-track-heading"><span class="hv-track-back-icon">'+svg('back')+'</span><div><h2>Ver seguimiento</h2><p>Visita a domicilio</p></div></div>'+
   '<section class="hv-track-hero" aria-label="Resumen de la visita"><div class="hv-track-hero-copy"><p class="hv-track-code">MI VISITA · '+esc(String(v.id).slice(0,8).toUpperCase())+'</p><h3>'+esc(name)+'</h3><p class="hv-track-when">'+svg('calendar')+esc(when)+'</p><div class="hv-track-chips"><span class="hv-track-state '+statusColor+'">'+svg(status==='En camino'?'pin':'check')+esc(labelStatus(status))+'</span><span class="hv-track-priority">'+esc(priority)+'</span></div></div><div class="hv-track-house" aria-hidden="true"><svg viewBox="0 0 130 120"><circle cx="67" cy="63" r="59" fill="#dcf8f2"/><path d="M28 66 67 32l38 34v38H28Z" fill="#fff"/><path d="M23 65 67 27l43 38" fill="none" stroke="#11a99a" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/><path d="M58 75h18v29H58Z" fill="#13998d"/><circle cx="106" cy="38" r="19" fill="#13ac82" stroke="#fff" stroke-width="3"/><path d="M106 28v20M96 38h20" stroke="#fff" stroke-width="5" stroke-linecap="round"/><circle cx="26" cy="102" r="16" fill="#91ddd0"/><circle cx="106" cy="103" r="16" fill="#91ddd0"/></svg></div></section>'+
   '<div class="hv-track-tabs" role="tablist" aria-label="Información del domicilio">'+tabButton('seguimiento','Seguimiento','pulse')+tabButton('paciente','Paciente','person')+tabButton('pruebas','Pruebas','vial')+'</div>'+
   '<section class="hv-track-tabpanel" role="tabpanel" id="hv-track-tab-seguimiento" data-hv-track-panel="seguimiento">'+
    '<section class="hv-track-card hv-track-status-card"><h3>Estado de la visita</h3>'+progress(status)+'<div class="hv-track-status-note">'+svg('truck')+'<span>'+esc(statusMessage(status))+'</span></div></section>'+
    '<section class="hv-track-card hv-track-patient-preview"><h3>'+svg('person')+'Paciente y ubicación</h3>'+
      '<div class="hv-track-detail-row"><span class="hv-track-detail-icon">'+svg('card')+'</span><div><small>Documento</small><strong>'+esc(v.document||'No registrado')+'</strong></div></div>'+
      '<div class="hv-track-detail-row"><span class="hv-track-detail-icon">'+svg('phone')+'</span><div><small>Teléfono</small><strong>'+phoneText+'</strong></div></div>'+
      '<div class="hv-track-detail-row hv-track-location-row"><span class="hv-track-detail-icon location">'+svg('pin')+'</span><div class="hv-track-location-copy"><small>Ubicación (domicilio)</small>'+addressLink+'</div>'+mapThumbnail()+'</div>'+
    '</section>'+
    '<details class="hv-track-disclosure"><summary>Actividad reciente</summary><div data-hv-track-slot="history"></div></details>'+
   '</section>'+
   '<section class="hv-track-tabpanel" id="hv-track-tab-paciente" role="tabpanel" data-hv-track-panel="paciente" hidden><div data-hv-track-slot="patient"></div><div data-hv-track-slot="observations"></div><div data-hv-track-slot="additional"></div></section>'+
   '<section class="hv-track-tabpanel" id="hv-track-tab-pruebas" role="tabpanel" data-hv-track-panel="pruebas" hidden><div data-hv-track-slot="tests"></div><div data-hv-track-slot="docs"></div></section>'+
  '</div>'+
  '<footer class="hv-track-footer"><button type="button" class="hv-track-update" data-hv-track-action-trigger aria-expanded="false" aria-controls="hv-track-action-list">'+svg('refresh')+'<span>Actualizar estado</span></button><div id="hv-track-action-list" class="hv-track-action-list" hidden><p>Selecciona la acción correspondiente</p><div data-hv-track-slot="actions"></div></div><div data-hv-track-slot="status-message"></div></footer>'+
 '</div>';
 screen.insertAdjacentHTML('afterbegin',markup);
 var layout=screen.querySelector('.hv-track-layout'),slot=function(name){return layout.querySelector('[data-hv-track-slot="'+name+'"]');};
 var close=dialog.querySelector(':scope > .hv-detail-close');if(close){close.textContent='×';slot('close').appendChild(close);}
 // Se trasladan los nodos originales (no copias): se conservan IDs, eventos y permisos.
 slot('patient').appendChild(cards[0]);slot('tests').appendChild(cards[1]);slot('docs').appendChild(cards[2]);
 slot('observations').appendChild(cards[3]);slot('actions').appendChild(cards[4]);slot('history').appendChild(cards[5]);
 var extra=dialog.querySelector(':scope > .hv-additional-panel');if(extra)slot('additional').appendChild(extra);
 var rawAddress=cards[0].querySelector('.hv-field-info .wide b');
 if(rawAddress&&/^https?:\/\//i.test(rawAddress.textContent.trim()))rawAddress.textContent='Enlace de Google Maps guardado';
 var oldMap=cards[0].querySelector('.hv-field-map');
 if(oldMap){if(href){oldMap.href=href;oldMap.textContent='Abrir en Google Maps';}else oldMap.remove();}
 var note=cards[4].querySelector('#hvFieldActionMessage');if(note)slot('status-message').appendChild(note);
 var trigger=layout.querySelector('[data-hv-track-action-trigger]'),list=layout.querySelector('.hv-track-action-list');
 var possible=cards[4].querySelectorAll('.hv-field-action');
 if(!possible.length){trigger.hidden=true;list.hidden=true;}
 else trigger.addEventListener('click',function(){list.hidden=!list.hidden;trigger.setAttribute('aria-expanded',String(!list.hidden));});
 layout.querySelectorAll('[data-hv-track-tab]').forEach(function(button){
  button.addEventListener('click',function(){setTab(dialog,button.getAttribute('data-hv-track-tab'));});
 });
 if(banner)banner.remove();
 screen.classList.add('hv-track-screen');dialog.classList.add('hv-tracking-dialog');
 setTab(dialog,selectedTab);
}
window.FleboTrackEnhance=enhance;
window.FleboTrackReset=function(){selectedVisit='';selectedTab='seguimiento';};
window.FleboTrackUtils={mapLink:mapLink,statusMessage:statusMessage};
})();