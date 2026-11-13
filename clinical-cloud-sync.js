(function(){
'use strict';
let client=null,workspaceId=null,userId=null,role=null,ready=false,busy=false,syncPromise=null,sampleLoadPromise=null,activeClinicalMutations=0;
const app=()=>window.FleboAppState&&window.FleboAppState.get?window.FleboAppState.get():null;
let pendingClinicalRefresh=false;
function clinicalUiIsBusy(){
 if(activeClinicalMutations>0)return true;
 const active=document.activeElement;
 if(active&&/^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName))return true;
 if(document.getElementById('clinicalProcessingModal'))return true;
 if(document.querySelector('#clinicalQueueRows input:checked,#clinicalReviewRows input:checked,[data-clinical-sample]:checked'))return true;
 const editIds=['clinicalStudyEditId','clinicalSubjectEditId','clinicalProcessingEditId','clinicalConfigEditId'];
 if(editIds.some(id=>{const el=document.getElementById(id);return !!(el&&String(el.value||'').trim())}))return true;
 const formIds=['clinicalProtocol','clinicalStudyName','clinicalStudyClient','clinicalSponsor','clinicalCRO','clinicalPI','clinicalStudyStart','clinicalStudyEnd','clinicalStudyNotes','clinicalSubjectCode','clinicalSubjectNotes','clinicalProcessSubject','clinicalProcessVisit','clinicalSampleType','clinicalProcessNotes','clinicalProcessTime'];
 if(formIds.some(id=>{const el=document.getElementById(id);return !!(el&&!el.disabled&&String(el.value||'').trim())}))return true;
 const config=document.getElementById('clinicalConfigFields');
 if(config&&!config.closest('[hidden]')&&Array.from(config.querySelectorAll('input:not([type="hidden"]),select,textarea')).some(el=>String(el.value||'').trim()))return true;
 return false;
}
function refreshClinicalViewSafely(){
 const activeView=document.querySelector('#view-clinical-studies.active,#view-clinical-processing.active');
 if(!activeView){pendingClinicalRefresh=false;return false}
 if(clinicalUiIsBusy()){pendingClinicalRefresh=true;return false}
 if(typeof window.renderClinicalStudies==='function'){
  pendingClinicalRefresh=false;
  window.renderClinicalStudies();
  return true;
 }
 return false;
}
function flushPendingClinicalRefresh(){if(pendingClinicalRefresh)refreshClinicalViewSafely()}
document.addEventListener('focusout',()=>setTimeout(flushPendingClinicalRefresh,0));
window.addEventListener('flebo:local-state-saved',()=>setTimeout(flushPendingClinicalRefresh,0));
window.addEventListener('flebo:clinical-operation-idle',()=>setTimeout(flushPendingClinicalRefresh,0));
const uid=()=>window.crypto&&crypto.randomUUID?crypto.randomUUID():('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16)}));
const fail=e=>{throw new Error(e&&e.message?e.message:String(e||'Error de sincronización clínica'))};
async function fetchAllPages(query,pageSize=500){const rows=[];for(let from=0;;from+=pageSize){const result=await query.range(from,from+pageSize-1);if(result.error)fail(result.error);const page=result.data||[];rows.push(...page);if(page.length<pageSize)break;}return rows;}
const actorName=()=>{const u=window.FleboAuth&&window.FleboAuth.user,m=u&&u.user_metadata||{};return String(m.display_name||m.name||(u&&u.email?u.email.split('@')[0]:'')||'Usuario autenticado').trim()};
function trackClinicalMutation(fn){
 return async function(...args){
  activeClinicalMutations++;
  try{return await fn.apply(this,args)}
  finally{
   activeClinicalMutations=Math.max(0,activeClinicalMutations-1);
   if(activeClinicalMutations===0)window.dispatchEvent(new Event('flebo:clinical-operation-idle'));
  }
 };
}
async function connect(){
 try{
  if(!window.FleboAuth)return;
  client=await window.FleboAuth.init();
  const auth=window.FleboAuth,m=auth.membership;
  if(!auth.user||!m||m.active!==true||!m.workspace_id){ready=false;return}
  const nextUserId=auth.user.id,nextWorkspaceId=m.workspace_id,nextRole=m.role;
  if(userId!==nextUserId||workspaceId!==nextWorkspaceId||role!==nextRole){
   clinicalSyncCursor=null;
   lastClinicalFullVerificationAt=0;
   lastClinicalConfigVerificationAt=0;
  }
  userId=nextUserId;workspaceId=nextWorkspaceId;role=nextRole;
  // Evitar descargar y suscribir el catálogo clínico para cuentas sin
  // estudios/processing.view. La UI no debe consultar datos prohibidos por RLS.
  const clinicalModuleView = !!(window.fleboCan?.('studies','view')||window.fleboCan?.('processing','view'));
  ready=['admin','clinician','reception'].includes(role)
    || (['technician','role_custom'].includes(role)&&clinicalModuleView);
  // Una sesión nueva siempre descarga una instantánea completa. No reutilizar
  // cursores persistidos sin verificar que el estado local contenga la instantánea
  // completa: un cursor antiguo podía omitir todas las muestras al entrar como admin.
  if(clinicalRealtimeChannel)client.removeChannel(clinicalRealtimeChannel);
  clinicalRealtimeChannel=null;
  if(ready){
   clinicalRealtimeChannel=client.channel('fleboreport-clinical-delta-'+workspaceId)
    // Evitar el filtro servidor workspace_id: Realtime está rechazándolo como columna inválida
    // aunque existe en sync_change_log. RLS limita las filas y el cliente valida el espacio.
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'sync_change_log'},payload=>{
     const changedWorkspace=payload&&payload.new&&payload.new.workspace_id;
     if(String(changedWorkspace||'')!==String(workspaceId))return;
     scheduleClinicalIncrementalRefresh();
    })
    .subscribe();
  }
 }catch(e){ready=false;console.error('[FleboReport Clinical Cloud]',e)}
}
function requireReady(roles){
 if(!ready||!client||!workspaceId)throw new Error('La conexión clínica con Supabase no está lista. Inicia sesión y vuelve a intentarlo.');
 if(roles&&roles.indexOf(role)<0)throw new Error('Tu rol no tiene permiso para esta operación clínica.');
}
async function saveStudy(study){
 let q=client.from('clinical_studies').select('id').eq('workspace_id',workspaceId).eq('protocol_code',study.protocol).order('id',{ascending:true}).limit(1);
 let r=await q;if(r.error)fail(r.error);r.data=Array.isArray(r.data)?(r.data[0]||null):r.data;
 const payload={workspace_id:workspaceId,protocol_code:study.protocol,name:study.name,client_name:study.clientName||null,sponsor:study.sponsor||null,cro:study.cro||null,principal_investigator:study.investigator||null,status:study.status||'Activo',starts_on:study.startDate||null,ends_on:study.endDate||null,notes:study.notes||null};
 let row=r.data;
 if(row){const id=row.id;const u=await client.from('clinical_studies').update(payload).eq('id',id);if(u.error)fail(u.error);row={id};}
 else{const i=await client.from('clinical_studies').insert(payload).select('id').single();if(i.error)fail(i.error);row=i.data}
 study.cloudId=row.id;return row.id;
}
async function saveVisit(study,studyCloudId,visit){
 const code=String(visit.code||visit.id||visit.name).trim();
 const spec=study.visitSpecs&&study.visitSpecs[visit.id]||{};
 const result=await client.rpc('upsert_clinical_visit_config',{
  p_workspace_id:workspaceId,p_study_id:studyCloudId,p_code:code,p_name:visit.name,
  p_sort_order:Number(visit.order||visit.sortOrder||0),
  p_scheduled_day:spec.dayScheduled!=null?Number(spec.dayScheduled):(visit.dayScheduled!=null?Number(visit.dayScheduled):null),
  p_active:visit.active!==false
 });
 if(result.error)fail(result.error);
 const id=Array.isArray(result.data)?result.data[0]:result.data;
 if(!id)throw new Error('Supabase no devolvió el identificador de la visita.');
 visit.cloudId=id;return id;
}
async function saveSampleType(study,studyCloudId,type){
 const code=String(type.code||type.id||type.name).trim();
 const spec=study.sampleSpecs&&study.sampleSpecs[type.id]||{};
 const merged=Object.assign({},type,spec);
 const result=await client.rpc('upsert_clinical_sample_type_config',{
  p_workspace_id:workspaceId,p_study_id:studyCloudId,p_code:code,p_name:type.name,
  p_tube:merged.tube||null,p_volume:merged.volume||null,
  p_processing_protocol:merged.processingRequired||merged.processing_protocol||null,
  p_color:merged.color||null,p_marking:merged.marking||null,
  p_expected_containers:merged.expectedContainers==null?null:Number(merged.expectedContainers),
  p_expected_primary_aliquots:merged.expectedPrimaryAliquots==null?null:Number(merged.expectedPrimaryAliquots),
  p_expected_backup_aliquots:merged.expectedBackupAliquots==null?null:Number(merged.expectedBackupAliquots),
  p_description:merged.description||null,p_active:type.active!==false
 });
 if(result.error)fail(result.error);
 const id=Array.isArray(result.data)?result.data[0]:result.data;
 if(!id)throw new Error('Supabase no devolvió el identificador del tipo de muestra.');
 const coagUpdate=await client.rpc('set_clinical_sample_type_coagulation_config',{
  p_workspace_id:workspaceId,p_sample_type_id:id,p_enabled:merged.coagulationEnabled===true,
  p_min_minutes:merged.coagulationEnabled===true?Number(merged.coagulationMinMinutes):null,
  p_max_minutes:merged.coagulationEnabled===true?Number(merged.coagulationMaxMinutes):null,
  p_alert_before_minutes:merged.coagulationEnabled===true?(Number(merged.coagulationAlertBeforeMinutes)||15):null
 });
 if(coagUpdate.error)fail(coagUpdate.error);
 type.cloudId=id;return id;
}
async function syncBoxes(studies){
 const s=app()||{},boxes=s.clinicalLocations||[],localStudies=studies||s.clinicalStudies||[];if(role!=='admin')return;
 let fr=await client.from('clinical_freezers').select('id,name').eq('workspace_id',workspaceId);if(fr.error)fail(fr.error);
 const freezerRows=fr.data||[],drawerMap=new Map(),trayMap=new Map();
 for(const f of (s.clinicalFreezers||[])){
  let row=freezerRows.find(x=>String(x.name).toLowerCase()===String(f.name||'').toLowerCase());
  if(!row){const freezerName=String(f.name||'').trim();if(!freezerName)throw new Error('Hay un congelador sin nombre en la configuración local.');const ins=await client.from('clinical_freezers').upsert({workspace_id:workspaceId,name:freezerName,active:true},{onConflict:'workspace_id,name'}).select('id,name').single();if(ins.error)fail(ins.error);row=ins.data;freezerRows.push(row)}
  f.cloudId=row.id;
  let dr=await client.from('clinical_freezer_drawers').select('id,drawer_no').eq('workspace_id',workspaceId).eq('freezer_id',row.id);if(dr.error)fail(dr.error);
  const usedDrawerKeys=new Set(boxes.filter(b=>b.freezerId===f.id||String(b.freezer||'').toLowerCase()===String(f.name||'').toLowerCase()).flatMap(b=>[b.drawerId,b.drawer]).concat((s.clinicalRacks||[]).filter(r=>r.freezerId===f.id).flatMap(r=>[r.drawerId,r.drawer])).filter(Boolean).map(String));for(const d of (f.drawers||[])){if(!usedDrawerKeys.has(String(d.id))&&!usedDrawerKeys.has(String(d.name)))continue;const n=Number((String(d.name||'').match(/\d+/)||[])[0])||Number(d.drawerNo)||0;if(n<1||n>4)continue;let drow=(dr.data||[]).find(x=>Number(x.drawer_no)===n);if(!drow){const ins=await client.from('clinical_freezer_drawers').insert({workspace_id:workspaceId,freezer_id:row.id,drawer_no:n,name:d.name}).select('id,drawer_no').single();if(ins.error)fail(ins.error);drow=ins.data}d.cloudId=drow.id;drawerMap.set(d.id,drow.id)}
 }
 for(const rack of (s.clinicalRacks||[])){const f=(s.clinicalFreezers||[]).find(x=>x.id===rack.freezerId),d=f&&(f.drawers||[]).find(x=>x.id===rack.drawerId||x.name===rack.drawer),dc=d&&drawerMap.get(d.id);if(!f||!dc)continue;let rr=await client.from('clinical_racks').select('id').eq('workspace_id',workspaceId).eq('drawer_id',dc).eq('name',rack.name).order('id',{ascending:true}).limit(1);if(rr.error)fail(rr.error);let rrow=Array.isArray(rr.data)?(rr.data[0]||null):rr.data;if(!rrow){const ins=await client.from('clinical_racks').insert({workspace_id:workspaceId,drawer_id:dc,name:rack.name}).select('id').single();if(ins.error)fail(ins.error);rrow=ins.data}rack.cloudId=rrow.id;const configuredTrays=boxes.filter(b=>b.rackId===rack.id||(b.freezerId===rack.freezerId&&String(b.rack||'').toLowerCase()===String(rack.name||'').toLowerCase())).map(b=>b.tray||b.trayNo).filter(Boolean);for(const tray of configuredTrays){const n=Number((String(tray&&tray.name||tray).match(/\\d+/)||[])[0])||Number(tray&&tray.trayNo)||0;if(n<1||n>5)continue;let tr=await client.from('clinical_rack_trays').select('id').eq('workspace_id',workspaceId).eq('rack_id',rrow.id).eq('tray_no',n).order('id',{ascending:true}).limit(1);if(tr.error)fail(tr.error);let trow=Array.isArray(tr.data)?(tr.data[0]||null):tr.data;if(!trow){const ins=await client.from('clinical_rack_trays').insert({workspace_id:workspaceId,rack_id:rrow.id,tray_no:n,name:'Bandeja '+n}).select('id').single();if(ins.error)fail(ins.error);trow=ins.data}trayMap.set(rack.id+'|'+n,trow.id)}}
 for(const box of boxes){const study=localStudies.find(x=>x.id===box.studyId),f=(s.clinicalFreezers||[]).find(x=>x.id===box.freezerId||String(x.name).toLowerCase()===String(box.freezer||'').toLowerCase());if(!study?.cloudId||!f)continue;const d=(f.drawers||[]).find(x=>x.id===box.drawerId||x.name===box.drawer),rack=(s.clinicalRacks||[]).find(x=>x.id===box.rackId),tn=Number((String(box.tray||'').match(/\d+/)||[])[0])||Number(box.trayNo)||0,sn=Number((String(box.position||'').match(/\d+/)||[])[0])||Number(box.positionNo)||0,tid=rack&&trayMap.get(rack.id+'|'+tn);if(rack&&(!tid||sn<1||sn>4))throw new Error('La caja '+box.box+' requiere bandeja y posición válidas.');const payload={workspace_id:workspaceId,freezer_id:f.cloudId,drawer_id:d?(drawerMap.get(d.id)||d.cloudId):null,tray_id:tid||null,slot_no:tid?sn:null,box_code:box.box,storage_stage:box.storageStage,aliquot_capacity:Number(box.aliquotCapacity)||1,active:true,study_id:study.cloudId,box_type:box.storageStage==='temporal'?'caja_temporal':'caja_definitiva',created_by:userId,updated_at:new Date().toISOString()};let q=await client.from('clinical_boxes').select('id').eq('workspace_id',workspaceId).eq('box_code',box.box).order('id',{ascending:true}).limit(1);if(q.error)fail(q.error);let row=Array.isArray(q.data)?(q.data[0]||null):q.data;if(row){const id=row.id;const u=await client.from('clinical_boxes').update(payload).eq('id',id);if(u.error)fail(u.error);row={id};}else{const ins=await client.from('clinical_boxes').insert(payload).select('id').single();if(ins.error)fail(ins.error);row=ins.data}box.cloudId=row.id}
}
async function loadRemoteConfiguration(){
 const stateNow=app()||{},oldStudies=stateNow.clinicalStudies||[],oldVisits=stateNow.clinicalVisits||[],oldTypes=stateNow.clinicalSampleTypes||[];
 const [sr,vr,tr]=await Promise.all([
  client.from('clinical_studies').select('*').eq('workspace_id',workspaceId),
  client.from('clinical_visits').select('*').eq('workspace_id',workspaceId),
  client.from('clinical_sample_types').select('*').eq('workspace_id',workspaceId)
 ]);
 if(sr.error)fail(sr.error);if(vr.error)fail(vr.error);if(tr.error)fail(tr.error);
 const studies=(sr.data||[]).map(row=>{
  const old=oldStudies.find(x=>x.cloudId===row.id||String(x.protocol||'').toLowerCase()===String(row.protocol_code||'').toLowerCase())||{};
  return Object.assign({},old,{id:old.id||'cloud-st-'+row.id,cloudId:row.id,protocol:row.protocol_code,name:row.name,sponsor:row.sponsor||'',cro:row.cro||'',investigator:row.principal_investigator||'',status:row.status,startDate:row.starts_on||'',endDate:row.ends_on||'',notes:row.notes||'',visitIds:[],sampleTypeIds:[]});
 });
 const visits=(vr.data||[]).map(row=>{
  const study=studies.find(x=>x.cloudId===row.study_id);if(!study)return null;
  const old=oldVisits.find(x=>x.cloudId===row.id||(x.id===row.code&&study.visitIds.includes(x.id)))||{};
  const item=Object.assign({},old,{id:old.id||'cloud-v-'+row.id,cloudId:row.id,studyId:study.id,code:row.code||'',name:row.name,order:row.sort_order||0,dayScheduled:row.scheduled_day,active:row.active});
  study.visitIds.push(item.id);return item;
 }).filter(Boolean);
 const types=(tr.data||[]).map(row=>{
  const study=studies.find(x=>x.cloudId===row.study_id);if(!study)return null;
  const old=oldTypes.find(x=>x.cloudId===row.id)||{};
  const item=Object.assign({},old,{id:old.id||'cloud-t-'+row.id,cloudId:row.id,studyId:study.id,code:row.code||'',name:row.name,tube:row.tube||'',volume:row.volume||'',processingRequired:row.processing_protocol||'',color:row.color||'',marking:row.marking||'',expectedContainers:row.expected_containers,expectedPrimaryAliquots:row.expected_primary_aliquots,expectedBackupAliquots:row.expected_backup_aliquots,coagulation_enabled:row.coagulation_enabled,coagulation_min_minutes:row.coagulation_min_minutes,coagulation_max_minutes:row.coagulation_max_minutes,coagulation_alert_before_minutes:row.coagulation_alert_before_minutes,coagulationEnabled:row.coagulation_enabled===true,coagulationMinMinutes:row.coagulation_min_minutes,coagulationMaxMinutes:row.coagulation_max_minutes,coagulationAlertBeforeMinutes:row.coagulation_alert_before_minutes,description:row.description||'',active:row.active});
  study.sampleTypeIds.push(item.id);return item;
 }).filter(Boolean);
 // Supabase es la fuente oficial. Nunca reincorporar estudios, visitas o tipos
 // que existan solamente en el almacenamiento local de este dispositivo.
 // Las listas se reemplazan completas para impedir que reaparezcan elementos borrados.
 window.FleboAppState.replace(Object.assign({},stateNow,{
  clinicalStudies:studies,
  clinicalVisits:visits,
  clinicalSampleTypes:types
 }),{silent:true,deferRender:true});
}
async function loadRemoteBoxes(){
 const s=app()||{};const [fr,dr,rr,tr,br]=await Promise.all([client.from('clinical_freezers').select('*').eq('workspace_id',workspaceId),client.from('clinical_freezer_drawers').select('*').eq('workspace_id',workspaceId),client.from('clinical_racks').select('*').eq('workspace_id',workspaceId),client.from('clinical_rack_trays').select('*').eq('workspace_id',workspaceId),client.from('clinical_boxes').select('*').eq('workspace_id',workspaceId).eq('active',true)]);
 for(const q of [fr,dr,rr,tr,br])if(q.error)fail(q.error);const fs=fr.data||[],ds=dr.data||[],rs=rr.data||[],ts=tr.data||[],bs=br.data||[];
 const freezers=fs.map(f=>Object.assign({},(s.clinicalFreezers||[]).find(x=>x.cloudId===f.id)||{},{id:f.id,cloudId:f.id,name:f.name,drawers:ds.filter(d=>d.freezer_id===f.id).map(d=>({id:d.id,cloudId:d.id,name:d.name||('Gaveta '+d.drawer_no),drawerNo:d.drawer_no}))}));
 const racks=rs.map(r=>{const d=ds.find(x=>x.id===r.drawer_id),f=d&&fs.find(x=>x.id===d.freezer_id);return{id:r.id,cloudId:r.id,freezerId:f&&f.id,freezer:f&&f.name,drawerId:d&&d.id,drawer:d&&(d.name||('Gaveta '+d.drawer_no)),name:r.name,trays:ts.filter(t=>t.rack_id===r.id).map(t=>'Bandeja '+t.tray_no)}});
 const studyMap=new Map((s.clinicalStudies||[]).map(x=>[x.cloudId,x.id]));
 const locations=bs.map(b=>{const t=ts.find(x=>x.id===b.tray_id),r=t&&rs.find(x=>x.id===t.rack_id),d=ds.find(x=>x.id===(b.drawer_id||(r&&r.drawer_id))),f=fs.find(x=>x.id===(b.freezer_id||(d&&d.freezer_id)));return{id:b.id,cloudId:b.id,freezerId:f&&f.id,freezer:f&&f.name,drawerId:d&&d.id,drawer:d&&(d.name||('Gaveta '+d.drawer_no)),rackId:r&&r.id,rack:r&&r.name,tray:t?'Bandeja '+t.tray_no:'',trayNo:t&&t.tray_no,box:b.box_code,position:b.slot_no?'Posición '+b.slot_no:'',positionNo:b.slot_no||null,storageStage:b.storage_stage,aliquotCapacity:b.aliquot_capacity,studyId:studyMap.get(b.study_id)||'',studyCloudId:b.study_id}});
 const live=app()||s;
 // La nube es la fuente oficial: no concatenar cajas, racks ni congeladores locales antiguos.
 window.FleboAppState.replace(Object.assign({},live,{clinicalFreezers:freezers,clinicalRacks:racks,clinicalLocations:locations}),{silent:true,deferRender:true});
}
let clinicalSyncCursor=null,clinicalRealtimeChannel=null,clinicalRealtimeTimer=null,clinicalRealtimeRunning=false,clinicalRealtimeAgain=false;
let lastClinicalFullVerificationAt=0,lastClinicalConfigVerificationAt=0;
const CLINICAL_FULL_VERIFY_MS=240000,CLINICAL_CONFIG_VERIFY_MS=120000;
window.addEventListener('flebo:clinical-cache-reset',()=>{clinicalSyncCursor=null;});
async function latestClinicalPrunedFloor(){
 const result=await client.from('sync_change_log_retention').select('pruned_through_seq').eq('workspace_id',workspaceId).eq('entity','clinical_samples').maybeSingle();
 if(result.error)fail(result.error);
 return result.data?Number(result.data.pruned_through_seq)||0:0;
}
async function latestClinicalSyncCursor(){
 const [result,floor]=await Promise.all([
  client.from('sync_change_log').select('seq').eq('workspace_id',workspaceId).eq('entity','clinical_samples').order('seq',{ascending:false}).limit(1).maybeSingle(),
  latestClinicalPrunedFloor()
 ]);
 if(result.error)fail(result.error);
 return Math.max(result.data?Number(result.data.seq)||0:0,floor);
}
async function fetchSampleRelatedRows(table,columns,ids,order){
 const rows=[];
 for(let i=0;i<ids.length;i+=200){
  let query=client.from(table).select(columns).eq('workspace_id',workspaceId).in('sample_id',ids.slice(i,i+200));
  if(order)for(const item of order)query=query.order(item.column,{ascending:item.ascending});
  rows.push(...await fetchAllPages(query));
 }
 return rows;
}
async function loadRemoteSamples(){
 if(sampleLoadPromise)return sampleLoadPromise;
 sampleLoadPromise=loadRemoteSamplesInternal();
 try{return await sampleLoadPromise}finally{sampleLoadPromise=null}
}
async function loadRemoteSamplesInternal(){
 const stateNow=app()||{},oldSamples=stateNow.clinicalSamples||[];
 const locallyDeleted=new Set((stateNow['clinicalLocalDeleted'+'SampleIds']||[]).map(String));
 if(clinicalSyncCursor!==null){
  const floor=await latestClinicalPrunedFloor();
  if(Number(clinicalSyncCursor)<floor)clinicalSyncCursor=null;
 }
 const fullSnapshot=clinicalSyncCursor===null;
 const cursorBefore=fullSnapshot?await latestClinicalSyncCursor():clinicalSyncCursor;
 const changes=fullSnapshot?[]:await fetchAllPages(client.from('sync_change_log').select('seq,record_id,operation').eq('workspace_id',workspaceId).eq('entity','clinical_samples').gt('seq',clinicalSyncCursor).order('seq',{ascending:true}));
 if(!fullSnapshot&&!changes.length)return false;
 const changedCloudIds=Array.from(new Set(changes.map(x=>String(x.record_id))));
 const oldByCloudId=new Map(),oldByLegacyId=new Map();
 oldSamples.forEach(x=>{if(x.cloudId)oldByCloudId.set(String(x.cloudId),x);if(x.id)oldByLegacyId.set(String(x.id),x)});
 const sampleQuery=client.from('clinical_samples').select('id,legacy_id,study_id,patient_id,subject_code,visit_id,sample_type_id,collection_at,received_at,received_by,container_count,status,primary_aliquots,backup_aliquots,processed_by,processed_at,notes,created_by,created_at,updated_at,workflow_status,tube_barcode,reviewed_by,reviewed_at,processing_started_by,processing_started_at,coagulation_enabled,coagulation_min_minutes,coagulation_max_minutes,coagulation_alert_before_minutes,temporary_box_id,definitive_box_id,stored_by,stored_at').eq('workspace_id',workspaceId).is('deleted_at',null).order('received_at',{ascending:false}).order('id',{ascending:false});
 let sampleRows=[],containerRows=[],eventRows=[];
 if(fullSnapshot){
  // Primero obtener solo las muestras activas. Después descargar sus contenedores
  // e historial por lotes: evita recorrer registros huérfanos o de muestras retiradas.
  sampleRows=await fetchAllPages(sampleQuery);
  const activeSampleIds=sampleRows.map(row=>String(row.id));
  if(activeSampleIds.length){
   [containerRows,eventRows]=await Promise.all([
    fetchSampleRelatedRows('clinical_sample_containers','sample_id,barcode',activeSampleIds,[{column:'sample_id',ascending:true},{column:'barcode',ascending:true}]),
    fetchSampleRelatedRows('clinical_sample_events','id,sample_id,previous_status,next_status,notes,actor_id,occurred_at',activeSampleIds,[{column:'occurred_at',ascending:false},{column:'id',ascending:false}])
   ]);
  }
 }else{
  sampleRows=[];
  for(let i=0;i<changedCloudIds.length;i+=200){
   const pageQuery=client.from('clinical_samples').select('id,legacy_id,study_id,patient_id,subject_code,visit_id,sample_type_id,collection_at,received_at,received_by,container_count,status,primary_aliquots,backup_aliquots,processed_by,processed_at,notes,created_by,created_at,updated_at,workflow_status,tube_barcode,reviewed_by,reviewed_at,processing_started_by,processing_started_at,coagulation_enabled,coagulation_min_minutes,coagulation_max_minutes,coagulation_alert_before_minutes,temporary_box_id,definitive_box_id,stored_by,stored_at').eq('workspace_id',workspaceId).is('deleted_at',null).in('id',changedCloudIds.slice(i,i+200)).order('received_at',{ascending:false}).order('id',{ascending:false});
   sampleRows.push(...await fetchAllPages(pageQuery));
  }
  [containerRows,eventRows]=await Promise.all([
   fetchSampleRelatedRows('clinical_sample_containers','sample_id,barcode',changedCloudIds,[{column:'sample_id',ascending:true},{column:'barcode',ascending:true}]),
   fetchSampleRelatedRows('clinical_sample_events','id,sample_id,previous_status,next_status,notes,actor_id,occurred_at',changedCloudIds,[{column:'occurred_at',ascending:false},{column:'id',ascending:false}])
  ]);
 }
 const profiles=await client.rpc('get_workspace_profile_names',{p_workspace_id:workspaceId});
 if(profiles.error)fail(profiles.error);
 const profileMap=new Map((profiles.data||[]).map(x=>[x.user_id,String(x.display_name||x.username||'').trim()]));
 const currentUser=window.FleboAuth&&window.FleboAuth.user,currentMeta=currentUser&&currentUser.user_metadata||{},currentName=currentMeta.display_name||currentMeta.name||(currentUser&&currentUser.email?currentUser.email.split('@')[0]:'');
 if(currentUser&&currentName)profileMap.set(currentUser.id,String(currentName).trim());
 const containerBarcodes=new Map();containerRows.forEach(x=>{const key=String(x.sample_id);if(!containerBarcodes.has(key))containerBarcodes.set(key,[]);containerBarcodes.get(key).push(x.barcode)});
 const cloudSampleById=new Map(sampleRows.map(x=>[String(x.id),x]));
 const studyMap=new Map((stateNow.clinicalStudies||[]).map(x=>[x.cloudId,x]));
 const visitMap=new Map((stateNow.clinicalVisits||[]).map(x=>[x.cloudId,x]));
 const typeMap=new Map((stateNow.clinicalSampleTypes||[]).map(x=>[x.cloudId,x]));
 const patientMap=new Map((stateNow.patients||[]).filter(x=>x.cloudPatientId).map(x=>[x.cloudPatientId,x]));
 const next=sampleRows.map(row=>{
  const old=oldByCloudId.get(String(row.id))||oldByLegacyId.get(String(row.legacy_id))||{};
  const study=studyMap.get(row.study_id),visit=visitMap.get(row.visit_id),type=typeMap.get(row.sample_type_id),patient=patientMap.get(row.patient_id);
  const d=new Date(row.collection_at),rd=new Date(row.received_at),bars=containerBarcodes.get(String(row.id))||[];
  return Object.assign({},old,{id:row.legacy_id||old.id||'cloud-sm-'+row.id,cloudId:row.id,patientId:patient?patient.id:row.patient_id,studyId:study?study.id:old.studyId,subjectCode:row.subject_code,visitId:visit?visit.id:old.visitId,visit:visit?visit.name:old.visit,sampleTypeId:type?type.id:old.sampleTypeId,sampleType:type?type.name:old.sampleType,collectionDate:Number.isNaN(d.getTime())?'':d.toISOString().slice(0,10),collectionTime:Number.isNaN(d.getTime())?'':d.toISOString().slice(11,16),collectedAt:row.collection_at,date:Number.isNaN(rd.getTime())?'':rd.toISOString().slice(0,10),time:Number.isNaN(rd.getTime())?'':rd.toISOString().slice(11,16),receivedAt:row.received_at,tubes:row.container_count,tubeBarcodes:bars.length?bars:(row.tube_barcode?[row.tube_barcode]:[]),status:row.status,workflowStatus:row.workflow_status,primaryAliquots:row.primary_aliquots,backupAliquots:row.backup_aliquots,receivedBy:profileMap.get(row.received_by)||(row.received_by?'Responsable no identificado':''),receivedById:row.received_by||'',reviewedBy:profileMap.get(row.reviewed_by)||(row.reviewed_by?'Responsable no identificado':''),reviewedById:row.reviewed_by||'',reviewedAt:row.reviewed_at,processingStartedBy:profileMap.get(row.processing_started_by)||(row.processing_started_by?'Responsable no identificado':''),processingStartedById:row.processing_started_by||'',processingStartedAt:row.processing_started_at,coagulationEnabled:row.coagulation_enabled===true,coagulationMinMinutes:row.coagulation_min_minutes,coagulationMaxMinutes:row.coagulation_max_minutes,coagulationAlertBeforeMinutes:row.coagulation_alert_before_minutes,processedAt:row.processed_at,processedBy:profileMap.get(row.processed_by)||(row.processed_by?'Responsable no identificado':''),processedById:row.processed_by||'',storedBy:profileMap.get(row.stored_by)||(row.stored_by?'Responsable no identificado':''),storedById:row.stored_by||'',storedAt:row.stored_at,notes:row.notes||'',temporaryBoxId:row.temporary_box_id,temporaryBoxCloudId:row.temporary_box_id,definitiveBoxId:row.definitive_box_id,definitiveBoxCloudId:row.definitive_box_id,createdAt:row.created_at,updatedAt:row.updated_at});
 });
 let mergedSamples;
 let changedLocalKeys=new Set();
 if(fullSnapshot){mergedSamples=next;}
 else{
  changedCloudIds.forEach(id=>{changedLocalKeys.add(id);changedLocalKeys.add('cloud-sm-'+id);const old=oldByCloudId.get(id);if(old?.id)changedLocalKeys.add(String(old.id));});
  next.forEach(x=>{changedLocalKeys.add(String(x.cloudId));changedLocalKeys.add(String(x.id));});
  mergedSamples=oldSamples.filter(x=>!changedLocalKeys.has(String(x.cloudId||''))&&!changedLocalKeys.has(String(x.id||''))).concat(next);
 }
 const visibleNext=mergedSamples.filter(x=>!locallyDeleted.has(String(x.id)));
 const eventRowsMapped=eventRows.map(e=>{
  const sample=cloudSampleById.get(String(e.sample_id))||oldByCloudId.get(String(e.sample_id));
  return{id:'db-'+e.sample_id+'-'+e.occurred_at,sampleId:sample?(sample.legacy_id||sample.id):'cloud-sm-'+e.sample_id,previousStatus:e.previous_status||'',newStatus:e.next_status,timestamp:e.occurred_at,operator:profileMap.get(e.actor_id)||(e.actor_id?'Responsable no identificado':'Sistema'),note:e.notes||''};
 });
 const oldHistory=stateNow.clinicalSampleHistory||[];
 const history=fullSnapshot?eventRowsMapped:oldHistory.filter(e=>!changedLocalKeys.has(String(e.sampleId))).concat(eventRowsMapped);
 const nextCursor=fullSnapshot?cursorBefore:Number(changes[changes.length-1].seq);
 window.FleboAppState.replace(Object.assign({},app()||stateNow,{clinicalSamples:visibleNext,clinicalSampleHistory:history,_clinicalCloudSyncCursor:nextCursor,_clinicalCloudSyncWorkspace:workspaceId,_clinicalCloudSyncUser:userId,_clinicalCloudSyncRole:role}),{silent:true,deferRender:true});
 if(fullSnapshot){
  clinicalSyncCursor=cursorBefore;
  // Reproduce los cambios ocurridos mientras se descargaba la instantánea inicial.
  return await loadRemoteSamplesInternal();
 }
 clinicalSyncCursor=Number(changes[changes.length-1].seq);
 return true;
}
function scheduleClinicalIncrementalRefresh(){
 if(clinicalRealtimeTimer)clearTimeout(clinicalRealtimeTimer);
 clinicalRealtimeTimer=setTimeout(async()=>{
  clinicalRealtimeTimer=null;
  if(clinicalRealtimeRunning){clinicalRealtimeAgain=true;return;}
  clinicalRealtimeRunning=true;
  try{await loadRemoteSamples();refreshClinicalViewSafely();}
  catch(error){console.error('[FleboReport Clinical Cloud] No se pudo aplicar el delta incremental:',error);}
  finally{clinicalRealtimeRunning=false;if(clinicalRealtimeAgain){clinicalRealtimeAgain=false;scheduleClinicalIncrementalRefresh();}}
 },300);
}
let clinicalPollTimer=null,clinicalFullRefreshRunning=false;
function scheduleClinicalPoll(delay){
 if(clinicalPollTimer)clearTimeout(clinicalPollTimer);
 clinicalPollTimer=setTimeout(async()=>{
  clinicalPollTimer=null;
  try{
   // Realtime avisa deltas; el sondeo incremental cubre desconexiones.
   // Verificación completa espaciada para reconciliar pérdidas de eventos.
   // No reemplazar datos mientras se editan formularios ni guardar en curso.
   if(document.visibilityState==='visible'&&navigator.onLine&&ready
      &&!clinicalFullRefreshRunning&&!clinicalRealtimeRunning
      &&!syncPromise&&!clinicalUiIsBusy()){
    clinicalFullRefreshRunning=true;
    const now=Date.now();
    const full=clinicalSyncCursor===null||now-lastClinicalFullVerificationAt>=CLINICAL_FULL_VERIFY_MS;
    const config=full||now-lastClinicalConfigVerificationAt>=CLINICAL_CONFIG_VERIFY_MS;
    if(full)clinicalSyncCursor=null;
    if(config){await loadRemoteConfiguration();lastClinicalConfigVerificationAt=Date.now();}
    const updated=await loadRemoteSamples();
    if(full)lastClinicalFullVerificationAt=Date.now();
    if(updated||config)refreshClinicalViewSafely();
   }
  }catch(error){console.error('[FleboReport Clinical Cloud] Falló la comprobación incremental:',error);}
  finally{clinicalFullRefreshRunning=false;scheduleClinicalPoll(20000);}
 },delay===undefined?20000:delay);
}
async function syncConfiguration(){
 requireReady(['admin','clinician','technician','reception']);
 if(syncPromise)return syncPromise;
 syncPromise=(async function(){
  let stage='lectura de configuración clínica en la nube';
  try{
   await loadRemoteConfiguration();
   if(role==='admin'||role==='technician')await loadRemoteBoxes();
   stage='lectura de muestras y crioviales';
   await loadRemoteSamples();
   lastClinicalFullVerificationAt=Date.now();
   lastClinicalConfigVerificationAt=Date.now();
   refreshClinicalViewSafely();
   return true;
  }catch(error){
   console.error('[FleboReport Clinical Cloud] Falló '+stage,error);
   throw new Error('Falló '+stage+': '+(error&&error.message?error.message:String(error)));
  }
 })();
 try{return await syncPromise}finally{syncPromise=null}
}
async function saveConfiguration(){
 requireReady(['admin']);
 if(syncPromise){try{await syncPromise}catch(_){}}
 syncPromise=(async function(){
  let stage='guardado explícito de estudios, visitas y tipos de muestra';
  try{
   const stateNow=app()||{},studies=stateNow.clinicalStudies||[],visits=stateNow.clinicalVisits||[],types=stateNow.clinicalSampleTypes||[];
   for(const study of studies){
    const sid=await saveStudy(study);
    const linkedVisits=visits.filter(v=>(study.visitIds||[]).includes(v.id));
    for(const visit of linkedVisits)await saveVisit(study,sid,visit);
    const linkedTypes=types.filter(t=>(study.sampleTypeIds||[]).includes(t.id));
    for(const type of linkedTypes)await saveSampleType(study,sid,type);
   }
   await loadRemoteConfiguration();
   refreshClinicalViewSafely();
   return true;
  }catch(error){
   console.error('[FleboReport Clinical Cloud] Falló '+stage,error);
   throw new Error('Falló '+stage+': '+(error&&error.message?error.message:String(error)));
  }
 })();
 try{return await syncPromise}finally{syncPromise=null}
}
async function resolveSampleMasterRecords(sample){
 const s=app()||{};
 const study=(s.clinicalStudies||[]).find(x=>x.id===sample.studyId);
 const visit=(s.clinicalVisits||[]).find(x=>x.id===sample.visitId);
 const type=(s.clinicalSampleTypes||[]).find(x=>x.id===sample.sampleTypeId);
 if(!study||!visit||!type)throw new Error('Selecciona un estudio, una visita y un tipo de muestra válidos.');
 const sr=await client.from('clinical_studies').select('id').eq('workspace_id',workspaceId).eq('protocol_code',study.protocol).order('id',{ascending:true}).limit(1);
 if(sr.error)fail(sr.error);
 const studyRow=(sr.data||[])[0];
 if(!studyRow)throw new Error('El estudio no está sincronizado en la nube. Abre Configuración de estudios y guarda el estudio antes de registrar muestras.');
 const [visitRows,typeRows]=await Promise.all([
  client.from('clinical_visits').select('id').eq('workspace_id',workspaceId).eq('study_id',studyRow.id).eq('code',String(visit.code||visit.id||visit.name).trim()).order('id',{ascending:true}).limit(1),
  client.from('clinical_sample_types').select('id').eq('workspace_id',workspaceId).eq('study_id',studyRow.id).eq('code',String(type.code||type.id||type.name).trim()).order('id',{ascending:true}).limit(1)
 ]);
 if(visitRows.error)fail(visitRows.error);if(typeRows.error)fail(typeRows.error);
 const visitRow=(visitRows.data||[])[0],typeRow=(typeRows.data||[])[0];
 if(!visitRow||!typeRow)throw new Error('La visita o el tipo de muestra no está sincronizado en la nube para el estudio seleccionado.');
 study.cloudId=studyRow.id;visit.cloudId=visitRow.id;type.cloudId=typeRow.id;
 return {study,visit,type};
}
async function registerSample(sample){
 requireReady(['admin','clinician','technician','reception']);
 if(!sample)throw new Error('No se recibió la muestra.');
 let stage='vinculación de estudio, visita y tipo de muestra';
 try{
  const {study,visit,type}=await resolveSampleMasterRecords(sample);
  stage='ejecución del registro de muestra en Supabase';
  const result=await client.rpc('register_clinical_sample',{
   p_workspace_id:workspaceId,p_legacy_id:String(sample.id),p_study_id:study.cloudId,
   p_patient_id:null,p_subject_code:sample.subjectCode,p_visit_id:visit.cloudId,
   p_sample_type_id:type.cloudId,p_collection_at:sample.collectedAt,p_received_at:sample.receivedAt,
   p_container_count:Number(sample.tubes),p_tube_barcodes:[],p_notes:sample.notes||null
  });
  if(result.error)fail(result.error);
  const data=Array.isArray(result.data)?result.data[0]:result.data;
  if(!data||!data.sample_id)throw new Error('Supabase no devolvió el identificador de la muestra.');
  sample.cloudId=data.sample_id;sample.workflowStatus=data.workflow_status||'REGISTRADO';
  if(sample.coagulationEnabled===true){
   const coagSave=await client.rpc('set_clinical_sample_coagulation_snapshot',{
    p_workspace_id:workspaceId,p_sample_id:data.sample_id,p_min_minutes:Number(sample.coagulationMinMinutes),
    p_max_minutes:Number(sample.coagulationMaxMinutes),p_alert_before_minutes:Number(sample.coagulationAlertBeforeMinutes)||15
   });
   if(coagSave.error)fail(coagSave.error);
  }
  return data;
 }catch(error){
  console.error('[FleboReport Clinical Cloud] Falló '+stage,error);
  throw new Error('Falló '+stage+': '+(error&&error.message?error.message:String(error)));
 }
}
async function getManagementPermissions(){
 requireReady();
 const result=await client.rpc('clinical_sample_management_permissions',{p_workspace_id:workspaceId});
 if(result.error)fail(result.error);
 const d=Array.isArray(result.data)?result.data[0]:result.data;
 return {can_edit:d?.can_edit===true,can_delete:d?.can_delete===true};
}
async function correctSample(sample,visit,collectionAt,receivedAt,reason){
 requireReady(['admin','clinician']);
 if(!sample?.cloudId||!visit?.cloudId)throw new Error('La muestra o visita no está vinculada a Supabase.');
 if(!['ALMACENAMIENTO_TEMPORAL','CONGELADOR_DEFINITIVO'].includes(sample.workflowStatus))
  throw new Error('Solo se pueden corregir muestras almacenadas.');
 const result=await client.rpc('correct_clinical_sample',{
  p_workspace_id:workspaceId,p_sample_id:sample.cloudId,p_visit_id:visit.cloudId,
  p_collection_at:collectionAt,p_received_at:receivedAt,p_reason:String(reason||'').trim(),
  p_expected_updated_at:sample.updatedAt||null
 });
 if(result.error)fail(result.error);
 const d=Array.isArray(result.data)?result.data[0]:result.data;
 if(!d||d.ok!==true||d.status!==sample.workflowStatus)
  throw new Error('Supabase no confirmó la corrección de esta muestra.');
 await refreshSamples();
 return d;
}
async function deleteSample(sample,reason){
 requireReady(['admin','clinician']);
 if(role!=='admin')throw new Error('Solo el administrador puede eliminar muestras.');
 if(!sample||!sample.cloudId)throw new Error('La muestra no está vinculada al registro clínico de Supabase.');
 const result=await client.rpc('delete_clinical_sample',{p_workspace_id:workspaceId,p_sample_id:sample.cloudId,p_reason:String(reason||'').trim()});
 if(result.error)fail(result.error);
 const data=Array.isArray(result.data)?result.data[0]:result.data;
 if(!data||!data.ok)throw new Error('Supabase no confirmó la eliminación de la muestra.');
 sample.deletedAt=data.deleted_at||new Date().toISOString();
 return data;
}
async function transition(sample,next,args){
 requireReady(['admin','clinician','technician','reception']);
 if(!sample||!sample.cloudId)throw new Error('La muestra no está vinculada al registro clínico de Supabase.');
 args=args||{};
 const result=await client.rpc('transition_clinical_sample',{
  p_sample_id:sample.cloudId,p_next_status:next,p_notes:args.notes||null,
  p_primary_aliquots:args.primaryAliquots==null?null:Number(args.primaryAliquots),
  p_backup_aliquots:args.backupAliquots==null?null:Number(args.backupAliquots),
  p_temporary_box_id:args.temporaryBoxId||null,p_definitive_box_id:args.definitiveBoxId||null
 });
 if(result.error)fail(result.error);
 const data=Array.isArray(result.data)?result.data[0]:result.data;
 if(!data||data.ok!==true||data.status!==next)throw new Error('Supabase no confirmó la transición de la muestra.');
 sample.workflowStatus=next;
 const legacy={EN_REVISION:'En revisión',PENDIENTE_PROCESO:'Pendiente de procesamiento',PROCESANDO:'Pendiente de procesamiento',ALMACENAMIENTO_TEMPORAL:'Procesada',CONGELADOR_DEFINITIVO:'Almacenada'};
 sample.status=legacy[next]||sample.status;
 sample.updatedAt=new Date().toISOString();
 if(next==='PENDIENTE_PROCESO'){sample.reviewedAt=sample.updatedAt;sample.reviewedBy=actorName()}
 if(next==='PROCESANDO'){sample.processingStartedAt=sample.updatedAt;sample.processingStartedBy=actorName();if(args.primaryAliquots!=null)sample.primaryAliquots=Number(args.primaryAliquots);if(args.backupAliquots!=null)sample.backupAliquots=Number(args.backupAliquots)}
 if(next==='ALMACENAMIENTO_TEMPORAL'){if(args.temporaryBoxId)sample.temporaryBoxId=args.temporaryBoxId;sample.processedAt=sample.updatedAt;sample.processedBy=actorName()}
 if(next==='CONGELADOR_DEFINITIVO'){if(args.definitiveBoxId)sample.definitiveBoxId=args.definitiveBoxId;sample.storedAt=sample.updatedAt;sample.storedBy=actorName()}
 return data;
}
async function saveAliquots(sample,primary,backup){
 requireReady(['admin','technician']);
 if(!sample||!sample.cloudId)throw new Error('La muestra no está vinculada a Supabase.');
 const result=await client.rpc('set_clinical_sample_aliquots',{p_sample_id:sample.cloudId,p_primary_aliquots:Number(primary),p_backup_aliquots:Number(backup)});
 if(result.error)fail(result.error);
 const data=Array.isArray(result.data)?result.data[0]:result.data;
 if(!data||data.ok!==true)throw new Error('Supabase no confirmó las cantidades de alícuotas.');
 sample.primaryAliquots=Number(primary);sample.backupAliquots=Number(backup);sample.updatedAt=new Date().toISOString();
 return data;
}
async function registerCryovial(sample,vial,box,position){
 requireReady(['admin','technician']);
 if(!sample?.cloudId||!box?.cloudId)throw new Error('La muestra o caja no está vinculada a Supabase.');
 const r=await client.rpc('register_clinical_cryovial',{p_workspace_id:workspaceId,p_sample_id:sample.cloudId,p_barcode:vial.barcode,p_kind:vial.kind,p_box_id:box.cloudId,p_position_no:Number(position)});
 if(r.error)fail(r.error);const data=Array.isArray(r.data)?r.data[0]:r.data;vial.cloudId=data.cryovial_id;return data;
}
async function moveCryovial(vial,box,position,notes){
 requireReady(['admin','technician']);
 if(!vial?.cloudId||!box?.cloudId)throw new Error('El criovial o caja definitiva no está vinculado a Supabase.');
 const r=await client.rpc('move_clinical_cryovial_to_definitive',{p_workspace_id:workspaceId,p_cryovial_id:vial.cloudId,p_box_id:box.cloudId,p_position_no:Number(position),p_notes:notes||null});
 if(r.error)fail(r.error);return Array.isArray(r.data)?r.data[0]:r.data;
}
async function syncStorageConfiguration(){
 requireReady(['admin']);
 if(syncPromise){try{await syncPromise}catch(_){}}
 await loadRemoteConfiguration();
 const s=app()||{},studies=s.clinicalStudies||[];
 await syncBoxes(studies);
 await loadRemoteBoxes();
 return true;
}
async function refreshSamples(){requireReady(['admin','clinician','technician','reception']);if(syncPromise){await syncPromise;return true}clinicalSyncCursor=null;await loadRemoteConfiguration();await loadRemoteSamples();lastClinicalFullVerificationAt=Date.now();lastClinicalConfigVerificationAt=Date.now();refreshClinicalViewSafely();scheduleClinicalPoll(20000);return true;}
window.FleboClinicalCloud={connect,getManagementPermissions,correctSample:trackClinicalMutation(correctSample),syncConfiguration,saveConfiguration:trackClinicalMutation(saveConfiguration),syncStorageConfiguration:trackClinicalMutation(syncStorageConfiguration),refreshSamples,registerSample:trackClinicalMutation(registerSample),deleteSample:trackClinicalMutation(deleteSample),transition:trackClinicalMutation(transition),saveAliquots:trackClinicalMutation(saveAliquots),registerCryovial:trackClinicalMutation(registerCryovial),moveCryovial:trackClinicalMutation(moveCryovial),get ready(){return ready},get workspaceId(){return workspaceId},get role(){return role}};
window.addEventListener('flebo:auth-changed',()=>{if(window.FleboAuth&&window.FleboAuth.user)connect().then(function(){if(ready)syncConfiguration().catch(function(e){console.error('[FleboReport Clinical Cloud]',e)})});else ready=false});
window.addEventListener('online',()=>{if(!ready)connect();else scheduleClinicalIncrementalRefresh()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&ready)scheduleClinicalIncrementalRefresh();scheduleClinicalPoll(30000)});
function boot(){connect().then(function(){if(ready)syncConfiguration().catch(function(e){console.error('[FleboReport Clinical Cloud]',e)})});scheduleClinicalPoll()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
})();