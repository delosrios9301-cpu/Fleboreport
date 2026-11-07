(function(){
'use strict';
const TABLE='patients';
let client=null,userId=null,workspaceId=null,channel=null,ready=false,busy=false,dirty=false,timer=null,lastContent=new Map(),pendingKeys=new Set(),initialized=false,patientRefreshPending=false,remoteVersionFingerprint=null;
const app=()=>window.FleboAppState?.get?.();
const norm=v=>String(v||'').trim().toLocaleLowerCase('es').replace(/[^a-z0-9]/g,'');
const docOf=p=>String(p?.document||p?.cedula||p?.document_number||'').trim();
const keyOf=p=>{const d=norm(docOf(p));if(d)return'doc:'+d;const id=String(p?.id||'');return id&&!id.startsWith('cloud-')?'legacy:'+id:(p?.cloudPatientId?'cloud:'+p.cloudPatientId:'legacy:'+id)};
function contentOf(p){const x={...p};delete x.id;delete x.legacyId;delete x.cloudPatientId;delete x.updatedAt;delete x.updated_at;delete x.cloudDataPresent;return JSON.stringify(x)}
function payloadOf(p){
 const data={...p};delete data.cloudPatientId;delete data.cloudDataPresent;
 data.legacyId=String(p.legacyId||p.id||'');data.updatedAt=p.updatedAt||new Date().toISOString();
 const state=app(),docKey=norm(docOf(p));const journeyHistory=(state?.journeyEntries||[]).filter(e=>String(e.patientId||e.participantId||'')===String(p.id||'')||(docKey&&norm(e.document||e.cedula)===docKey));if(journeyHistory.length)data.journeyHistory=journeyHistory;else delete data.journeyHistory;
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
  email:d.email||r.email||'',address:d.address||r.address||'',updatedAt:r.updated_at||d.updatedAt||''};
}
function merge(local,remote){
 const map=new Map();(local||[]).forEach(p=>map.set(keyOf(p),p));
 (remote||[]).forEach(r=>{const k=keyOf(r),old=map.get(k);if(!old){map.set(k,r);return}
  const localTime=Date.parse(old.updatedAt||old.createdAt||0)||0,remoteTime=Date.parse(r.updatedAt||0)||0;
  const hasLocalClinicalData=['attentions','generalNotes','emergency','photo','company','companyId','journeyId','testIds','testStatuses','notes','module','journeyHistory'].some(k=>old[k]!=null);
  const winner=!r.cloudDataPresent&&hasLocalClinicalData?old:(remoteTime>localTime?r:old),other=winner===r?old:r;
  map.set(k,{...other,...winner,id:old.id||winner.id,cloudPatientId:r.cloudPatientId||old.cloudPatientId});
 });
 return Array.from(map.values());
}
async function fetchAll(){
 const {data,error}=await client.from(TABLE).select('id,legacy_id,document_number,first_name,last_name,birth_date,sex,phone,email,address,app_data,updated_at').eq('workspace_id',workspaceId).order('updated_at',{ascending:false}).limit(5000);
 if(error)throw error;return(data||[]).map(fromRow);
}
async function fetchRemoteVersion(){
 const [latest,countResult]=await Promise.all([
  client.from(TABLE).select('id,updated_at').eq('workspace_id',workspaceId)
   .order('updated_at',{ascending:false}).order('id',{ascending:false}).limit(1).maybeSingle(),
  client.from(TABLE).select('id',{count:'exact',head:true}).eq('workspace_id',workspaceId)
 ]);
 if(latest.error)throw latest.error;
 if(countResult.error)throw countResult.error;
 const row=latest.data||null;
 return String(countResult.count||0)+'|'+String(row?.id||'')+'|'+String(row?.updated_at||'');
}
async function pushOne(p){
 const data=payloadOf(p),result=await client.rpc('sync_workspace_patient',{p_workspace_id:workspaceId,p_legacy_id:String(p.id||''),p_data:data});
 if(result.error)throw result.error;const row=Array.isArray(result.data)?result.data[0]:result.data;
 if(row){p.cloudPatientId=row.patient_id;p.updatedAt=row.updated_at||data.updatedAt}
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
 if(!ready||busy||!client||!workspaceId)return;
 busy=true;dirty=false;
 try{
  const local=(app()?.patients||[]).slice();
  // En el primer arranque, la nube es la autoridad. Los datos locales antiguos se respaldan,
  // pero nunca se vuelven a subir por el simple hecho de abrir la aplicación.
  if(!initialized){
   const version=await fetchRemoteVersion();
   const remote=await fetchAll();
   if(local.length&&!remote.length){
    try{const key='fleboreport.patient-local-backup.'+workspaceId;if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({savedAt:new Date().toISOString(),workspaceId,patients:local}))}catch(_){ }
    // Una respuesta vacía inicial nunca debe vaciar la lista visible: se conserva el estado actual.
    lastContent=new Map(local.map(p=>[keyOf(p),contentOf(p)]));
    pendingKeys.clear();initialized=true;remoteVersionFingerprint=version;
    return;
   }
   if(saveList(remote))refreshPatientViews();
   lastContent=new Map(remote.map(p=>[keyOf(p),contentOf(p)]));
   pendingKeys.clear();initialized=true;remoteVersionFingerprint=version;
   return;
  }
  // Solo se envían expedientes que cambiaron después de cargar la fuente oficial
  // y que por tanto corresponden a una acción reciente del usuario.
  if(pendingKeys.size){
   const localByKey=new Map(local.map(p=>[keyOf(p),p]));
   for(const key of Array.from(pendingKeys)){
    const patient=localByKey.get(key);
    if(patient)await pushOne(patient);
   }
   pendingKeys.clear();
   // Una escritura local sí requiere reconciliar el listado compartido.
   const version=await fetchRemoteVersion();
   const latest=await fetchAll();
   const currentPatients=(app()?.patients||[]).slice();
   if(currentPatients.length&&!latest.length){
    try{const key='fleboreport.patient-local-backup.'+workspaceId;if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({savedAt:new Date().toISOString(),workspaceId,patients:currentPatients}))}catch(_){ }
    lastContent=new Map(currentPatients.map(p=>[keyOf(p),contentOf(p)]));
    remoteVersionFingerprint=version;
    return;
   }
   if(saveList(latest))refreshPatientViews();
   lastContent=new Map(latest.map(p=>[keyOf(p),contentOf(p)]));
   remoteVersionFingerprint=version;
   return;
  }
  // La consulta periódica compara solo una huella ligera (cantidad + último registro actualizado).
  // No descarga app_data ni expedientes completos si la nube no cambió.
  const version=await fetchRemoteVersion();
  if(version===remoteVersionFingerprint)return;
  const latest=await fetchAll();
  const currentPatients=(app()?.patients||[]).slice();
  if(currentPatients.length&&!latest.length){
   try{const key='fleboreport.patient-local-backup.'+workspaceId;if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({savedAt:new Date().toISOString(),workspaceId,patients:currentPatients}))}catch(_){ }
   lastContent=new Map(currentPatients.map(p=>[keyOf(p),contentOf(p)]));
   remoteVersionFingerprint=version;
   return;
  }
  if(saveList(latest))refreshPatientViews();
  lastContent=new Map(latest.map(p=>[keyOf(p),contentOf(p)]));
  remoteVersionFingerprint=version;
 }catch(e){console.error('[FleboReport Patient Sync]',e);const el=document.getElementById('fleboSyncStatus');if(el){el.textContent='Expedientes pendientes de sincronizar';el.dataset.error='true'}}
 finally{busy=false;if(dirty)schedule(300)}
}
function schedule(delay=900){
 if(!ready)return;dirty=true;
 const list=app()?.patients||[];
 list.forEach(p=>{const k=keyOf(p);if(lastContent.get(k)!==contentOf(p))pendingKeys.add(k)});
 clearTimeout(timer);timer=setTimeout(()=>syncNow({allowLocalPush:true}),delay);
}
function subscribe(){
 // Los expedientes se actualizan mediante syncNow al abrir la app,
 // al recuperar conexión y por consulta periódica; evitamos otro canal Realtime.
 if(channel&&client)client.removeChannel(channel);
 channel=null;
}
async function connect(){
 const auth=window.FleboAuth;if(!auth)return;
 try{
  client=await auth.init();const user=auth.user,m=auth.membership;
  if(!user||!m?.workspace_id||m.active!==true){ready=false;if(channel)client.removeChannel(channel);channel=null;return}
  if(!['admin','clinician','reception'].includes(m.role)){ready=false;return}
  const changed=workspaceId!==m.workspace_id||userId!==user.id;userId=user.id;workspaceId=m.workspace_id;ready=true;
  if(changed){initialized=false;pendingKeys.clear();lastContent.clear();subscribe()}await syncNow();
 }catch(e){ready=false;console.error('[FleboReport Patient Sync] Conexión:',e)}
}
window.addEventListener('flebo:local-state-saved',()=>{if(ready)schedule()});
window.addEventListener('flebo:auth-changed',()=>{if(window.FleboAuth?.user)connect();else{ready=false;if(channel&&client)client.removeChannel(channel);channel=null}});
window.addEventListener('online',()=>{if(ready)syncNow();else connect()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&navigator.onLine){if(ready)syncNow();else connect()}});
setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine){if(ready)syncNow();else connect()}},40000);
function boot(){if(window.FleboAuth&&window.FleboAuth.user)connect();else window.addEventListener('flebo:auth-changed',connect,{once:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
window.FleboPatientCloud={syncNow,connect,get ready(){return ready},get workspaceId(){return workspaceId}};
})();