(function(){
'use strict';
const META_KEY='fleboReport.cloudSync.v1';
const ARRAY_KEYS=['catalog','patients','journeyEntries','companies','reportHistory','auditLog','clinicalStudies','clinicalSubjects','clinicalProcessing','clinicalSamples','clinicalSampleHistory','clinicalCryovials','clinicalCryovialHistory','clinicalFreezers','clinicalRacks','clinicalVisits','clinicalSampleTypes','clinicalStatuses','clinicalSponsors','clinicalCros','clinicalStaff','clinicalLocations','individualTestCatalog','individualServices','examPackages'];
let client=null,workspaceId=null,userId=null,role=null,revision=0,lastHash='',channel=null,ready=false,writable=false,busy=false,dirtyAgain=false,timer=null,started=false;
const statusEl=()=>document.getElementById('fleboSyncStatus');
function status(message,error){
 const el=statusEl();if(!el)return;el.textContent=message;el.dataset.error=error?'true':'false';
 el.style.color=error?'#b42318':'#176b45';
 const dot=el.querySelector('.status-dot');if(dot)dot.style.background=error?'#dc5555':'#20a477';
}
function app(){return window.FleboAppState&&window.FleboAppState.get?window.FleboAppState.get():null}
function meta(){try{return JSON.parse(localStorage.getItem(META_KEY)||'{}')}catch(_){return{}}}
function saveMeta(hash,rev){localStorage.setItem(META_KEY,JSON.stringify({workspaceId,revision:rev,hash,syncedAt:new Date().toISOString()}));revision=rev;lastHash=hash}
function meaningful(s){
 if(!s||typeof s!=='object')return false;
 return ARRAY_KEYS.some(k=>Array.isArray(s[k])&&s[k].length>0&&!(k==='clinicalVisits'&&s[k].every(x=>String(x.id||'').startsWith('v-')))&&!(k==='clinicalSampleTypes'&&s[k].every(x=>String(x.id||'').startsWith('s-')))&&!(k==='clinicalStatuses'&&s[k].every(x=>String(x.id||'').startsWith('cs-'))))
 || !!(s.company&&(s.company.name||s.company.contact||s.company.logo))
 || !!(s.journey&&(s.journey.start||s.journey.end||s.journey.responsible||s.journey.companyId))
 || !!(s.individualTestPrices&&Object.keys(s.individualTestPrices).length)
 || !!(s.attentionTemplates&&Object.keys(s.attentionTemplates).length);
}
function itemKey(x){if(x&&typeof x==='object'){if(x.id!=null)return'id:'+x.id;if(x.code!=null)return'code:'+x.code;if(x.document!=null)return'doc:'+x.document+'|'+(x.name||'')}return'json:'+JSON.stringify(x)}
function stamp(x){const v=x&&(x.updatedAt||x.updated_at||x.modifiedAt||x.createdAt||x.created_at);const n=v?Date.parse(v):0;return Number.isFinite(n)?n:0}
function mergeState(remote,local){
 const out=Object.assign({},local||{},remote||{});
 for(const key of ARRAY_KEYS){
  const a=Array.isArray(remote&&remote[key])?remote[key]:[];
  const b=Array.isArray(local&&local[key])?local[key]:[];
  const map=new Map();
  a.forEach(x=>map.set(itemKey(x),x));
  b.forEach(x=>{const k=itemKey(x),old=map.get(k);if(!old||stamp(x)>stamp(old))map.set(k,x)});
  out[key]=Array.from(map.values());
 }
 ['reportHistoryLogos','individualTestPrices','attentionTemplates'].forEach(k=>{
  out[k]=Object.assign({},local&&local[k]||{},remote&&remote[k]||{});
 });
 out.company=Object.assign({},local&&local.company||{},remote&&remote.company||{});
 if(local&&local.company)Object.keys(local.company).forEach(k=>{if((out.company[k]===''||out.company[k]==null)&&local.company[k])out.company[k]=local.company[k]});
 const remoteJourney=remote&&remote.journey||{},localJourney=local&&local.journey||{};
 const remoteJourneyHas=!!(remoteJourney.start||remoteJourney.end||remoteJourney.responsible||remoteJourney.companyId);
 const localJourneyHas=!!(localJourney.start||localJourney.end||localJourney.responsible||localJourney.companyId);
 out.journey=localJourneyHas&&!remoteJourneyHas?Object.assign({},remoteJourney,localJourney):Object.assign({},localJourney,remoteJourney);
 out.selected=Array.isArray(remote&&remote.selected)?remote.selected:(local&&local.selected||[]);
 return out;
}
async function hashState(s){
 const raw=JSON.stringify(s||{});
 if(window.crypto&&crypto.subtle&&window.TextEncoder){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');
 }
 let h=2166136261;for(let i=0;i<raw.length;i++){h^=raw.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(16);
}
async function fetchRemote(){
 const r=await client.from('workspace_app_state').select('state,revision,updated_at').eq('workspace_id',workspaceId).maybeSingle();
 if(r.error)throw r.error;return r.data||null;
}
async function writeRemote(state,expected){
 const raw=JSON.stringify(state);
 if(raw.length>6500000)throw new Error('Los datos superan el tamaño seguro de sincronización. Se debe trasladar primero el contenido multimedia al almacenamiento seguro.');
 const r=await client.rpc('save_workspace_app_state',{p_workspace_id:workspaceId,p_state:state,p_expected_revision:expected});
 if(r.error)throw r.error;
 const row=Array.isArray(r.data)?r.data[0]:r.data;
 return row||{saved:false,revision:expected};
}
function applyCloudState(s){
 if(!window.FleboAppState||!window.FleboAppState.replace)throw new Error('La interfaz principal aún no está preparada para recibir datos.');
 window.FleboAppState.replace(s,{silent:true});
}
async function publishMerged(local,remote,expected){
 let candidate=mergeState(remote&&remote.state||{},local||{});
 for(let attempt=0;attempt<3;attempt++){
  const result=await writeRemote(candidate,expected);
  if(result.saved){
   const h=await hashState(candidate);saveMeta(h,result.revision);
   applyCloudState(candidate);
   return true;
  }
  const latest=await fetchRemote();
  if(!latest) {expected=0;candidate=mergeState({},candidate)}
  else {expected=latest.revision;candidate=mergeState(latest.state,candidate)}
 }
 throw new Error('Hay cambios simultáneos desde otro dispositivo. Se conservaron los datos locales; vuelve a sincronizar en unos segundos.');
}
function runPending(){if(dirtyAgain&&ready){dirtyAgain=false;clearTimeout(timer);timer=setTimeout(syncLocal,450)}}
async function connect(){
 if(busy)return;busy=true;
 try{
  if(!window.FleboAuth||!window.FleboAppState){status('Preparando sincronización…');return}
  client=await window.FleboAuth.init();
  const user=window.FleboAuth.user,membership=window.FleboAuth.membership;
  if(!user||!membership||membership.active!==true){ready=false;workspaceId=null;status('Inicia sesión para sincronizar los datos.');return}
  if(!['admin','clinician','reception','viewer'].includes(membership.role)){ready=false;status('Sincronización de datos generales no habilitada para este rol.');return}
  userId=user.id;workspaceId=membership.workspace_id;role=membership.role;writable=['admin','clinician','reception'].includes(role);
  let local=app()||{},m=meta();
  if(m.workspaceId&&m.workspaceId!==workspaceId&&meaningful(local)){
   try{localStorage.setItem('fleboReport.localBackup.'+m.workspaceId,JSON.stringify({savedAt:new Date().toISOString(),state:local}))}catch(backupError){console.warn('[FleboReport Sync] No se pudo guardar el respaldo local anterior:',backupError)}
   applyCloudState(window.FleboAppState.empty());local=app()||{};
  }
  const localHash=await hashState(local);
  let remote=await fetchRemote();
  if(!remote){
   if(!meaningful(local)||!writable){revision=0;lastHash=localHash;ready=true;status(writable?'Nube conectada · esperando registros para sincronizar':'Cuenta de solo lectura · esperando datos de la nube');subscribe();return}
   const result=await writeRemote(local,0);
   if(!result.saved){remote=await fetchRemote();if(!remote)throw new Error('No se pudo inicializar el espacio de datos en la nube.')}
   else{revision=result.revision;lastHash=localHash;saveMeta(localHash,revision);ready=true;status('Datos locales migrados a la nube');subscribe();return}
  }
  if(remote){
   const sameWorkspace=m.workspaceId===workspaceId;
   if(sameWorkspace&&m.hash===localHash){
    if(remote.revision!==m.revision){applyCloudState(remote.state);const h=await hashState(remote.state);saveMeta(h,remote.revision)}
    else{revision=remote.revision;lastHash=localHash}
   }else if(!sameWorkspace&&m.workspaceId&&meaningful(local)){
    applyCloudState(remote.state);const h=await hashState(remote.state);saveMeta(h,remote.revision);
    status('Datos cargados desde la nube. No se mezclaron datos de otro espacio de trabajo.');
   }else if(!meaningful(local)){
    applyCloudState(remote.state);const h=await hashState(remote.state);saveMeta(h,remote.revision);
   }else if(writable){
    await publishMerged(local,remote,remote.revision);
   }else{
    applyCloudState(remote.state);const h=await hashState(remote.state);saveMeta(h,remote.revision);
   }
  }
  ready=true;status('Sincronizado con la nube · versión '+revision);subscribe();
 }catch(e){ready=false;console.error('[FleboReport Sync]',e);status('Error de sincronización: '+(e.message||'No se pudo conectar'),true)}
 finally{busy=false;runPending()}
}
function subscribe(){
 if(!client||!workspaceId)return;
 if(channel)client.removeChannel(channel);
 channel=client.channel('flebo-app-state-'+workspaceId)
  .on('postgres_changes',{event:'*',schema:'public',table:'workspace_app_state',filter:'workspace_id=eq.'+workspaceId},()=>receiveRemote())
  .subscribe();
}
async function receiveRemote(){
 if(!ready||busy)return;
 busy=true;
 try{
  const remote=await fetchRemote();if(!remote||remote.revision<=revision)return;
  const local=app()||{},localHash=await hashState(local),m=meta();
  if(!writable|| (m.workspaceId===workspaceId&&m.hash===localHash)){
   applyCloudState(remote.state);const h=await hashState(remote.state);saveMeta(h,remote.revision);
   status('Actualizado desde otro dispositivo · versión '+revision);
  }else{
   await publishMerged(local,remote,remote.revision);
   status('Cambios de otros dispositivos integrados · versión '+revision);
  }
 }catch(e){console.error('[FleboReport Sync] Realtime:',e);status('No se pudo actualizar desde la nube: '+(e.message||'error'),true)}
 finally{busy=false;runPending()}
}
async function syncLocal(){
 if(!ready||!writable||!client||!workspaceId)return;
 if(busy){dirtyAgain=true;return}
 busy=true;
 try{
  const local=app()||{},localHash=await hashState(local),m=meta();
  if(m.workspaceId===workspaceId&&m.hash===localHash){status('Sincronizado con la nube · versión '+revision);return}
  let remote=await fetchRemote();
  if(!remote){
   const result=await writeRemote(local,0);
   if(!result.saved)throw new Error('No se pudo crear la copia en la nube.');
   revision=result.revision;saveMeta(localHash,revision);
  }else{
   if(remote.revision!==revision){
    const merged=mergeState(remote.state,local);
    const result=await writeRemote(merged,remote.revision);
    if(!result.saved)throw new Error('El registro cambió durante la sincronización. Reintentaremos automáticamente.');
    const h=await hashState(merged);revision=result.revision;saveMeta(h,revision);applyCloudState(merged);
   }else{
    const result=await writeRemote(local,revision);
    if(!result.saved)throw new Error('Se detectó una edición simultánea. Se reintentará al recibir la actualización.');
    revision=result.revision;saveMeta(localHash,revision);
   }
  }
  status('Sincronizado con la nube · versión '+revision);
 }catch(e){console.error('[FleboReport Sync] Guardado:',e);status('Pendiente de sincronizar: '+(e.message||'error'),true)}
 finally{busy=false;runPending()}
}
function schedule(){if(!ready||!writable)return;status('Guardando cambios en la nube…');clearTimeout(timer);timer=setTimeout(syncLocal,1000)}
window.addEventListener('flebo:local-state-saved',schedule);
window.addEventListener('flebo:auth-changed',()=>{const user=window.FleboAuth&&window.FleboAuth.user;if(!user){ready=false;if(channel&&client)client.removeChannel(channel);channel=null;status('Inicia sesión para sincronizar los datos.');return}connect()});
window.addEventListener('online',()=>{if(ready)syncLocal()});
window.FleboCloudSync={connect,syncNow:syncLocal,get status(){return{ready,workspaceId,revision,role}}};
function boot(){if(started)return;started=true;status('Conectando con la nube…');if(window.FleboAuth&&window.FleboAuth.user)connect()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
})();