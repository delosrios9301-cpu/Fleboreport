/* FleboReport v331 · Domicilios disponibles sin revelar identidad ni ubicación */
(function(){
'use strict';
let client=null,workspaceId='',channel=null,offers=[],loading=false,busy='',pendingFocus='',timer=null,last=0;
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateLabel=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?'Fecha por confirmar':
 new Intl.DateTimeFormat('es-PA',{timeZone:'America/Panama',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d)};
// El servidor y el cliente comparan siempre la fecha civil de Panamá.
function panamaCalendarDay(value){
 const d=new Date(value);
 if(Number.isNaN(d.getTime()))return '';
 const fields=Object.fromEntries(
  new Intl.DateTimeFormat('en-US',{timeZone:'America/Panama',year:'numeric',month:'2-digit',day:'2-digit'})
   .formatToParts(d).filter(part=>['year','month','day'].includes(part.type))
   .map(part=>[part.type,part.value])
 );
 return fields.year+'-'+fields.month+'-'+fields.day;
}
function isScheduledToday(value){return panamaCalendarDay(value)===panamaCalendarDay(new Date())}
let observedPanamaDay=panamaCalendarDay(new Date());

function host(){
 const agenda=$('hvAgendaPanel');if(!agenda)return null;
 let panel=$('hvVolunteerPanel');if(panel)return panel;
 panel=document.createElement('section');panel.id='hvVolunteerPanel';panel.className='hv-volunteer-panel';panel.hidden=true;
 panel.innerHTML='<header class="hv-volunteer-header"><span class="hv-volunteer-graphic" aria-hidden="true">✦</span>'
 +'<div><strong>Domicilios disponibles</strong><p>Sin responsable · Asignación voluntaria</p></div>'
 +'<span id="hvVolunteerCount" class="hv-volunteer-count">0</span></header><div id="hvVolunteerRows" class="hv-volunteer-rows"></div>';
 panel.addEventListener('click',e=>{const button=e.target.closest('[data-hv-volunteer]');if(button)void claim(button.dataset.hvVolunteer)});
 agenda.prepend(panel);return panel;
}
function draw(){
 const panel=host();if(!panel)return;
 panel.hidden=!offers.length;
 if(!offers.length){$('hvVolunteerRows').replaceChildren();return}
 $('hvVolunteerCount').textContent=String(offers.length);
 $('hvVolunteerRows').innerHTML=offers.map(v=>{
  const priority=v.priority==='urgent'?'Urgente':v.priority==='high'?'Prioritario':'Normal';
  return '<article class="hv-volunteer-offer" data-hv-open-visit="'+esc(v.visit_id)+'">'
  +'<span class="hv-volunteer-offer-icon" aria-hidden="true">⌂</span>'
  +'<div class="hv-volunteer-offer-data"><strong>Visita sin responsable</strong>'
  +'<small>'+esc(dateLabel(v.scheduled_at))+' · '+esc(priority)+'</small>'
  +'<span>Datos del paciente protegidos hasta aceptar</span></div>'
  +'<button type="button" data-hv-volunteer="'+esc(v.visit_id)+'"'
  +(busy===String(v.visit_id)?' disabled':'')+'>'+(busy===String(v.visit_id)?'Asignando…':'Asignarme voluntariamente')+'</button></article>';
 }).join('');
 if(pendingFocus){
  const row=[...$('hvVolunteerRows').querySelectorAll('[data-hv-open-visit]')].find(x=>x.dataset.hvOpenVisit===pendingFocus);
  if(row){row.classList.add('is-target');row.scrollIntoView({behavior:'smooth',block:'center'});pendingFocus=''}
 }
}
function schedule(){
 if(timer)clearTimeout(timer);
 timer=setTimeout(()=>{timer=null;if(document.visibilityState!=='hidden')void load()},350);
}
async function connect(){
 const auth=window.FleboAuth;if(!auth)return false;
 const c=await auth.init(),user=auth.user,m=auth.membership;
 if(!user||!m?.workspace_id||m.active!==true)return false;
 if(workspaceId!==m.workspace_id||client!==c){
  if(client&&channel)client.removeChannel(channel);
  client=c;workspaceId=m.workspace_id;
  channel=client.channel('hv-volunteer-offers-'+workspaceId)
   .on('postgres_changes',{event:'*',schema:'public',table:'home_visits',filter:'workspace_id=eq.'+workspaceId},schedule)
   .on('postgres_changes',{event:'*',schema:'public',table:'home_visit_assignments',filter:'workspace_id=eq.'+workspaceId},schedule)
   .subscribe();
 }
 return true;
}
async function load(){
 if(loading||!host())return;
 loading=true;
 try{
  if(!await connect()){offers=[];draw();return}
  const {data,error}=await client.rpc('list_available_home_visits',{p_workspace_id:workspaceId});
  if(error)throw error;
  offers=(data||[]).filter(v=>v.visit_id&&v.scheduled_at&&isScheduledToday(v.scheduled_at));
  last=Date.now();draw();
 }catch(error){offers=[];draw();if(!['42501','PGRST301'].includes(error?.code))
  console.warn('[Domicilios] Consulta de ofertas:',error?.message||error)}
 finally{loading=false}
}
async function claim(id){
 if(busy)return;
 const offer=offers.find(v=>String(v.visit_id)===String(id));if(!offer)return;
 if(!isScheduledToday(offer.scheduled_at)){
  window.toast?.('Solo puedes asignarte un domicilio el día programado (hora de Panamá).');
  offers=offers.filter(v=>String(v.visit_id)!==String(id));draw();void load();return;
 }
 if(!navigator.onLine){window.toast?.('Necesitas Internet para aceptar un domicilio.');return}
 if(!window.confirm('¿Quieres asignarte voluntariamente este domicilio?\n\n'
  +'Programado: '+dateLabel(offer.scheduled_at)+'\n\n'
  +'Quedarás como responsable y coordinación recibirá una notificación.'))return;
 busy=String(id);draw();
 try{
  if(!await connect())throw new Error('Inicia sesión en el laboratorio.');
  const {data,error}=await client.rpc('volunteer_home_visit',{p_home_visit_id:String(id)});
  if(error)throw error;
  if(!data?.ok)throw new Error('El servidor no confirmó la asignación.');
  offers=offers.filter(v=>String(v.visit_id)!==String(id));busy='';draw();
  const ready=await window.hvRefreshVoluntary?.(String(id));
  window.toast?.(ready===false?'Asignación confirmada. Actualiza Domicilios para abrir la visita.':
   'Domicilio asumido voluntariamente. Se notificó a coordinación.');
  schedule();
 }catch(error){
  window.toast?.('No se pudo asignar: '+(error?.message||'otro usuario pudo tomar el domicilio.'));
  console.warn('[Domicilios] Reclamo:',error);schedule();
 }finally{busy='';draw()}
}
function focusAvailable(id){pendingFocus=String(id||'');host();if(offers.length)draw();else void load()}
function mount(){if(host())void load()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
window.addEventListener('flebo:domicilios-mounted',mount);
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState!=='visible')return;
 const nowDay=panamaCalendarDay(new Date());
 if(nowDay!==observedPanamaDay){observedPanamaDay=nowDay;offers=[];draw();}
 if(Date.now()-last>15000||!offers.length)schedule();
});
// Sin comprobaciones pesadas durante el día; detectar el cambio de fecha si la app queda abierta.
setInterval(()=>{
 const nowDay=panamaCalendarDay(new Date());
 if(nowDay===observedPanamaDay)return;
 observedPanamaDay=nowDay;offers=[];draw();
 if(document.visibilityState!=='hidden')schedule();
},60000);
window.addEventListener('flebo:auth-changed',()=>{offers=[];draw();schedule()});
window.FleboHomeVolunteer={refresh:load,focusAvailable};
})();
