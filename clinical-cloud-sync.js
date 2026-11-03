(function(){
'use strict';
let client=null,workspaceId=null,userId=null,role=null,ready=false,busy=false;
const app=()=>window.FleboAppState&&window.FleboAppState.get?window.FleboAppState.get():null;
const uid=()=>window.crypto&&crypto.randomUUID?crypto.randomUUID():('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16)}));
const fail=e=>{throw new Error(e&&e.message?e.message:String(e||'Error de sincronización clínica'))};
async function connect(){
 try{
  if(!window.FleboAuth)return;
  client=await window.FleboAuth.init();
  const auth=window.FleboAuth,m=auth.membership;
  if(!auth.user||!m||m.active!==true||!m.workspace_id){ready=false;return}
  userId=auth.user.id;workspaceId=m.workspace_id;role=m.role;
  ready=['admin','clinician','technician','reception'].includes(role);
 }catch(e){ready=false;console.error('[FleboReport Clinical Cloud]',e)}
}
function requireReady(roles){
 if(!ready||!client||!workspaceId)throw new Error('La conexión clínica con Supabase no está lista. Inicia sesión y vuelve a intentarlo.');
 if(roles&&roles.indexOf(role)<0)throw new Error('Tu rol no tiene permiso para esta operación clínica.');
}
async function saveStudy(study){
 let q=client.from('clinical_studies').select('id').eq('workspace_id',workspaceId).eq('protocol_code',study.protocol).maybeSingle();
 let r=await q;if(r.error)fail(r.error);
 const payload={workspace_id:workspaceId,protocol_code:study.protocol,name:study.name,client_name:study.clientName||null,sponsor:study.sponsor||null,cro:study.cro||null,principal_investigator:study.investigator||null,status:study.status||'Activo',starts_on:study.startDate||null,ends_on:study.endDate||null,notes:study.notes||null};
 let row=r.data;
 if(row){const u=await client.from('clinical_studies').update(payload).eq('id',row.id).select('id').single();if(u.error)fail(u.error);row=u.data}
 else{const i=await client.from('clinical_studies').insert(payload).select('id').single();if(i.error)fail(i.error);row=i.data}
 study.cloudId=row.id;return row.id;
}
async function saveVisit(study,studyCloudId,visit){
 const code=String(visit.code||visit.id||visit.name).trim();
 let r=await client.from('clinical_visits').select('id').eq('workspace_id',workspaceId).eq('study_id',studyCloudId).eq('code',code).maybeSingle();
 if(r.error)fail(r.error);
 const spec=study.visitSpecs&&study.visitSpecs[visit.id]||{};
 const payload={workspace_id:workspaceId,study_id:studyCloudId,code,name:visit.name,sort_order:Number(visit.order||visit.sortOrder||0),scheduled_day:spec.dayScheduled!=null?Number(spec.dayScheduled):(visit.dayScheduled!=null?Number(visit.dayScheduled):null),active:visit.active!==false};
 let row=r.data;
 if(row){const u=await client.from('clinical_visits').update(payload).eq('id',row.id).select('id').single();if(u.error)fail(u.error);row=u.data}
 else{const i=await client.from('clinical_visits').insert(payload).select('id').single();if(i.error)fail(i.error);row=i.data}
 visit.cloudId=row.id;return row.id;
}
async function saveSampleType(study,studyCloudId,type){
 const code=String(type.code||type.id||type.name).trim();
 let r=await client.from('clinical_sample_types').select('id').eq('workspace_id',workspaceId).eq('study_id',studyCloudId).eq('code',code).maybeSingle();
 if(r.error)fail(r.error);
 const spec=study.sampleSpecs&&study.sampleSpecs[type.id]||{};
 const merged=Object.assign({},type,spec);
 const payload={workspace_id:workspaceId,study_id:studyCloudId,code,name:type.name,tube:merged.tube||null,volume:merged.volume||null,processing_protocol:merged.processingRequired||merged.processing_protocol||null,color:merged.color||null,description:merged.description||null,active:type.active!==false};
 let row=r.data;
 if(row){const u=await client.from('clinical_sample_types').update(payload).eq('id',row.id).select('id').single();if(u.error)fail(u.error);row=u.data}
 else{const i=await client.from('clinical_sample_types').insert(payload).select('id').single();if(i.error)fail(i.error);row=i.data}
 type.cloudId=row.id;return row.id;
}
async function syncBoxes(studies){
 const stateNow=app()||{},boxes=stateNow.clinicalLocations||[],localStudies=studies||stateNow.clinicalStudies||[];
 if(role==='admin'){
  const freezerMap=new Map(),drawerMap=new Map(),rackMap=new Map(),trayMap=new Map();
  let q=await client.from('clinical_freezers').select('id,name').eq('workspace_id',workspaceId);if(q.error)fail(q.error);
  const freezerRows=q.data||[];
  for(const f of (stateNow.clinicalFreezers||[])){
   let row=freezerRows.find(x=>x.name.toLowerCase()===String(f.name||'').toLowerCase());
   if(!row){const ins=await client.from('clinical_freezers').insert({workspace_id:workspaceId,name:f.name,active:true}).select('id,name').single();if(ins.error)fail(ins.error);row=ins.data;freezerRows.push(row)}
   f.cloudId=row.id;freezerMap.set(f.id,row.id);
   let drawers=await client.from('clinical_freezer_drawers').select('id,drawer_no').eq('workspace_id',workspaceId).eq('freezer_id',row.id);if(drawers.error)fail(drawers.error);
   for(const d of (f.drawers||[])){
    const dn=Number((String(d.name||'').match(/\d+/)||[])[0])||Number(d.drawerNo)||0;
    if(dn<1||dn>4)continue;
    let dr=(drawers.data||[]).find(x=>Number(x.drawer_no)===dn);
    if(!dr){const ins=await client.from('clinical_freezer_drawers').insert({workspace_id:workspaceId,freezer_id:row.id,drawer_no:dn,name:d.name}).select('id,drawer_no').single();if(ins.error)fail(ins.error);dr=ins.data}
    d.cloudId=dr.id;drawerMap.set(d.id,dr.id);
   }
  }
  for(const rack of (stateNow.clinicalRacks||[])){
   const freezer=(stateNow.clinicalFreezers||[]).find(x=>x.id===rack.freezerId),drawer=(freezer?.drawers||[]).find(x=>x.id===rack.drawerId||x.name===rack.drawer);
   const drawerCloud=drawer&&drawerMap.get(drawer.id);if(!drawerCloud)continue;
   let rr=await client.from('clinical_racks').select('id').eq('workspace_id',workspaceId).eq('drawer_id',drawerCloud).eq('name',rack.name).maybeSingle();if(rr.error)fail(rr.error);
   let row=rr.data;if(!row){const ins=await client.from('clinical_racks').insert({workspace_id:workspaceId,drawer_id:drawerCloud,name:rack.name}).select('id').single();if(ins.error)fail(ins.error);row=ins.data}
   rack.cloudId=row.id;rackMap.set(rack.id,row.id);
   for(let n=1;n<=5;n++){
    let tr=await client.from('clinical_rack_trays').select('id').eq('workspace_id',workspaceId).eq('rack_id',row.id).eq('tray_no',n).maybeSingle();if(tr.error)fail(tr.error);
    let trow=tr.data;if(!trow){const ins=await client.from('clinical_rack_trays').insert({workspace_id:workspaceId,rack_id:row.id,tray_no:n,name:'Bandeja '+n}).select('id').single();if(ins.error)fail(ins.error);trow=ins.data}
    trayMap.set(rack.id+'|'+n,trow.id);
   }
  }
  for(const box of boxes){
   const study=localStudies.find(x=>x.id===box.studyId),rack=(stateNow.clinicalRacks||[]).find(x=>x.id===box.rackId);
   const trayNo=Number((String(box.tray||'').match(/\d+/)||[])[0])||Number(box.trayNo)||0;
   const slotNo=Number((String(box.position||'').match(/\d+/)||[])[0])||Number(box.positionNo)||0;
   const trayId=rack&&trayMap.get(rack.id+'|'+trayNo);
   if(!study?.cloudId||!trayId||slotNo<1||slotNo>4||!box.box)continue;
   const payload={workspace_id:workspaceId,tray_id:trayId,slot_no:slotNo,box_code:box.box,storage_stage:box.storageStage,aliquot_capacity:Number(box.aliquotCapacity)||1,active:true,study_id:study.cloudId,box_type:box.storageStage==='temporal'?'caja_temporal':'caja_definitiva',created_by:userId,updated_at:new Date().toISOString()};
   let found=await client.from('clinical_boxes').select('id').eq('workspace_id',workspaceId).eq('box_code',box.box).maybeSingle();if(found.error)fail(found.error);
   let row=found.data;
   if(row){const u=await client.from('clinical_boxes').update(payload).eq('id',row.id).select('id').single();if(u.error)fail(u.error);row=u.data}
   else{const ins=await client.from('clinical_boxes').insert(payload).select('id').single();if(ins.error)fail(ins.error);row=ins.data}
   box.cloudId=row.id;
  }
 }else{
  const ids=localStudies.map(x=>x.cloudId).filter(Boolean);
  if(ids.length){
   const q=await client.from('clinical_boxes').select('id,study_id,box_code,storage_stage,aliquot_capacity,active').eq('workspace_id',workspaceId).in('study_id',ids).eq('active',true);
   if(q.error)fail(q.error);
   for(const box of boxes){const study=localStudies.find(x=>x.id===box.studyId),row=(q.data||[]).find(x=>x.study_id===study?.cloudId&&x.box_code===box.box&&x.storage_stage===box.storageStage);if(row)box.cloudId=row.id}
  }
 }
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
  const item=Object.assign({},old,{id:old.id||'cloud-t-'+row.id,cloudId:row.id,studyId:study.id,code:row.code||'',name:row.name,tube:row.tube||'',volume:row.volume||'',processingRequired:row.processing_protocol||'',color:row.color||'',description:row.description||'',active:row.active});
  study.sampleTypeIds.push(item.id);return item;
 }).filter(Boolean);
 const mergedStudies=studies.concat(oldStudies.filter(x=>!studies.some(y=>String(y.protocol||'').toLowerCase()===String(x.protocol||'').toLowerCase()))),mergedVisits=visits.concat(oldVisits.filter(x=>!visits.some(y=>y.studyId===x.studyId&&((x.code&&y.code===x.code)||y.name===x.name)))),mergedTypes=types.concat(oldTypes.filter(x=>!types.some(y=>y.studyId===x.studyId&&((x.code&&y.code===x.code)||y.name===x.name))));window.FleboAppState.replace(Object.assign({},stateNow,{clinicalStudies:mergedStudies,clinicalVisits:mergedVisits,clinicalSampleTypes:mergedTypes}),{silent:true});
}
async function loadRemoteBoxes(){
 const stateNow=app()||{};
 const [fr,dr,rr,tr,br]=await Promise.all([
  client.from('clinical_freezers').select('*').eq('workspace_id',workspaceId),
  client.from('clinical_freezer_drawers').select('*').eq('workspace_id',workspaceId),
  client.from('clinical_racks').select('*').eq('workspace_id',workspaceId),
  client.from('clinical_rack_trays').select('*').eq('workspace_id',workspaceId),
  client.from('clinical_boxes').select('*').eq('workspace_id',workspaceId).eq('active',true)
 ]);
 for(const q of [fr,dr,rr,tr,br])if(q.error)fail(q.error);
 const freezerRows=fr.data||[],drawerRows=dr.data||[],rackRows=rr.data||[],trayRows=tr.data||[],boxRows=br.data||[];
 const freezers=freezerRows.map(f=>Object.assign({},(stateNow.clinicalFreezers||[]).find(x=>x.cloudId===f.id)||{},{id:f.id,cloudId:f.id,name:f.name,drawers:drawerRows.filter(d=>d.freezer_id===f.id).map(d=>({id:d.id,cloudId:d.id,name:d.name||('Gaveta '+d.drawer_no),drawerNo:d.drawer_no}))}));
 const racks=rackRows.map(r=>{
  const d=drawerRows.find(x=>x.id===r.drawer_id),f=d&&freezerRows.find(x=>x.id===d.freezer_id);
  return{id:r.id,cloudId:r.id,freezerId:f&&f.id,freezer:f&&f.name,drawerId:d&&d.id,drawer:d&&(d.name||('Gaveta '+d.drawer_no)),name:r.name,trays:trayRows.filter(t=>t.rack_id===r.id).map(t=>'Bandeja '+t.tray_no)};
 });
 const studyMap=new Map((stateNow.clinicalStudies||[]).map(x=>[x.cloudId,x.id]));
 const locations=boxRows.map(b=>{
  const tray=trayRows.find(x=>x.id===b.tray_id),rack=tray&&rackRows.find(x=>x.id===tray.rack_id),drawer=rack&&drawerRows.find(x=>x.id===rack.drawer_id),freezer=drawer&&freezerRows.find(x=>x.id===drawer.freezer_id);
  return{id:b.id,cloudId:b.id,freezerId:freezer&&freezer.id,freezer:freezer&&freezer.name,drawerId:drawer&&drawer.id,drawer:drawer&&(drawer.name||('Gaveta '+drawer.drawer_no)),rackId:rack&&rack.id,rack:rack&&rack.name,tray:'Bandeja '+(tray&&tray.tray_no),trayNo:tray&&tray.tray_no,box:b.box_code,position:'Posición '+b.slot_no,positionNo:b.slot_no,storageStage:b.storage_stage,aliquotCapacity:b.aliquot_capacity,studyId:studyMap.get(b.study_id)||'',studyCloudId:b.study_id};
 });
 const live=app()||stateNow,oldFreezers=live.clinicalFreezers||[],oldRacks=live.clinicalRacks||[],oldBoxes=live.clinicalLocations||[],mergedFreezers=freezers.concat(oldFreezers.filter(x=>!freezers.some(y=>String(y.name||'').toLowerCase()===String(x.name||'').toLowerCase()))),mergedRacks=racks.concat(oldRacks.filter(x=>!racks.some(y=>y.name===x.name&&y.drawer===x.drawer&&y.freezer===x.freezer))),mergedBoxes=locations.concat(oldBoxes.filter(x=>!locations.some(y=>y.box===x.box&&y.studyId===x.studyId&&y.storageStage===x.storageStage)));window.FleboAppState.replace(Object.assign({},live,{clinicalFreezers:mergedFreezers,clinicalRacks:mergedRacks,clinicalLocations:mergedBoxes}),{silent:true});
}
async function loadRemoteSamples(){
 const stateNow=app()||{},oldSamples=stateNow.clinicalSamples||[];
 const r=await client.from('clinical_samples').select('id,legacy_id,study_id,patient_id,subject_code,visit_id,sample_type_id,collection_at,received_at,received_by,container_count,status,primary_aliquots,backup_aliquots,processed_by,processed_at,notes,created_by,created_at,updated_at,workflow_status,tube_barcode,reviewed_by,reviewed_at,processing_started_by,processing_started_at,temporary_box_id,definitive_box_id,stored_by,stored_at').eq('workspace_id',workspaceId).order('received_at',{ascending:false}).limit(5000);
 if(r.error)fail(r.error);
 const [containers,events,profiles,cryoRows,cryoEvents]=await Promise.all([
  client.from('clinical_sample_containers').select('sample_id,barcode').eq('workspace_id',workspaceId),
  client.from('clinical_sample_events').select('sample_id,previous_status,next_status,notes,actor_id,occurred_at').eq('workspace_id',workspaceId).order('occurred_at',{ascending:false}).limit(10000),
  client.from('profiles').select('user_id,display_name'),
  client.from('clinical_cryovials').select('id,sample_id,barcode,kind,status,box_id,position_no,created_by,created_at,updated_at').eq('workspace_id',workspaceId),
  client.from('clinical_cryovial_events').select('id,cryovial_id,action,from_box_id,from_position,to_box_id,to_position,actor_id,notes,occurred_at').eq('workspace_id',workspaceId).order('occurred_at',{ascending:false}).limit(20000)
 ]);
 if(containers.error)fail(containers.error);if(events.error)fail(events.error);if(profiles.error)fail(profiles.error);if(cryoRows.error)fail(cryoRows.error);if(cryoEvents.error)fail(cryoEvents.error);
 const profileMap=new Map((profiles.data||[]).map(x=>[x.user_id,x.display_name]));
 const studyMap=new Map((stateNow.clinicalStudies||[]).map(x=>[x.cloudId,x]));
 const visitMap=new Map((stateNow.clinicalVisits||[]).map(x=>[x.cloudId,x]));
 const typeMap=new Map((stateNow.clinicalSampleTypes||[]).map(x=>[x.cloudId,x]));
 const patientMap=new Map((stateNow.patients||[]).filter(x=>x.cloudPatientId).map(x=>[x.cloudPatientId,x]));
 const next=(r.data||[]).map(row=>{
  const old=oldSamples.find(x=>x.cloudId===row.id||x.id===row.legacy_id)||{};
  const study=studyMap.get(row.study_id),visit=visitMap.get(row.visit_id),type=typeMap.get(row.sample_type_id),patient=patientMap.get(row.patient_id);
  const d=new Date(row.collection_at),rd=new Date(row.received_at);
  const bars=(containers.data||[]).filter(x=>x.sample_id===row.id).map(x=>x.barcode);
  return Object.assign({},old,{id:row.legacy_id||old.id||'cloud-sm-'+row.id,cloudId:row.id,patientId:patient?patient.id:row.patient_id,studyId:study?study.id:old.studyId,subjectCode:row.subject_code,visitId:visit?visit.id:old.visitId,visit:visit?visit.name:old.visit,sampleTypeId:type?type.id:old.sampleTypeId,sampleType:type?type.name:old.sampleType,collectionDate:Number.isNaN(d.getTime())?'':d.toISOString().slice(0,10),collectionTime:Number.isNaN(d.getTime())?'':d.toISOString().slice(11,16),collectedAt:row.collection_at,date:Number.isNaN(rd.getTime())?'':rd.toISOString().slice(0,10),time:Number.isNaN(rd.getTime())?'':rd.toISOString().slice(11,16),receivedAt:row.received_at,tubes:row.container_count,tubeBarcodes:bars.length?bars:(row.tube_barcode?[row.tube_barcode]:[]),status:row.status,workflowStatus:row.workflow_status,primaryAliquots:row.primary_aliquots,backupAliquots:row.backup_aliquots,processedAt:row.processed_at,processedBy:profileMap.get(row.processed_by)||row.processed_by||'',receivedBy:profileMap.get(row.received_by)||row.received_by||'',notes:row.notes||'',temporaryBoxId:row.temporary_box_id,temporaryBoxCloudId:row.temporary_box_id,definitiveBoxId:row.definitive_box_id,definitiveBoxCloudId:row.definitive_box_id,reviewedAt:row.reviewed_at,processingStartedAt:row.processing_started_at,storedAt:row.stored_at,createdAt:row.created_at,updatedAt:row.updated_at});
 });
 const ids=new Set(next.map(x=>x.id)),merged=next.concat(oldSamples.filter(x=>!x.cloudId&&!ids.has(x.id)));
 const history=(events.data||[]).map(e=>{
  const sample=(r.data||[]).find(x=>x.id===e.sample_id);return{id:'db-'+e.sample_id+'-'+e.occurred_at,sampleId:sample?(sample.legacy_id||'cloud-sm-'+sample.id):'cloud-sm-'+e.sample_id,previousStatus:e.previous_status||'',newStatus:e.next_status,timestamp:e.occurred_at,operator:profileMap.get(e.actor_id)||e.actor_id||'Sistema',note:e.notes||''};
 });
 const oldVials=stateNow.clinicalCryovials||[],vials=(cryoRows.data||[]).map(v=>{
  const sample=(r.data||[]).find(x=>x.id===v.sample_id),old=oldVials.find(x=>x.cloudId===v.id||x.barcode===v.barcode)||{};
  const ev=(cryoEvents.data||[]).filter(e=>e.cryovial_id===v.id).map(e=>({id:e.id,cryoId:v.id,sampleId:sample?(sample.legacy_id||'cloud-sm-'+sample.id):'cloud-sm-'+v.sample_id,barcode:v.barcode,action:e.action,fromBoxId:e.from_box_id||'',fromPosition:e.from_position||'',toBoxId:e.to_box_id||'',toPosition:e.to_position||'',timestamp:e.occurred_at,operator:profileMap.get(e.actor_id)||e.actor_id||'Sistema',note:e.notes||''}));
  return Object.assign({},old,{id:old.id||'cloud-cv-'+v.id,cloudId:v.id,barcode:v.barcode,sampleId:sample?(sample.legacy_id||'cloud-sm-'+sample.id):old.sampleId,kind:v.kind,status:v.status,temporaryBoxId:v.status==='Almacenamiento temporal'?v.box_id:'',temporaryPosition:v.status==='Almacenamiento temporal'?v.position_no:null,definitiveBoxId:v.status==='Almacenamiento definitivo'?v.box_id:'',definitivePosition:v.status==='Almacenamiento definitivo'?v.position_no:null,events:ev,createdAt:v.created_at,updatedAt:v.updated_at});
 });
 const vialIds=new Set(vials.map(x=>x.id)),mergedVials=vials.concat(oldVials.filter(x=>!x.cloudId&&!vialIds.has(x.id)));
 const cryoHistory=(cryoEvents.data||[]).map(e=>({id:e.id,cryoId:e.cryovial_id,action:e.action,fromBoxId:e.from_box_id||'',fromPosition:e.from_position||'',toBoxId:e.to_box_id||'',toPosition:e.to_position||'',timestamp:e.occurred_at,operator:profileMap.get(e.actor_id)||e.actor_id||'Sistema',note:e.notes||''}));
 window.FleboAppState.replace(Object.assign({},app()||stateNow,{clinicalSamples:merged,clinicalSampleHistory:history,clinicalCryovials:mergedVials,clinicalCryovialHistory:cryoHistory}),{silent:true});
}
async function syncConfiguration(){
 requireReady(['admin','clinician','technician','reception']);
 const stateNow=app()||{},studies=stateNow.clinicalStudies||[],visits=stateNow.clinicalVisits||[],types=stateNow.clinicalSampleTypes||[];
 if(role==='admin'){
  for(const study of studies){
   const sid=await saveStudy(study);
   const linkedVisits=visits.filter(v=>(study.visitIds||[]).includes(v.id));
   for(const visit of linkedVisits)await saveVisit(study,sid,visit);
   const linkedTypes=types.filter(t=>(study.sampleTypeIds||[]).includes(t.id));
   for(const type of linkedTypes)await saveSampleType(study,sid,type);
  }
  await syncBoxes(studies);
 }
 await loadRemoteConfiguration();
 await loadRemoteBoxes();
 await loadRemoteSamples();
 if(window.FleboAppState&&window.FleboAppState.save)window.FleboAppState.save();
 return true;
}
async function registerSample(sample){
 requireReady(['admin','clinician','reception']);
 if(!sample)throw new Error('No se recibió la muestra.');
 if(window.FleboPatientCloud&&window.FleboPatientCloud.syncNow)await window.FleboPatientCloud.syncNow();
 await syncConfiguration();
 const s=app()||{},study=(s.clinicalStudies||[]).find(x=>x.id===sample.studyId),visit=(s.clinicalVisits||[]).find(x=>x.id===sample.visitId),type=(s.clinicalSampleTypes||[]).find(x=>x.id===sample.sampleTypeId),patient=(s.patients||[]).find(x=>x.id===sample.patientId);
 if(!study||!study.cloudId||!visit||!visit.cloudId||!type||!type.cloudId)throw new Error('El estudio, la visita o el tipo de muestra no se pudo vincular a su registro maestro en la nube.');
 if(!patient||!patient.cloudPatientId)throw new Error('El paciente aún no tiene registro confirmado en el maestro de pacientes de la nube. Sincroniza el paciente y vuelve a intentarlo.');
 const barcodes=Array.isArray(sample.tubeBarcodes)?sample.tubeBarcodes.map(x=>String(x||'').trim()).filter(Boolean):[];
 if(barcodes.length!==Number(sample.tubes))throw new Error('Debes indicar un código de barras único por cada tubo o recipiente.');
 const result=await client.rpc('register_clinical_sample',{
  p_workspace_id:workspaceId,p_legacy_id:String(sample.id),p_study_id:study.cloudId,
  p_patient_id:patient.cloudPatientId,p_subject_code:sample.subjectCode,p_visit_id:visit.cloudId,
  p_sample_type_id:type.cloudId,p_collection_at:sample.collectedAt,p_received_at:sample.receivedAt,
  p_container_count:Number(sample.tubes),p_tube_barcodes:barcodes,p_notes:sample.notes||null
 });
 if(result.error)fail(result.error);
 const data=Array.isArray(result.data)?result.data[0]:result.data;
 sample.cloudId=data.sample_id;sample.patientCloudId=patient.cloudPatientId;sample.workflowStatus=data.workflow_status||'REGISTRADO';
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
 sample.workflowStatus=next;
 const legacy={EN_REVISION:'En revisión',PENDIENTE_PROCESO:'Pendiente de procesamiento',PROCESANDO:'Pendiente de procesamiento',ALMACENAMIENTO_TEMPORAL:'Procesada',CONGELADOR_DEFINITIVO:'Almacenada'};
 sample.status=legacy[next]||sample.status;
 sample.updatedAt=new Date().toISOString();
 if(next==='EN_REVISION'){sample.reviewedAt=sample.updatedAt}
 if(next==='PROCESANDO'){sample.processingStartedAt=sample.updatedAt}
 if(next==='ALMACENAMIENTO_TEMPORAL'){sample.primaryAliquots=Number(args.primaryAliquots);sample.backupAliquots=Number(args.backupAliquots);sample.temporaryBoxId=args.temporaryBoxId;sample.processedAt=sample.updatedAt}
 if(next==='CONGELADOR_DEFINITIVO'){sample.definitiveBoxId=args.definitiveBoxId;sample.storedAt=sample.updatedAt}
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
window.FleboClinicalCloud={connect,syncConfiguration,registerSample,transition,registerCryovial,moveCryovial,get ready(){return ready},get workspaceId(){return workspaceId},get role(){return role}};
window.addEventListener('flebo:auth-changed',()=>{if(window.FleboAuth&&window.FleboAuth.user)connect().then(function(){if(ready)syncConfiguration().catch(function(e){console.error('[FleboReport Clinical Cloud]',e)})});else ready=false});
window.addEventListener('online',()=>{if(!ready)connect()});
function boot(){connect().then(function(){if(ready)syncConfiguration().catch(function(e){console.error('[FleboReport Clinical Cloud]',e)})})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
})();