(function(){
'use strict';
const TABLE='patients';
let client=null,userId=null,workspaceId=null,channel=null,ready=false,busy=false,dirty=false,timer=null,lastContent=new Map(),pendingKeys=new Set(),initialized=false,patientRefreshPending=false;
let remoteRefreshTimer=null,remoteRefreshQueued=false;
let syncStatus='idle';
function reportSync(status,message){
 syncStatus=status;
 window.dispatchEvent(new CustomEvent('flebo:patient-sync-status',{detail:{status,message}}));
}
const app=()=>window.FleboAppState?.get?.();
const norm=v=>String(v||'').trim().toLocaleLowerCase('es').replace(/[^a-z0-9]/g,'');
const docOf=p=>String(p?.document||p?.cedula||p?.document_number||'').trim();
const keyOf=p=>{const d=norm(docOf(p));if(d)return'doc:'+d;const id=String(p?.id||'');return id&&!id.startsWith('cloud-')?'legacy:'+id:(p?.cloudPatientId?'cloud:'+p.cloudPatientId:'legacy:'+id)};
function contentOf(p){const x={...p};delete x.id;delete x.legacyId;delete x.cloudPatientId;delete x.updatedAt;delete x.updated_at;delete x.cloudDataPresent;return JSON.stringify(x)}
function payloadOf(p){
 const data={...p};delete data.cloudPatientId;delete data.cloudDataPresent;
 data.legacyId=String(p.legacyId||p.id||'');data.updatedAt=p.updatedAt||new Date().toISOString();
 const state=app(),docKey=norm(docOf(p)),historyMap=new Map();
 (Array.isArray(p.journeyHistory)?p.journeyHistory:[]).forEach(e=>{if(!e)return;const key=String(e.id||String(e.journeyId)+'|'+String(e.patientId||e.participantId||p.id||''));historyMap.set(key,e)});
 (state?.journeyEntries||[]).filter(e=>String(e.patientId||e.participantId||'')===String(p.id||'')||(docKey&&norm(e.document||e.cedula)===docKey)).forEach(e=>{const key=String(e.id||String(e.journeyId)+'|'+String(e.patientId||e.participantId||p.id||''));historyMap.set(key,e)});
 const journeyHistory=Array.from(historyMap.values());if(journeyHistory.length)data.journeyHistory=journeyHistory;else delete data.journeyHistory;
 data.name=p.name||p.fullName||'';data.fullName=p.fullName||p.name||'';data.document=docOf(p);
 return data;
}
function fromRow(r){
 const d=r.app_data&&typeof r.app_data==='object'?r.app_data:{};
 return {...d,cloudDataPresent:Object.keys(d).length>0,id:d.legacyId||r.legacy_id||'cloud-'+r.id,cloudPatientId:r.id,
  name:d.name||[r.first_name,r.last_name].filter(Boolean).join(' '),
  fullName:d.fullName||d.name||[r.first_name,r.last_name].filter(Boolean).join(' '),
  document:r.document_number||d.document||d.cedula||'',cedula:r.document_number||d.cedula||d.document||'',
  birthDate:d.birthDate||r.birth_date||'',sex:d.sex||r.sex||'',phone:d.phone||r.phone||'',
  email:d.email||r.email||'',address:d.address||r.address||'',updatedAt:r.updated_at||d.updatedAt||'',archivedAt:r.archived_at||null};
}
function mergePatientDetails(local,remote){
 const mergeRows=(a,b,keyName)=>{
  const map=new Map();
  [...(Array.isArray(a)?a:[]),...(Array.isArray(b)?b:[])].forEach(row=>{
   if(!row)return;
   const key=row&&typeof row==='object'?(row.id!=null?'id:'+row.id:(keyName==='journeyHistory'&&row.journeyId?'journey:'+row.journeyId:'json:'+JSON.stringify(row))):'value:'+String(row);
   const old=map.get(key);
   if(!old){map.set(key,row);return}
   if(row&&typeof row==='object'&&old&&typeof old==='object'){
    const oldTime=Date.parse(old.updatedAt||old.updated_at||old.createdAt||old.created_at||0)||0,rowTime=Date.parse(row.updatedAt||row.updated_at||row.createdAt||row.created_at||0)||0;
    const newer=rowTime>=oldTime?row:old,older=newer===row?old:row,merged={...older,...newer};
    if(old.removedAt||row.removedAt){merged.testIds=Array.isArray(newer.testIds)?newer.testIds.slice():[];merged.testStatuses={...(newer.testStatuses||{})};}
    else{if(Array.isArray(old.testIds)||Array.isArray(row.testIds))merged.testIds=Array.from(new Set([...(Array.isArray(old.testIds)?old.testIds:[]),...(Array.isArray(row.testIds)?row.testIds:[])]));if(old.testStatuses||row.testStatuses)merged.testStatuses={...(older.testStatuses||{}),...(newer.testStatuses||{})};}
    map.set(key,merged);
   }
  });
  return Array.from(map.values());
 };
 const oldTime=Date.parse(local.updatedAt||local.createdAt||0)||0,newTime=Date.parse(remote.updatedAt||remote.createdAt||0)||0;
 const hasLocalClinicalData=['attentions','generalNotes','emergency','photo','company','companyId','journeyId','testIds','testStatuses','notes','module','journeyHistory'].some(key=>local[key]!=null);
 const winner=!remote.cloudDataPresent&&hasLocalClinicalData?local:(newTime>oldTime?remote:local),other=winner===remote?local:remote,merged={...other,...winner,id:local.id||winner.id,cloudPatientId:remote.cloudPatientId||local.cloudPatientId};
 ['attentions','journeyHistory'].forEach(key=>{merged[key]=mergeRows(local[key],remote[key],key)});
 if(Array.isArray(local.testIds)||Array.isArray(remote.testIds))merged.testIds=Array.from(new Set([...(Array.isArray(local.testIds)?local.testIds:[]),...(Array.isArray(remote.testIds)?remote.testIds:[])]));
 if(local.testStatuses||remote.testStatuses)merged.testStatuses={...(other.testStatuses||{}),...(winner.testStatuses||{})};
 return merged;
}
function merge(local,remote){
 // Tumbas clínicas: no reconstruir expedientes archivados desde caches antiguos.
 const tombstones=new Set((remote||[]).filter(p=>p.archivedAt).map(keyOf));
 const archivedIds=new Set((remote||[]).filter(p=>p.archivedAt).flatMap(p=>[String(p.id||''),String(p.cloudPatientId||'')]).filter(Boolean));
 const blocked=p=>tombstones.has(keyOf(p))||archivedIds.has(String(p.cloudPatientId||''))||archivedIds.has(String(p.id||''));
 const map=new Map();(local||[]).forEach(p=>{if(!blocked(p))map.set(keyOf(p),p)});
 (remote||[]).forEach(r=>{if(r.archivedAt)return;const k=keyOf(r),old=map.get(k);if(!old){map.set(k,r);return}
  const localTime=Date.parse(old.updatedAt||old.createdAt||0)||0,remoteTime=Date.parse(r.updatedAt||0)||0;
  const hasLocalClinicalData=['attentions','generalNotes','emergency','photo','company','companyId','journeyId','testIds','testStatuses','notes','module','journeyHistory'].some(k=>old[k]!=null);
  const winner=!r.cloudDataPresent&&hasLocalClinicalData?old:(remoteTime>localTime?r:old),other=winner===r?old:r;
  map.set(k,mergePatientDetails(old,r));
 });
 return Array.from(map.values());
}
async function fetchAll(){
 const {data,error}=await client.from(TABLE).select('id,legacy_id,document_number,first_name,last_name,birth_date,sex,phone,email,address,app_data,updated_at,archived_at').eq('workspace_id',workspaceId).order('updated_at',{ascending:false}).limit(5000);
 if(error)throw error;return(data||[]).map(fromRow);
}
async function pushOne(p){
 const data=payloadOf(p),result=await client.rpc('sync_workspace_patient',{p_workspace_id:workspaceId,p_legacy_id:String(p.id||''),p_data:data});
 if(result.error)throw result.error;const row=Array.isArray(result.data)?result.data[0]:result.data;
 if(row){p.cloudPatientId=row.patient_id;p.updatedAt=row.updated_at||data.updatedAt}
}
async function archivePatient(patientId){
 const auth=window.FleboAuth,m=auth?.membership;
 if(!auth?.user||m?.role!=='admin'||m?.active!==true||m.workspace_id!==workspaceId)
  throw new Error('Solo el administrador puede eliminar pacientes.');
 if(!ready||!client||!workspaceId||!navigator.onLine)
  throw new Error('Se requiere una conexión activa con la nube.');
 const current=(app()?.patients||[]).find(p=>String(p.id)===String(patientId));
 if(!current)throw new Error('No se encontró el paciente en el sistema.');
 const cloudId=/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(String(current.cloudPatientId||''))
  ?current.cloudPatientId:null;
 const {data,error}=await client.rpc('archive_workspace_patient',{
  p_workspace_id:workspaceId,p_patient_id:cloudId,p_legacy_id:String(current.id)
 });
 if(error)throw error;
 if(data!==true)throw new Error('El servidor no confirmó el archivado.');
 const removedKey=keyOf(current);
 pendingKeys.delete(removedKey);lastContent.delete(removedKey);
 const remaining=(app()?.patients||[]).filter(p=>keyOf(p)!==removedKey&&String(p.id)!==String(current.id));
 saveList(remaining);
 if(typeof window.renderPatients==='function')window.renderPatients();
 if(!busy)syncNow({remote:true});
 else remoteRefreshQueued=true;
 return true;
}
function saveList(list){
 const s=app();if(!s)return false;
 const before=JSON.stringify(s.patients||[]),after=JSON.stringify(list);
 if(before===after)return false;
 window.FleboAppState.replace({...s,patients:list},{silent:true,deferRender:true});return true;
}
function refreshPatientViews(){
 const view=document.querySelector('.view.active');
 if(!view)return;
 const active=document.activeElement,focused=!!(active&&view.contains(active)&&/^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName));
 if(focused){patientRefreshPending=true;return}
 if(view.id==='view-patients'){
  const home=document.getElementById('patientsHome');
  if(!home||home.hidden){patientRefreshPending=false;return}
  if(typeof window.renderPatients==='function'){window.renderPatients();patientRefreshPending=false}
 }else if(view.id==='view-journey'){
  if(typeof window.renderJourneyPatients==='function'){window.renderJourneyPatients();patientRefreshPending=false}
 }else if(view.id==='view-home'){
  if(typeof window.refreshDashboard==='function'){window.refreshDashboard();patientRefreshPending=false}
 }
}
function flushPatientRefresh(){if(patientRefreshPending)refreshPatientViews()}
document.addEventListener('focusout',()=>setTimeout(flushPatientRefresh,0));
window.addEventListener('flebo:local-state-saved',()=>setTimeout(flushPatientRefresh,0));
async function syncNow(options){
 options=options||{};
 if(!ready||!client||!workspaceId)return;
 if(busy){if(options.remote)remoteRefreshQueued=true;return;}
 busy=true;dirty=false;
 try{
  const local=(app()?.patients||[]).slice();
  // En el primer arranque, la nube es la autoridad. Los datos locales antiguos se respaldan,
  // pero nunca se vuelven a subir por el simple hecho de abrir la aplicación.
  if(!initialized){
   const remote=await fetchAll();
   if(local.length&&!remote.length){
    try{const key='fleboreport.patient-local-backup.'+workspaceId;if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({savedAt:new Date().toISOString(),workspaceId,patients:local}))}catch(_){ }
    // Una respuesta vacía inicial nunca debe vaciar la lista visible: se conserva el estado actual.
    lastContent=new Map(local.map(p=>[keyOf(p),contentOf(p)]));
    pendingKeys.clear();initialized=true;
    return;
   }
   const combined=merge(local,remote);
   if(saveList(combined))refreshPatientViews();
   lastContent=new Map(combined.map(p=>[keyOf(p),contentOf(p)]));
   pendingKeys.clear();initialized=true;
   return;
  }
  // Solo se envían expedientes que cambiaron después de cargar la fuente oficial
  // y que por tanto corresponden a una acción reciente del usuario.
  if(options.allowLocalPush||pendingKeys.size){
   const localByKey=new Map(local.map(p=>[keyOf(p),p]));
   for(const key of Array.from(pendingKeys)){
    const patient=localByKey.get(key);
    if(patient){
     const snapshot=contentOf(patient);
     reportSync('syncing','Sincronizando expedientes…');
     await pushOne({...patient});
     const current=(app()?.patients||[]).find(p=>keyOf(p)===key);
     if(current&&contentOf(current)===snapshot)pendingKeys.delete(key);
     else dirty=true;
    }else pendingKeys.delete(key);
   }
  }
  const latest=await fetchAll();
  const currentPatients=(app()?.patients||[]).slice();
  if(currentPatients.length&&!latest.length){
   try{const key='fleboreport.patient-local-backup.'+workspaceId;if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({savedAt:new Date().toISOString(),workspaceId,patients:currentPatients}))}catch(_){ }
   lastContent=new Map(currentPatients.map(p=>[keyOf(p),contentOf(p)]));
   return;
  }
  const combined=merge(currentPatients,latest);
  if(saveList(combined))refreshPatientViews();
  lastContent=new Map(combined.map(p=>[keyOf(p),contentOf(p)]));
  if(!pendingKeys.size&&syncStatus!=='idle')reportSync('synced','Cambios sincronizados con la nube.');
 }catch(e){reportSync('error','Cambios pendientes de sincronizar. Se reintentará al recuperar la conexión.');console.error('[FleboReport Patient Sync]',e);const el=document.getElementById('fleboSyncStatus');if(el){el.textContent='Expedientes pendientes de sincronizar';el.dataset.error='true'}}
 finally{
  busy=false;
  if(dirty)schedule(300);
  else if(remoteRefreshQueued)scheduleRemoteRefresh(200);
 }
}
function scheduleRemoteRefresh(delay=250){
 if(!ready)return;
 remoteRefreshQueued=true;
 if(remoteRefreshTimer)clearTimeout(remoteRefreshTimer);
 remoteRefreshTimer=setTimeout(()=>{
  remoteRefreshTimer=null;
  if(!ready||!navigator.onLine)return;
  if(busy)return; // syncNow's finally will process the queued invalidation.
  remoteRefreshQueued=false;
  syncNow({remote:true});
 },delay);
}
function schedule(delay=900){
 if(!ready)return;dirty=true;
 const list=app()?.patients||[];
 list.forEach(p=>{const k=keyOf(p);if(lastContent.get(k)!==contentOf(p))pendingKeys.add(k)});
 if(pendingKeys.size)reportSync('pending',navigator.onLine?'Cambios pendientes de sincronizar…':'Sin conexión. Cambios pendientes de sincronizar.');
 clearTimeout(timer);timer=setTimeout(()=>syncNow({allowLocalPush:true}),delay);
}
function subscribe(){
 if(channel&&client)client.removeChannel(channel);
 channel=null;
 if(!client||!workspaceId||!userId)return;
 // El evento es únicamente una señal de invalidación: el expediente se
 // vuelve a leer con RLS en syncNow, nunca desde el contenido del evento.
 // La consulta periódica sigue activa si Realtime está desconectado.
 channel=client.channel('flebo-patients-'+workspaceId+'-'+userId)
  .on('postgres_changes',{
   event:'*',schema:'public',table:'patients',filter:'workspace_id=eq.'+workspaceId
  },(event)=>{
   const changedWorkspace=event?.new?.workspace_id||event?.old?.workspace_id;
   if(changedWorkspace&&String(changedWorkspace)!==String(workspaceId))return;
   scheduleRemoteRefresh(250);
  })
  .subscribe();
}
async function connect(){
 const auth=window.FleboAuth;if(!auth)return;
 try{
  client=await auth.init();const user=auth.user,m=auth.membership;
  if(!user||!m?.workspace_id||m.active!==true){ready=false;if(channel)client.removeChannel(channel);channel=null;return}
  if(!['admin','clinician','reception'].includes(m.role)){
   ready=false;remoteRefreshQueued=false;
   if(remoteRefreshTimer)clearTimeout(remoteRefreshTimer);remoteRefreshTimer=null;
   if(channel)client.removeChannel(channel);channel=null;
   return;
  }
  const changed=workspaceId!==m.workspace_id||userId!==user.id;userId=user.id;workspaceId=m.workspace_id;ready=true;
  if(changed){
   initialized=false;pendingKeys.clear();lastContent.clear();
   remoteRefreshQueued=false;
   if(remoteRefreshTimer)clearTimeout(remoteRefreshTimer);remoteRefreshTimer=null;
   subscribe();
  }
  await syncNow();
 }catch(e){ready=false;console.error('[FleboReport Patient Sync] Conexión:',e)}
}
window.addEventListener('flebo:local-state-saved',()=>{if(ready)schedule()});
window.addEventListener('flebo:auth-changed',()=>{if(window.FleboAuth?.user)connect();else{
 ready=false;initialized=false;pendingKeys.clear();lastContent.clear();
 remoteRefreshQueued=false;
 if(remoteRefreshTimer)clearTimeout(remoteRefreshTimer);remoteRefreshTimer=null;
 if(timer)clearTimeout(timer);timer=null;
 if(channel&&client)client.removeChannel(channel);channel=null;
}});
window.addEventListener('online',()=>{if(ready)scheduleRemoteRefresh(100);else connect()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&navigator.onLine){if(ready)scheduleRemoteRefresh(150);else connect()}});
setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine){if(ready)scheduleRemoteRefresh(250);else connect()}},40000);
function boot(){if(window.FleboAuth&&window.FleboAuth.user)connect();else window.addEventListener('flebo:auth-changed',connect,{once:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
window.FleboPatientCloud={syncNow,connect,archivePatient,get ready(){return ready},get workspaceId(){return workspaceId}};
})();