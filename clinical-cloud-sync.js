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
async function syncConfiguration(){
 requireReady(['admin','clinician','technician','reception']);
 const s=app()||{},studies=s.clinicalStudies||[],visits=s.clinicalVisits||[],types=s.clinicalSampleTypes||[];
 for(const study of studies){
  let sid='';
  if(['admin'].includes(role)) sid=await saveStudy(study);
  else{
   let q=await client.from('clinical_studies').select('id').eq('workspace_id',workspaceId).eq('protocol_code',study.protocol).maybeSingle();
   if(q.error)fail(q.error);if(!q.data)throw new Error('El estudio '+study.protocol+' aún no está publicado en la plantilla maestra de la nube. Solicita al administrador que lo sincronice.');
   sid=q.data.id;study.cloudId=sid;
  }
  const linkedVisits=visits.filter(v=>(study.visitIds||[]).includes(v.id));
  for(const visit of linkedVisits){
   if(['admin','clinician'].includes(role)) await saveVisit(study,sid,visit);
   else{const code=String(visit.code||visit.id||visit.name).trim(),q=await client.from('clinical_visits').select('id').eq('workspace_id',workspaceId).eq('study_id',sid).eq('code',code).maybeSingle();if(q.error)fail(q.error);if(!q.data)throw new Error('La visita '+visit.name+' no está configurada en la nube.');visit.cloudId=q.data.id}
  }
  const linkedTypes=types.filter(t=>(study.sampleTypeIds||[]).includes(t.id));
  for(const type of linkedTypes){
   if(['admin','clinician'].includes(role)) await saveSampleType(study,sid,type);
   else{const code=String(type.code||type.id||type.name).trim(),q=await client.from('clinical_sample_types').select('id').eq('workspace_id',workspaceId).eq('study_id',sid).eq('code',code).maybeSingle();if(q.error)fail(q.error);if(!q.data)throw new Error('El tipo de muestra '+type.name+' no está configurado en la nube.');type.cloudId=q.data.id}
  }
 }
 await syncBoxes(studies);
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
 if(next==='ALMACENAMIENTO_TEMPORAL'){sample.primaryAliquots=Number(args.primaryAliquots);sample.backupAliquots=Number(args.backupAliquots);sample.temporaryBoxId=args.temporaryBoxId}
 if(next==='CONGELADOR_DEFINITIVO')sample.definitiveBoxId=args.definitiveBoxId;
 return data;
}
window.FleboClinicalCloud={connect,syncConfiguration,registerSample,transition,get ready(){return ready},get workspaceId(){return workspaceId},get role(){return role}};
window.addEventListener('flebo:auth-changed',()=>{if(window.FleboAuth&&window.FleboAuth.user)connect();else ready=false});
window.addEventListener('online',()=>{if(!ready)connect()});
function boot(){connect()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
})();