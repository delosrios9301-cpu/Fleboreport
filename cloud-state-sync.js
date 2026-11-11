(function(){
'use strict';
const META_KEY='fleboReport.cloudSync.v1';
const ARRAY_KEYS=['catalog','patients','journeyEntries','companies','reportHistory','clinicalStudies','clinicalSubjects','clinicalProcessing','clinicalSamples','clinicalLocalDeletedSampleIds','clinicalSampleHistory','clinicalCryovials','clinicalCryovialHistory','clinicalFreezers','clinicalRacks','clinicalVisits','clinicalSampleTypes','clinicalStatuses','clinicalSponsors','clinicalCros','clinicalStaff','clinicalLocations','individualTestCatalog','individualServices','examPackages'];
// Estos catálogos se administran en clinical_* de Supabase, no en el estado JSON legado.
const CLINICAL_DB_CONFIG_KEYS=['clinicalStudies','clinicalVisits','clinicalSampleTypes'];
// Las muestras y su historial viven exclusivamente en clinical_samples/clinical_sample_events.
const CLINICAL_DB_RECORD_KEYS=['clinicalSamples','clinicalSampleHistory','clinicalLocalDeletedSampleIds'];
// El cursor clínico pertenece a la caché local de cada dispositivo y nunca se comparte entre sesiones.
const CLINICAL_DB_SYNC_KEYS=['_clinicalCloudSyncCursor','_clinicalCloudSyncWorkspace','_clinicalCloudSyncUser','_clinicalCloudSyncRole'];
let client=null,workspaceId=null,userId=null,role=null,revision=0,lastHash='',channel=null,ready=false,writable=false,stateSyncAllowed=false,busy=false,dirtyAgain=false,pendingLocalChanges=false,saveRetryCount=0,timer=null,pollTimer=null,started=false;
const engine=window.FleboEngine;
const statusEl=()=>document.getElementById('fleboSyncStatus');
function status(message,error){
 const el=statusEl();if(!el)return;el.textContent=message;el.dataset.error=error?'true':'false';
 el.style.color=error?'#b42318':'#176b45';
 const dot=el.querySelector('.status-dot');if(dot)dot.style.background=error?'#dc5555':'#20a477';
}
function announceReady(){if(document.body)document.body.classList.add('flebo-cloud-ready');window.dispatchEvent(new Event('flebo:cloud-sync-ready'))}
function app(){return window.FleboAppState&&window.FleboAppState.get?window.FleboAppState.get():null}
function stripLegacyAudit(s){const out=Object.assign({},s||{});delete out.auditLog;return out}
function meta(){try{return JSON.parse(localStorage.getItem(META_KEY)||'{}')}catch(_){return{}}}
function saveMeta(hash,rev,resetEpoch){const old=meta();localStorage.setItem(META_KEY,JSON.stringify({workspaceId,userId,revision:rev,hash,syncedAt:new Date().toISOString(),resetEpoch:resetEpoch===undefined?(old.resetEpoch||null):resetEpoch}));revision=rev;lastHash=hash}
function backupResetLocalState(state,epoch){if(!meaningful(state))return false;const key='fleboReport.resetBackup.'+workspaceId+'.'+epoch;try{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({savedAt:new Date().toISOString(),workspaceId,resetEpoch:epoch,state}));return true}catch(e){throw new Error('No se pudo respaldar el estado local anterior al restablecimiento. Libera espacio del navegador e inténtalo de nuevo.')}}
function backupUnlinkedLocalState(state,workspace){if(!meaningful(state))return false;const key='fleboReport.unlinkedLocalBackup.'+workspace;try{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({savedAt:new Date().toISOString(),workspaceId:workspace,state:state}));return true}catch(e){throw new Error('No se pudo respaldar el estado local previo. No se modificaron los datos; libera espacio del navegador e inténtalo de nuevo.')}}
function meaningful(s){
 if(!s||typeof s!=='object')return false;
 return ARRAY_KEYS.some(k=>Array.isArray(s[k])&&s[k].length>0&&!(k==='clinicalVisits'&&s[k].every(x=>String(x.id||'').startsWith('v-')))&&!(k==='clinicalSampleTypes'&&s[k].every(x=>String(x.id||'').startsWith('s-')))&&!(k==='clinicalStatuses'&&s[k].every(x=>String(x.id||'').startsWith('cs-'))))
 || !!(s.company&&(s.company.name||s.company.contact||s.company.logo))
 || !!(s.journey&&(s.journey.start||s.journey.end||s.journey.responsible||s.journey.companyId))
 || !!(s.individualTestPrices&&Object.keys(s.individualTestPrices).length)
 || !!(s.attentionTemplates&&Object.keys(s.attentionTemplates).length);
}
function catalogIdentity(x){
 const norm=v=>String(v||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const code=norm(x&&x.code);if(code)return'code:'+code;
 return'name:'+norm(x&&x.name);
}
function catalogRichness(x){
 return Object.entries(x||{}).reduce((n,[k,v])=>n+(v!=null&&String(v).trim()!==''?1:0),0);
}
function dedupeCatalog(items){
 const map=new Map();
 (Array.isArray(items)?items:[]).forEach(item=>{
  if(!item||typeof item!=='object')return;
  const key=catalogIdentity(item),old=map.get(key);
  if(!old){map.set(key,Object.assign({},item));return}
  const preferred=catalogRichness(item)>catalogRichness(old)?item:old;
  const secondary=preferred===item?old:item;
  const merged=Object.assign({},secondary);
  Object.entries(preferred).forEach(([k,v])=>{if(v!=null&&String(v).trim()!=='')merged[k]=v});
  merged.id=old.id||item.id;merged.name=old.name||item.name;
  map.set(key,merged);
 });
 return Array.from(map.values());
}
function itemKey(x,collection){
 if(collection==='catalog')return'catalog:'+catalogIdentity(x);
 if(!x||typeof x!=='object')return'json:'+JSON.stringify(x);
 const norm=v=>String(v||'').trim().toLocaleLowerCase('es').replace(/\s+/g,' ');
 const scope=[x.studyId||x.study_id,x.companyId||x.company_id,x.siteId||x.site_id].filter(Boolean).map(norm).join('|');
 const code=norm(x.code||x.protocol||x.protocolCode||x.protocol_code||x.document||x.document_number||x.barcode||x.box_code||x.legacyId||x.legacy_id);
 if(code)return'code:'+collection+':'+scope+':'+code;
 const name=norm(x.name||x.fullName||x.full_name);
 if(name)return'name:'+collection+':'+scope+':'+name;
 if(x.id!=null)return'id:'+x.id;
 return'json:'+JSON.stringify(x);
}
function stamp(x){const v=x&&(x.updatedAt||x.updated_at||x.modifiedAt||x.createdAt||x.created_at);const n=v?Date.parse(v):0;return Number.isFinite(n)?n:0}
function mergeState(remote,local){
 const out=Object.assign({},local||{},remote||{});
 delete out.auditLog;
 for(const key of ARRAY_KEYS){
  const a=Array.isArray(remote&&remote[key])?remote[key]:[];
  const b=Array.isArray(local&&local[key])?local[key]:[];
  const map=new Map();
  a.forEach(x=>map.set(itemKey(x,key),x));
  b.forEach(x=>{const k=itemKey(x,key),old=map.get(k);if(!old||stamp(x)>stamp(old))map.set(k,x)});
  out[key]=key==='catalog'?dedupeCatalog(Array.from(map.values())):Array.from(map.values());
 }
 const deletedClinicalSampleIds=new Set((out.clinicalLocalDeletedSampleIds||[]).map(String));
 out.clinicalSamples=(out.clinicalSamples||[]).filter(x=>!deletedClinicalSampleIds.has(String(x.id)));
 // Evitar que snapshots locales o antiguos repueblen la bandeja clínica.
 CLINICAL_DB_RECORD_KEYS.forEach(k=>{out[k]=[]});
 // La configuración clínica relacional es la fuente oficial. Nunca fusionar copias antiguas del estado general.
 CLINICAL_DB_CONFIG_KEYS.forEach(k=>{out[k]=Array.isArray(local&&local[k])?local[k]:[]});
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
 const raw=JSON.stringify(stripLegacyAudit(s));
 if(window.crypto&&crypto.subtle&&window.TextEncoder){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');
 }
 let h=2166136261;for(let i=0;i<raw.length;i++){h^=raw.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(16);
}
async function persistLegacyAuditEvents(events){
 if(!Array.isArray(events)||!events.length||!client||!workspaceId||!userId)return 0;
 const rows=events.filter(x=>x&&x.id).map(x=>({
  workspace_id:workspaceId,actor_id:userId,
  actor_name:String(x.operator||'Operador local').slice(0,180),
  entity_table:'app_activity',entity_id:null,
  action:String(x.action||'Actividad').slice(0,500),
  changed_fields:[],occurred_at:x.timestamp||new Date().toISOString(),site_id:null,
  details:{source:'legacy_client_audit_log',module_key:'application',section:String(x.section||'Aplicación').slice(0,180),legacy_event_id:String(x.id)},
  source_event_key:'legacy:'+userId+':'+String(x.id).slice(0,180)
 }));
 let inserted=0;
 for(let i=0;i<rows.length;i+=100){
  const batch=rows.slice(i,i+100);
  const r=await client.from('audit_logs').upsert(batch,{onConflict:'source_event_key',ignoreDuplicates:true});
  if(r.error)throw r.error;
  inserted+=batch.length;
 }
 return inserted;
}
async function recordAppActivity(event){
 if(!ready||!client||!workspaceId||!userId)throw new Error('La bitácora en la nube aún no está lista.');
 const row={
  workspace_id:workspaceId,actor_id:userId,
  actor_name:String(event.operator||'Operador local').slice(0,180),
  entity_table:'app_activity',entity_id:null,
  action:String(event.action||'Actividad').slice(0,500),
  changed_fields:[],occurred_at:event.timestamp||new Date().toISOString(),site_id:null,
  details:{source:'client_app_activity',module_key:'application',section:String(event.section||'Aplicación').slice(0,180)},
  source_event_key:'client:'+userId+':'+String(event.id||'').slice(0,180)
 };
 const r=await client.from('audit_logs').upsert(row,{onConflict:'source_event_key',ignoreDuplicates:true});
 if(r.error)throw r.error;
 return true;
}
async function rpcRow(name,args){
 const r=await client.rpc(name,args);
 if(r.error)throw r.error;
 return Array.isArray(r.data)?(r.data[0]||null):(r.data||null);
}
async function fetchRemoteMeta(){
 return await engine.measure('cloud.meta',()=>rpcRow('get_workspace_shared_app_state_meta',{p_workspace_id:workspaceId}));
}
async function fetchRemote(){
 return await engine.measure('cloud.download',()=>rpcRow('get_workspace_shared_app_state',{p_workspace_id:workspaceId}));
}
async function writeRemote(state,expected){
 const payload=stripLegacyAudit(state);
 if(Array.isArray(payload.catalog))payload.catalog=dedupeCatalog(payload.catalog);
 // No guardar catálogos clínicos duplicados en workspace_app_state: clinical_* es la fuente oficial.
 CLINICAL_DB_CONFIG_KEYS.forEach(k=>{payload[k]=[]});
 CLINICAL_DB_RECORD_KEYS.forEach(k=>{payload[k]=[]});
 CLINICAL_DB_SYNC_KEYS.forEach(k=>{delete payload[k]});
 const raw=JSON.stringify(payload);
 if(raw.length>6500000)throw new Error('Los datos superan el tamaño seguro de sincronización. Se debe trasladar primero el contenido multimedia al almacenamiento seguro.');
 const r=await engine.measure('cloud.upload',()=>client.rpc('save_workspace_shared_app_state',{p_workspace_id:workspaceId,p_state:payload,p_expected_revision:expected}));
 if(r.error)throw r.error;
 const row=Array.isArray(r.data)?r.data[0]:r.data;
 return row||{saved:false,revision:expected};
}
function applyCloudState(s,clearClinical){
 if(!window.FleboAppState||!window.FleboAppState.replace)throw new Error('La interfaz principal aún no está preparada para recibir datos.');
 const current=app()||{},safe=stripLegacyAudit(s);safe.auditLog=[];
 if(Array.isArray(safe.catalog))safe.catalog=dedupeCatalog(safe.catalog);
 // En una restauración administrativa se vacían también los catálogos clínicos locales para impedir que resurjan.
 if(clearClinical){CLINICAL_DB_CONFIG_KEYS.forEach(k=>{safe[k]=[]})}else{CLINICAL_DB_CONFIG_KEYS.forEach(k=>{safe[k]=Array.isArray(current[k])?current[k]:[]})}
 CLINICAL_DB_SYNC_KEYS.forEach(k=>{if(!clearClinical&&Object.prototype.hasOwnProperty.call(current,k))safe[k]=current[k];else delete safe[k]});
 window.FleboAppState.replace(safe,{silent:true,deferRender:true});
 if(clearClinical)window.dispatchEvent(new Event('flebo:clinical-cache-reset'));
}
async function publishMerged(local,remote,expected){
 let candidate=mergeState(remote&&remote.state||{},local||{});
 for(let attempt=0;attempt<3;attempt++){
  const result=await writeRemote(candidate,expected);
  if(result.saved){
   const h=await hashState(candidate);saveMeta(h,result.revision,meta().resetEpoch||null);
   applyCloudState(candidate);
   return true;
  }
  const latest=await fetchRemote();
  if(!latest) {expected=0;candidate=mergeState({},candidate)}
  else {expected=latest.revision;candidate=mergeState(latest.state,candidate)}
 }
 throw new Error('Hay cambios simultáneos desde otro dispositivo. Se conservaron los datos locales; vuelve a sincronizar en unos segundos.');
}
function runPending(){if(!ready)return;if(!writable){dirtyAgain=false;pendingLocalChanges=false;return}if(dirtyAgain||pendingLocalChanges){dirtyAgain=false;pendingLocalChanges=false;engine.schedule('cloud-save',syncLocal,450)}}
async function connect(){
 if(busy)return;busy=true;
 try{
  if(!window.FleboAuth||!window.FleboAppState){status('Preparando sincronización…');return}
  client=await window.FleboAuth.init();
  const user=window.FleboAuth.user,membership=window.FleboAuth.membership;
  if(!user||!membership||membership.active!==true){ready=false;stateSyncAllowed=false;workspaceId=null;status('Inicia sesión para sincronizar los datos.');return}
  userId=user.id;workspaceId=membership.workspace_id;role=membership.role;writable=['admin','clinician','reception'].includes(role);stateSyncAllowed=['admin','clinician','reception','viewer'].includes(role);
  // Los flebotomistas trabajan con módulos y tablas relacionales asignadas; no usan el estado JSON legado por usuario.
  // La interfaz debe quedar lista aunque no exista una fila workspace_app_state para esta cuenta.
  if(role==='technician'){
   ready=true;pendingLocalChanges=false;dirtyAgain=false;announceReady();status('Sesión activa · módulos habilitados por permisos');subscribe();return;
  }
  if(!stateSyncAllowed){ready=false;status('Sincronización de datos generales no habilitada para este rol.');return}
  let local=app()||{},m=meta();
  if(Array.isArray(local.catalog)){const cleaned=dedupeCatalog(local.catalog);if(cleaned.length!==local.catalog.length){local=Object.assign({},local,{catalog:cleaned});applyCloudState(local)}}
  if(m.workspaceId&&(m.workspaceId!==workspaceId||m.userId!==userId)&&meaningful(local)){
   try{localStorage.setItem('fleboReport.localBackup.'+m.workspaceId,JSON.stringify({savedAt:new Date().toISOString(),state:local}))}catch(backupError){throw new Error('No se pudo respaldar el estado local del espacio anterior. No se modificaron tus datos; libera espacio del navegador e inténtalo de nuevo.')}
   applyCloudState(window.FleboAppState.empty());local=app()||{};
  }
  let remote=await fetchRemote();
  await persistLegacyAuditEvents([...(Array.isArray(local.auditLog)?local.auditLog:[]),...((remote&&remote.state&&Array.isArray(remote.state.auditLog))?remote.state.auditLog:[])]);
  if(Array.isArray(local.auditLog)&&local.auditLog.length){local=stripLegacyAudit(local);applyCloudState(local)}
  if(remote&&remote.state&&Array.isArray(remote.state.auditLog)&&remote.state.auditLog.length){const cleaned=stripLegacyAudit(remote.state);if(writable){const cleanResult=await writeRemote(cleaned,remote.revision);if(cleanResult.saved)remote=Object.assign({},remote,{state:cleaned,revision:cleanResult.revision});else remote=await fetchRemote()}else remote=Object.assign({},remote,{state:cleaned})}
  const localHash=await hashState(local);
  if(remote&&remote.reset_epoch&&(remote.reset_epoch!==(m.resetEpoch||null))){backupResetLocalState(local,remote.reset_epoch);applyCloudState(remote.state,true);const resetHash=await hashState(app()||{});saveMeta(resetHash,remote.revision,remote.reset_epoch);ready=true;announceReady();status('Restablecimiento recibido desde la nube · versión '+remote.revision);subscribe();return}
  if(!remote){
   if(!meaningful(local)||!writable){revision=0;lastHash=localHash;ready=true;announceReady();status(writable?'Nube conectada · esperando registros para sincronizar':'Cuenta de solo lectura · esperando datos de la nube');subscribe();return}
   const result=await writeRemote(local,0);
   if(!result.saved){remote=await fetchRemote();if(!remote)throw new Error('No se pudo inicializar el espacio de datos en la nube.')}
   else{revision=result.revision;lastHash=localHash;saveMeta(localHash,revision,remote&&remote.reset_epoch||null);ready=true;announceReady();status('Datos locales migrados a la nube');subscribe();return}
  }
  if(remote){
   const sameSession=m.workspaceId===workspaceId&&m.userId===userId;
   if(sameSession&&m.hash===localHash){
    if(remote.revision!==m.revision){applyCloudState(remote.state);const h=await hashState(remote.state);saveMeta(h,remote.revision,remote.reset_epoch||null)}
    else{revision=remote.revision;lastHash=localHash}
   }else if(!sameSession){
    const backedUp=backupUnlinkedLocalState(local,workspaceId);
    applyCloudState(remote.state);const h=await hashState(remote.state);saveMeta(h,remote.revision);
    status(backedUp?'Datos oficiales cargados desde la nube. El estado local previo quedó respaldado en este dispositivo.':'Datos oficiales cargados desde la nube.');
   }else if(!meaningful(local)){
    applyCloudState(remote.state);const h=await hashState(remote.state);saveMeta(h,remote.revision);
   }else if(writable){
    await publishMerged(local,remote,remote.revision);
   }else{
    applyCloudState(remote.state);const h=await hashState(remote.state);saveMeta(h,remote.revision);
   }
  }
  ready=true;announceReady();status('Sincronizado con la nube · versión '+revision);subscribe();
 }catch(e){ready=false;if(document.body)document.body.classList.add('flebo-cloud-ready');console.error('[FleboReport Sync]',e);status('Error de sincronización: '+(e.message||'No se pudo conectar'),true)}
 finally{busy=false;runPending()}
}
function subscribe(){
 // La sincronización de estado usa consulta periódica y eventos de visibilidad.
 // Se evita una suscripción Realtime adicional que estaba contribuyendo a los
 // timeouts de apply_rls en proyectos con varias sesiones/dispositivos.
 if(channel&&client)client.removeChannel(channel);
 channel=null;
}
async function receiveRemote(){
 if(!ready||!stateSyncAllowed)return;
 let pollFailed=false;
 if(busy){dirtyAgain=true;return}
 busy=true;
 try{
  // Primero consultar solo la revisión. No descargar el JSON completo (puede superar 1 MB)
  // cada 30 segundos si ningún otro dispositivo ha guardado cambios.
  const remoteMeta=await fetchRemoteMeta();if(!remoteMeta)return;
  const m=meta();
  if(remoteMeta.reset_epoch&&(remoteMeta.reset_epoch!==(m.resetEpoch||null))){
   const resetRemote=await fetchRemote();if(!resetRemote)return;
   const local=app()||{};await persistLegacyAuditEvents([...(Array.isArray(local.auditLog)?local.auditLog:[]),...((resetRemote.state&&Array.isArray(resetRemote.state.auditLog))?resetRemote.state.auditLog:[])]);backupResetLocalState(local,resetRemote.reset_epoch);
   applyCloudState(resetRemote.state);const h=await hashState(app()||{});
   saveMeta(h,resetRemote.revision,resetRemote.reset_epoch);
   status('Restablecimiento recibido desde la nube · versión '+revision);return;
  }
  if(remoteMeta.revision<=revision)return;
  let remote=await fetchRemote();if(!remote)return;
  let local=app()||{};
  await persistLegacyAuditEvents([...(Array.isArray(local.auditLog)?local.auditLog:[]),...((remote.state&&Array.isArray(remote.state.auditLog))?remote.state.auditLog:[])]);
  if(Array.isArray(local.auditLog)&&local.auditLog.length){local=stripLegacyAudit(local);applyCloudState(local)}
  if(remote.state&&Array.isArray(remote.state.auditLog)&&remote.state.auditLog.length){const cleaned=stripLegacyAudit(remote.state);if(writable){const cleanResult=await writeRemote(cleaned,remote.revision);if(cleanResult.saved)remote=Object.assign({},remote,{state:cleaned,revision:cleanResult.revision});else remote=await fetchRemote();if(!remote)return}else remote=Object.assign({},remote,{state:cleaned})}
  if(Array.isArray(local.catalog)){const cleaned=dedupeCatalog(local.catalog);if(cleaned.length!==local.catalog.length){local=Object.assign({},local,{catalog:cleaned});applyCloudState(local)}}
  const localHash=await hashState(local);
  if(remote.reset_epoch&&(remote.reset_epoch!==(m.resetEpoch||null))){backupResetLocalState(local,remote.reset_epoch);applyCloudState(remote.state);const resetHash=await hashState(app()||{});saveMeta(resetHash,remote.revision,remote.reset_epoch);status('Restablecimiento recibido desde la nube · versión '+revision);return}
  if(remote.revision<=revision)return;
  if(m.workspaceId!==workspaceId||m.userId!==userId){
   const backedUp=backupUnlinkedLocalState(local,workspaceId);
   applyCloudState(remote.state);const h=await hashState(remote.state);saveMeta(h,remote.revision);
   status(backedUp?'Datos de la nube actualizados; el estado local anterior quedó respaldado.':'Datos de la nube actualizados.');
  }else if(!writable||m.hash===localHash){
   applyCloudState(remote.state);const h=await hashState(remote.state);saveMeta(h,remote.revision);
   status('Actualizado desde otro dispositivo · versión '+revision);
  }else{
   await publishMerged(local,remote,remote.revision);
   status('Cambios de otros dispositivos integrados · versión '+revision);
  }
 }catch(e){pollFailed=true;engine.pollFailure();console.error('[FleboReport Sync] Realtime:',e);status('No se pudo actualizar desde la nube: '+(e.message||'error'),true)}
 finally{if(!pollFailed)engine.pollSuccess();busy=false;runPending()}
}
async function syncLocal(options){
 const forceVerify=!!(options&&options.verify);
 if(!ready){
  pendingLocalChanges=true;
  if(window.FleboAuth&&window.FleboAuth.user)await connect();
  if(!ready)return false;
 }
 if(!writable||!client||!workspaceId)return false;
 // No descartar una verificación explícita si coincide con un guardado automático en curso.
 // Esperar a que termine la operación activa y ejecutar después la verificación solicitada.
 if(busy){
  dirtyAgain=true;pendingLocalChanges=true;
  for(let attempt=0;attempt<60&&busy;attempt++)await new Promise(resolve=>setTimeout(resolve,100));
  if(busy)return false;
  return syncLocal(options);
 }
 pendingLocalChanges=false;
 busy=true;
 try{
  let local=app()||{};
  if(Array.isArray(local.auditLog)&&local.auditLog.length){await persistLegacyAuditEvents(local.auditLog);local=stripLegacyAudit(local);applyCloudState(local)}
  if(Array.isArray(local.catalog)){const cleaned=dedupeCatalog(local.catalog);if(cleaned.length!==local.catalog.length){local=Object.assign({},local,{catalog:cleaned});applyCloudState(local)}}
  const localHash=await hashState(local),m=meta();
  if(!forceVerify&&m.workspaceId===workspaceId&&m.userId===userId&&m.hash===localHash){status('Sincronizado con la nube · versión '+revision);return true}
  // La consulta ligera evita descargar el estado completo antes de cada guardado.
  const remoteMeta=await fetchRemoteMeta();
  if(remoteMeta&&remoteMeta.reset_epoch&&(remoteMeta.reset_epoch!==(m.resetEpoch||null))){
   const remote=await fetchRemote();if(!remote)throw new Error('No se pudo recuperar el restablecimiento desde la nube.');await persistLegacyAuditEvents(remote.state&&remote.state.auditLog||[]);
   backupResetLocalState(local,remote.reset_epoch);applyCloudState(remote.state);const resetHash=await hashState(app()||{});saveMeta(resetHash,remote.revision,remote.reset_epoch);status('Restablecimiento aplicado; se descartaron los datos locales antiguos de la sincronización.');return;
  }
  if(!remoteMeta){
   const result=await writeRemote(local,0);
   if(!result.saved)throw new Error('No se pudo crear la copia en la nube.');
   revision=result.revision;saveMeta(localHash,revision,null);
  }else if(remoteMeta.revision!==revision){
   const remote=await fetchRemote();if(!remote)throw new Error('No se pudo recuperar la versión más reciente de la nube.');await persistLegacyAuditEvents(remote.state&&remote.state.auditLog||[]);
   if(remote.reset_epoch&&(remote.reset_epoch!==(m.resetEpoch||null))){backupResetLocalState(local,remote.reset_epoch);applyCloudState(remote.state);const resetHash=await hashState(app()||{});saveMeta(resetHash,remote.revision,remote.reset_epoch);return;}
   const merged=mergeState(remote.state,local);
   const result=await writeRemote(merged,remote.revision);
   if(!result.saved)throw new Error('El registro cambió durante la sincronización. Reintentaremos automáticamente.');
   const h=await hashState(merged);revision=result.revision;saveMeta(h,revision,remote.reset_epoch||null);applyCloudState(merged);
  }else{
   const result=await writeRemote(local,revision);
   if(!result.saved){
    // Solo ante un conflicto se descarga el estado completo para fusionar cambios de otro dispositivo.
    const latest=await fetchRemote();if(!latest)throw new Error('El registro cambió durante la sincronización. Reintentaremos automáticamente.');await persistLegacyAuditEvents(latest.state&&latest.state.auditLog||[]);
    if(latest.reset_epoch&&(latest.reset_epoch!==(m.resetEpoch||null))){backupResetLocalState(local,latest.reset_epoch);applyCloudState(latest.state);const resetHash=await hashState(app()||{});saveMeta(resetHash,latest.revision,latest.reset_epoch);return;}
    const merged=mergeState(latest.state,local),retry=await writeRemote(merged,latest.revision);
    if(!retry.saved)throw new Error('Se detectó una edición simultánea. Se reintentará al recibir la actualización.');
    const h=await hashState(merged);revision=retry.revision;saveMeta(h,revision,latest.reset_epoch||null);applyCloudState(merged);
   }else{revision=result.revision;saveMeta(localHash,revision,remoteMeta.reset_epoch||null)}
  }
  if(forceVerify){
   const verifiedMeta=await fetchRemoteMeta();
   if(!verifiedMeta||Number(verifiedMeta.revision)!==Number(revision)){
    throw new Error('La escritura terminó, pero la revisión más reciente no pudo verificarse en la nube.');
   }
  }
  saveRetryCount=0;pendingLocalChanges=false;
  status('Guardado confirmado en la nube · versión '+revision);
  window.dispatchEvent(new CustomEvent('flebo:cloud-save-confirmed',{detail:{workspaceId,revision}}));
  return true;
 }catch(e){
  pendingLocalChanges=true;
  console.error('[FleboReport Sync] Guardado:',e);
  const message=e&&e.message?e.message:'error desconocido';
  status('No se confirmó el guardado en la nube: '+message,true);
  window.dispatchEvent(new CustomEvent('flebo:cloud-save-failed',{detail:{message,workspaceId}}));
  if(ready&&writable&&saveRetryCount<3){saveRetryCount++;engine.schedule('cloud-save-retry',syncLocal,Math.min(12000,1500*Math.pow(2,saveRetryCount-1)))}
  return false;
 }finally{busy=false;runPending()}
}
function schedule(){
 if(!ready){pendingLocalChanges=true;status('Cambio pendiente: esperando conexión segura con la nube.');return}
 if(!writable)return;
 pendingLocalChanges=true;
 status('Guardando cambios en la nube…');
 engine.schedule('cloud-save',syncLocal,700)
}
window.addEventListener('flebo:local-state-saved',schedule);
window.addEventListener('flebo:auth-changed',()=>{const user=window.FleboAuth&&window.FleboAuth.user,membership=window.FleboAuth&&window.FleboAuth.membership;if(!user){ready=false;stateSyncAllowed=false;if(document.body)document.body.classList.remove('flebo-cloud-ready');if(channel&&client)client.removeChannel(channel);channel=null;status('Inicia sesión para sincronizar los datos.');return}if(user.id!==userId||membership?.workspace_id!==workspaceId){if(document.body)document.body.classList.remove('flebo-cloud-ready')}connect()});
window.addEventListener('online',()=>{if(ready)syncLocal();schedulePoll(250)});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&navigator.onLine){if(ready)receiveRemote();else connect();schedulePoll(500)}else if(pollTimer){clearTimeout(pollTimer);pollTimer=null}});
function schedulePoll(delay){
 if(pollTimer)clearTimeout(pollTimer);
 pollTimer=setTimeout(async()=>{
  pollTimer=null;
  if(document.visibilityState==='visible'&&navigator.onLine){if(ready)await receiveRemote();else await connect()}
  schedulePoll(engine.nextPollDelay());
 },delay===undefined?engine.nextPollDelay():delay);
}
const rawConnect=connect,rawReceiveRemote=receiveRemote,rawSyncLocal=syncLocal;
connect=()=>engine.measure('sync.connect',rawConnect);
receiveRemote=()=>engine.measure('sync.refresh',rawReceiveRemote);
syncLocal=(options)=>engine.measure('sync.save',()=>rawSyncLocal(options));
schedulePoll();
window.FleboCloudSync={connect,syncNow:syncLocal,get status(){return{ready,workspaceId,revision,role}},get diagnostics(){return engine.diagnostics()}};
window.FleboCloudAudit={record:recordAppActivity,importLegacy:persistLegacyAuditEvents,get ready(){return !!(ready&&client&&workspaceId&&userId)},get workspaceId(){return workspaceId}};
function boot(){if(started)return;started=true;status('Conectando con la nube…');if(window.FleboAuth&&window.FleboAuth.user)connect()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
})();