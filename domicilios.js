(function(){
'use strict';
const KEY='fleboreport.homeVisits.v1', $=id=>document.getElementById(id);
let activeTab='agenda',detailOpen=false,visits=[],selected='',dismissedInvitationId='',calendarMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1),calendarSelectedDate='',newTestSelection=[],moreTestSelection=[],selectedProfessional=null,professionalSearchTimer=null,professionalSearchSeq=0,remoteCatalog=[],catalogLoading=false,createBusy=false,serviceSearchTimer=null,serviceSearchSeq=0,additionalFormOpenFor='';
const cloud={client:null,user:null,workspaceId:null,role:null,ready:false,loading:false,channel:null};
const persistedEventIds=new Set();
let homeVisitSyncCursor=null,homeVisitCacheActive=false;
let pushRegistrationPromise=null;
const statusToDb={'Pendiente de asignación':'pending_assignment','Pendiente de aceptación':'pending_acceptance','Aceptado':'accepted','En camino':'en_route','En domicilio':'at_home','Muestras tomadas':'samples_taken','Finalizado':'completed','Rechazado':'rejected','Cancelado':'cancelled','Reprogramado':'rescheduled','No realizado':'not_performed','Paciente ausente':'patient_absent','Paciente rechazó la toma':'patient_refused'};
const statusFromDb=Object.fromEntries(Object.entries(statusToDb).map(([a,b])=>[b,a]));
const testToDb={'Pendiente':'pending','Tomada':'collected','No tomada':'not_collected'};
const testFromDb=Object.fromEntries(Object.entries(testToDb).map(([a,b])=>[b,a]));
const makeId=()=>crypto.randomUUID();
async function fetchAllPages(query,pageSize=500){const rows=[];for(let from=0;;from+=pageSize){const result=await query.range(from,from+pageSize-1);if(result.error)throw result.error;const page=result.data||[];rows.push(...page);if(page.length<pageSize)break;}return rows;}
const priorityLabel=value=>({urgent:'Urgente',high:'Prioritario',normal:'Normal'}[value]||'Normal');
const priorityRank=value=>({urgent:0,high:1,normal:2}[value]??2);
const priorityDb=value=>value==='priority'?'high':(['urgent','high','normal'].includes(value)?value:'normal');
const asUuid=value=>{const v=String(value||'').trim();return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)?v:null};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const say=m=>window.toast?window.toast(m):alert(m),today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Panama',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());calendarSelectedDate=today();
const appState=()=>{try{return typeof state!=='undefined'?state:(window.state||{})}catch(e){return window.state||{}}};
const localCatalog=()=>Array.isArray(appState().catalog)?appState().catalog:[];
const catalog=()=>remoteCatalog;
const people=()=>Array.isArray(appState().patients)?appState().patients:[];
const actor=()=>window.state&&state.auditOperator||'Usuario local';
function cloudNotice(message,error){const n=$('hvConnectionNotice');if(!n)return;n.textContent=message;n.style.display='block';n.style.background=error?'#fff1f0':'#eef6ff';n.style.borderColor=error?'#f2c6c2':'#cfe0f2';n.style.color=error?'#9b2c22':'#24547a'}
function b64urlToBytes(s){const p="=".repeat((4-s.length%4)%4),b=atob((s+p).replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from(b,x=>x.charCodeAt(0))}
async function syncPushActivationUI(){
 const button=$('hvActivatePush'),status=$('hvPushStatus');
 if(!button||!status)return;
 if(!('Notification'in window)||!('serviceWorker'in navigator)||!('PushManager'in window)){
  button.disabled=false;button.textContent='Activar notificaciones';button.classList.add('primary');
  status.textContent='Este navegador no admite notificaciones Push en este contexto.';
  return;
 }
 if(Notification.permission!=='granted'){
  button.disabled=false;button.textContent='Activar notificaciones';button.classList.add('primary');
  status.textContent=Notification.permission==='denied'?'El permiso está bloqueado en el navegador. Habilita las notificaciones del sitio para poder recibir avisos.':'Concede el permiso de notificaciones para registrar este dispositivo.';
  return;
 }
 try{
  const reg=await navigator.serviceWorker.ready;
  const sub=await reg.pushManager.getSubscription();
  if(!sub){
   button.disabled=false;button.textContent='Completar activación';button.classList.add('primary');
   status.textContent='El permiso está concedido, pero este navegador todavía no tiene una suscripción Push.';
   return;
  }
  const server=await invokeDomicileNotifications({action:'subscription-status',endpoint:sub.endpoint});
  if(server?.active){
   button.disabled=true;button.textContent='Notificaciones activadas';button.classList.remove('primary');
   status.textContent='Este navegador tiene una suscripción activa en el servidor.';
  }else{
   button.disabled=false;button.textContent='Reactivar notificaciones';button.classList.add('primary');
   status.textContent='El navegador conserva una suscripción, pero el servidor la marcó inactiva. Pulsa Reactivar notificaciones para renovarla.';
  }
 }catch(e){
  button.disabled=false;button.textContent='Verificar activación';button.classList.add('primary');
  status.textContent='No se pudo verificar la suscripción con el servidor. Puedes reintentar la activación.';
 }
}
window.hvRefreshPushStatus=syncPushActivationUI;
async function registerPushIfPermitted(){
 if(pushRegistrationPromise)return pushRegistrationPromise;
 pushRegistrationPromise=(async()=>{
  window.hvPushLastError="";
  try{
   if(!cloud.ready||!cloud.client)throw new Error("La sesión con Supabase no está lista.");
   if(!("serviceWorker"in navigator)||!("PushManager"in window)||!window.isSecureContext||!("Notification"in window))throw new Error("El navegador no admite Push en este contexto.");
   if(Notification.permission!=="granted")throw new Error("El permiso de notificaciones no está concedido.");
   const reg=await navigator.serviceWorker.ready;
   const data=await invokeDomicileNotifications({action:"vapid-public"});
   if(!data?.configured||!data.publicKey){const d=data?.diagnostic||{};const details=(d.missing||[]).join(" ");throw new Error("Configuración VAPID incompleta. Pública: "+(d.publicKeyPresent?"detectada ("+d.publicKeyLength+" caracteres)":"no detectada")+". Privada: "+(d.privateKeyPresent?"detectada ("+d.privateKeyLength+" caracteres)":"no detectada")+". "+details+" Revisa los nombres y valores de los secretos en Supabase.");}
   let sub=await reg.pushManager.getSubscription();
   if(sub){
    const server=await invokeDomicileNotifications({action:"subscription-status",endpoint:sub.endpoint});
    if(!server?.active){
     await sub.unsubscribe().catch(()=>false);
     sub=null;
    }
   }
   if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64urlToBytes(data.publicKey)});
   const saved=await invokeDomicileNotifications({action:"subscribe",subscription:sub.toJSON(),user_agent:navigator.userAgent});
   if(!saved.ok)throw new Error(saved.error||"El servidor no confirmó la suscripción.");
   await syncPushActivationUI();
   return true;
  }catch(e){window.hvPushLastError=e?.message||String(e);console.warn("Registro de Push:",window.hvPushLastError);return false;}
 })();
 try{return await pushRegistrationPromise}
 finally{pushRegistrationPromise=null}
}
async function invokeDomicileNotifications(body){
 if(!cloud.client)throw new Error('La conexión con Supabase no está disponible.');
 const current=await cloud.client.auth.getSession();
 if(current.error)throw current.error;
 let session=current.data?.session;
 if(!session?.access_token)throw new Error('La sesión expiró. Vuelve a iniciar sesión para emitir notificaciones.');
 const call=token=>cloud.client.functions.invoke('domicilios-notifications',{body,headers:{Authorization:'Bearer '+token}});
 let result=await call(session.access_token);
 const status=Number(result.error?.context?.status||result.error?.status||0);
 if(result.error&&(status===401||/401|unauthorized/i.test(result.error.message||''))){
  const refreshed=await cloud.client.auth.refreshSession();
  if(refreshed.error||!refreshed.data?.session?.access_token)throw new Error('La sesión expiró y no pudo renovarse. Vuelve a iniciar sesión.');
  session=refreshed.data.session;
  result=await call(session.access_token);
 }
 if(result.error)throw new Error(result.error.message||'No se pudo completar la notificación.');
 if(result.data?.error)throw new Error(result.data.error);
 return result.data||{};
}
function decodeMeta(value){try{const x=JSON.parse(value||'{}');return x&&x.flebo_meta===true?x:{}}catch(_){return{}}}
function dbVisit(row){
 const meta=decodeMeta(row.notes),assignment=(row.home_visit_assignments||[]).slice().sort((a,b)=>new Date(b.assigned_at||0)-new Date(a.assigned_at||0))[0]||{},professional=assignment.professionals||{},tests=(row.home_visit_tests||[]).map(t=>{const z=t.catalog_snapshot||{};return{id:t.id,testId:t.service_id||'',serviceId:t.service_id||null,quantity:t.quantity||1,addedById:t.added_by||null,addedAt:t.added_at||null,catalogSnapshot:t.catalog_snapshot||{},name:t.test_name,sample:z.sample||'',vessel:t.vessel||z.vessel||'',colorName:z.colorName||'',fasting:z.fasting||'',conditions:z.conditions||'',instructions:z.instructions||'',volume:z.volume||'',method:z.method||'',color:z.color||'',shape:z.shape||'tube',status:testFromDb[t.status]||'Pendiente',source:t.source==='additional'?'adicional':'original',notes:t.notes||'',addedBy:'Equipo'}}),dt=new Date(row.scheduled_at);
 const fmt=opts=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Panama',...opts}).format(dt);
 return{id:row.id,patientId:row.patient_id||null,latitude:row.latitude,longitude:row.longitude,priority:row.priority||'normal',createdById:row.created_by||null,createdAtDb:row.created_at||null,completedAt:row.completed_at||null,patientName:meta.patientName||'Paciente',document:meta.document||'',phone:row.patient_phone||'',address:row.address,scheduledDate:fmt({year:'numeric',month:'2-digit',day:'2-digit'}),scheduledTime:fmt({hour:'2-digit',minute:'2-digit',hour12:false}),assignedTo:meta.assignedTo||professional.name||'',assignedPhone:meta.assignedPhone||'',status:(assignment.status==='accepted'&&row.status==='pending_acceptance'?'Aceptado':assignment.status==='rejected'&&row.status==='pending_acceptance'?'Rechazado':statusFromDb[row.status]||'Pendiente de asignación'),reason:row.cancellation_reason||'',tests,documents:(row.home_visit_documents||[]),additionalPatients:(row.home_visit_additional_patients||[]),events:(row.home_visit_events||[]).map(e=>({id:e.id,at:e.occurred_at,by:'Equipo',action:e.event_type,detail:e.description||''})).sort((a,b)=>new Date(b.at)-new Date(a.at)),createdAt:row.created_at,createdBy:'Equipo',assignmentId:assignment.id||null,assignmentStatus:assignment.status||null,assignedProfessionalId:assignment.professional_id||professional.id||null,assignedUserId:assignment.assigned_user_id||null};
}
async function ensureVisitAssignment(v){
 if(!v||!v.assignedTo||!['admin','clinician','reception'].includes(cloud.role))return;
 const c=cloud.client,w=cloud.workspaceId,u=cloud.user?.id;
 let prof=null;
 if(v.assignedProfessionalId){
  const r=await c.from('professionals').select('id,user_id,name').eq('workspace_id',w).eq('id',v.assignedProfessionalId).eq('active',true).maybeSingle();
  if(r.error)throw r.error;prof=r.data;
 }
 if(!prof){
  const r=await c.from('professionals').select('id,user_id,name').eq('workspace_id',w).eq('name',v.assignedTo).eq('active',true).maybeSingle();
  if(r.error)throw r.error;prof=r.data;
 }
 if(!prof||!prof.user_id){v.notificationStatus='El domicilio quedó guardado, pero el flebotomista no tiene una cuenta activa vinculada para recibir la asignación.';cloudNotice(v.notificationStatus,true);return;}
 const dispatchNotice=async assignmentId=>{
  try{
   const notice=await invokeDomicileNotifications({action:'dispatch',assignment_id:assignmentId});
   if(!notice){
    v.notificationStatus='Domicilio guardado y asignado. El aviso quedó pendiente de emitirse; el sistema no canceló la visita.';
    console.warn('[Domicilios] El servidor no devolvió confirmación para emitir la notificación.');
    return;
   }
   if(notice.in_app_saved&&notice.push_status==='sent'){
    v.notificationStatus='Domicilio guardado y asignado. Se envió el aviso al dispositivo del flebotomista.';
   }else if(notice.in_app_saved){
    v.notificationStatus='Domicilio guardado y asignado. El aviso está en el centro de notificaciones; el flebotomista debe activar Push en su dispositivo para recibirlo en la pantalla de bloqueo.';
   }else{
    v.notificationStatus='Domicilio guardado y asignado. La notificación está pendiente de confirmación del servidor.';
   }
  }catch(e){
   v.notificationStatus='Domicilio guardado y asignado. La notificación está pendiente de conexión; no se perdió la visita.';
   console.warn('[Domicilios] Error no bloqueante al notificar:',e?.message||e);
  }
 };
 const latest=await c.from('home_visit_assignments').select('id,status,professional_id,assigned_user_id').eq('workspace_id',w).eq('home_visit_id',v.id).order('assigned_at',{ascending:false}).limit(1).maybeSingle();
 if(latest.error)throw latest.error;
 const assignment=latest.data||null;
 if(assignment&&assignment.assigned_user_id===prof.user_id&&assignment.professional_id===prof.id){
  v.assignmentId=assignment.id;v.assignmentStatus=assignment.status;v.assignedProfessionalId=prof.id;
  if(assignment.status==='invited'){v.notificationStatus='La invitación está registrada. Verificando entrega al dispositivo…';await dispatchNotice(assignment.id);}
  else if(assignment.status==='rejected')v.notificationStatus='El flebotomista rechazó esta asignación. Selecciona otra persona para continuar.';
  return;
 }
 const assignmentId=makeId();
 const ins=await c.from('home_visit_assignments').insert({id:assignmentId,workspace_id:w,home_visit_id:v.id,professional_id:prof.id,assigned_user_id:prof.user_id,status:'invited',created_by:u});
 if(ins.error){
  if(ins.error.code==='23505'){
   const concurrent=await c.from('home_visit_assignments').select('id,status,professional_id,assigned_user_id').eq('workspace_id',w).eq('home_visit_id',v.id).order('assigned_at',{ascending:false}).limit(1).maybeSingle();
   if(concurrent.error)throw concurrent.error;
   if(concurrent.data&&concurrent.data.assigned_user_id===prof.user_id&&concurrent.data.professional_id===prof.id){
    v.assignmentId=concurrent.data.id;v.assignmentStatus=concurrent.data.status;v.assignedProfessionalId=prof.id;
    if(concurrent.data.status==='invited')await dispatchNotice(concurrent.data.id);
    return;
   }
   throw new Error('Este domicilio ya tiene una asignación activa. Actualiza la agenda antes de asignarlo nuevamente.');
  }
  throw ins.error;
 }
 v.assignmentId=assignmentId;v.assignmentStatus='invited';v.assignedProfessionalId=prof.id;v.assignedTo=prof.name||v.assignedTo;
 await dispatchNotice(assignmentId);
}
function serviceFields(item){const f=item.fields&&typeof item.fields==='object'?item.fields:{};return{sample:item.sample||f.sample||'',vessel:item.vessel||f.vessel||'',colorName:item.colorName||f.colorName||'',fasting:item.fasting||f.fasting||'',conditions:item.conditions||f.conditions||'',instructions:item.instructions||f.instructions||'',volume:item.volume||f.volume||'',method:item.method||f.method||'',color:item.color||f.color||'',shape:item.shape||f.shape||'tube'}}
async function loadServiceCatalog(){
 if(!cloud.client||!cloud.workspaceId||catalogLoading)return;
 catalogLoading=true;
 try{
  let existingRows=[];
  const selectColumns='id,catalog_source_id,code,name,category,description,fields,active';
  const readExisting=async()=>{
   const result=await cloud.client.from('services').select(selectColumns).eq('workspace_id',cloud.workspaceId).order('name').limit(2000);
   if(result.error)throw result.error;
   return result.data||[];
  };
  existingRows=await readExisting();
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').replace(/[^a-z0-9]/g,'');
  if(cloud.role==='admin'){
   // El catálogo del administrador es la fuente maestra. Nunca importar elementos inactivos ni conservar activos eliminados del catálogo.
   const masterCatalog=localCatalog().filter(x=>x&&x.id&&x.name&&x.active!==false);
   const matchesMaster=(row,item)=>{
    const sourceId=String(item.id),code=normalize(item.code||item.codigo||''),name=normalize(item.name);
    return row.catalog_source_id===sourceId||(code&&normalize(row.code)===code)||(!code&&normalize(row.name)===name);
   };
   for(const item of masterCatalog){
    if(existingRows.some(x=>matchesMaster(x,item)))continue;
    const row={id:crypto.randomUUID(),workspace_id:cloud.workspaceId,catalog_source_id:String(item.id),code:item.code||item.codigo||null,name:String(item.name),category:item.category||null,price:Number(item.price)||0,description:item.description||item.desc||null,fields:serviceFields(item),active:true};
    const saved=await cloud.client.from('services').insert(row).select(selectColumns).maybeSingle();
    if(saved.error){
     if(saved.error.code==='23505'){existingRows=await readExisting();continue}
     throw saved.error;
    }
    if(saved.data)existingRows.push(saved.data);
   }
   // Si el catálogo local todavía no terminó de hidratarse, no interpretar la lista vacía como una orden de borrar/desactivar el catálogo central.
   if(masterCatalog.length){
    const obsolete=existingRows.filter(row=>row.active!==false&&!masterCatalog.some(item=>matchesMaster(row,item)));
    for(const row of obsolete){
     const disabled=await cloud.client.from('services').update({active:false}).eq('workspace_id',cloud.workspaceId).eq('id',row.id);
     if(disabled.error)throw disabled.error;
    }
   }
  }
  const result=await cloud.client.from('services').select(selectColumns).eq('workspace_id',cloud.workspaceId).eq('active',true).order('name').limit(2000);
  if(result.error)throw result.error;
  remoteCatalog=(result.data||[]).filter(x=>asUuid(x.id)).map(x=>{
   const f=x.fields&&typeof x.fields==='object'?x.fields:{};
   return{id:x.id,sourceCatalogId:x.catalog_source_id||null,code:x.code||'',name:x.name,sample:f.sample||'',vessel:f.vessel||'',colorName:f.colorName||'',fasting:f.fasting||'',conditions:f.conditions||'',instructions:f.instructions||'',volume:f.volume||'',method:f.method||'',color:f.color||'',shape:f.shape||'tube',category:x.category||'',description:x.description||''};
  });
  if($('hvTestsSearch'))drawTestPicker('hvTests',$('hvTestsSearch').value||'');
  if($('hvMoreTestsSearch'))drawTestPicker('hvMoreTests',$('hvMoreTestsSearch').value||'');
 }catch(e){
  console.error('[Domicilios] Catálogo compartido:',e);
  cloudNotice('No se pudo cargar el catálogo central de pruebas: '+(e.message||'Error desconocido'),true);
 }finally{catalogLoading=false}
}
function canCacheHomeVisitSnapshot(){return cloud.role==='admin'||!!(window.fleboCan&&window.fleboCan('domicilios','view')&&window.fleboCan('domicilios','manage'))}
function restoreHomeVisitCache(){
 if(!canCacheHomeVisitSnapshot()||!cloud.user?.id)return false;
 try{
  const cached=JSON.parse(localStorage.getItem(KEY)||'null');
  if(!cached||cached.workspaceId!==cloud.workspaceId||cached.userId!==cloud.user.id||cached.role!==cloud.role||!Array.isArray(cached.visits)||!Number.isFinite(Number(cached.cursor)))return false;
  if(Date.now()-Number(cached.cachedAt||0)>5*60*1000)return false;
  visits=cached.visits;homeVisitSyncCursor=Number(cached.cursor);homeVisitCacheActive=true;
  if($('hvRows'))render();
  return true;
 }catch(error){console.warn('[Domicilios] No se pudo restaurar la caché de agenda:',error);return false;}
}
function saveHomeVisitCache(){
 if(!canCacheHomeVisitSnapshot()||!cloud.user?.id||homeVisitSyncCursor===null){if(homeVisitCacheActive){try{localStorage.removeItem(KEY)}catch(_){}homeVisitCacheActive=false;}return;}
 try{localStorage.setItem(KEY,JSON.stringify({workspaceId:cloud.workspaceId,userId:cloud.user.id,role:cloud.role,cursor:homeVisitSyncCursor,cachedAt:Date.now(),visits}));homeVisitCacheActive=true;}
 catch(error){console.warn('[Domicilios] No se pudo actualizar la caché de agenda:',error);}
}
async function latestHomeVisitPrunedFloor(){
 const result=await cloud.client.from('sync_change_log_retention').select('pruned_through_seq').eq('workspace_id',cloud.workspaceId).eq('entity','domiciles').maybeSingle();
 if(result.error)throw result.error;
 return result.data?Number(result.data.pruned_through_seq)||0:0;
}
async function latestHomeVisitSyncCursor(){
 const [result,floor]=await Promise.all([
  cloud.client.from('sync_change_log').select('seq').eq('workspace_id',cloud.workspaceId).eq('entity','domiciles').order('seq',{ascending:false}).limit(1).maybeSingle(),
  latestHomeVisitPrunedFloor()
 ]);
 if(result.error)throw result.error;
 return Math.max(result.data?Number(result.data.seq)||0:0,floor);
}
async function ensureHomeVisitCursorFresh(){
 if(homeVisitSyncCursor===null)return true;
 const floor=await latestHomeVisitPrunedFloor();
 if(Number(homeVisitSyncCursor)>=floor)return true;
 homeVisitSyncCursor=null;homeVisitCacheActive=false;visits=[];persistedEventIds.clear();selected='';
 try{localStorage.removeItem(KEY)}catch(_){}
 return false;
}
async function fetchHomeVisitRows(ids){
 const select='*,home_visit_tests(*),home_visit_events(*),home_visit_documents(*),home_visit_additional_patients(*),home_visit_assignments(*,professionals(id,name,user_id))';
 const rows=[];
 if(!ids)return fetchAllPages(cloud.client.from('home_visits').select(select).eq('workspace_id',cloud.workspaceId).order('scheduled_at',{ascending:true}).order('id',{ascending:true}));
 for(let i=0;i<ids.length;i+=200){
  const page=await fetchAllPages(cloud.client.from('home_visits').select(select).eq('workspace_id',cloud.workspaceId).in('id',ids.slice(i,i+200)).order('scheduled_at',{ascending:true}).order('id',{ascending:true}));
  rows.push(...page);
 }
 return rows;
}
async function loadCloudVisits(){
 if(homeVisitCacheActive&&!canCacheHomeVisitSnapshot()){homeVisitCacheActive=false;homeVisitSyncCursor=null;visits=[];try{localStorage.removeItem(KEY)}catch(_){}}
 if(homeVisitSyncCursor===null)restoreHomeVisitCache();
 if(homeVisitSyncCursor!==null)await ensureHomeVisitCursorFresh();
 const fullSnapshot=homeVisitSyncCursor===null;
 const cursorBefore=fullSnapshot?await latestHomeVisitSyncCursor():homeVisitSyncCursor;
 const changes=fullSnapshot?[]:await fetchAllPages(cloud.client.from('sync_change_log').select('seq,record_id,operation').eq('workspace_id',cloud.workspaceId).eq('entity','domiciles').gt('seq',homeVisitSyncCursor).order('seq',{ascending:true}));
 if(!fullSnapshot&&!changes.length){saveHomeVisitCache();return false;}
 const changedIds=Array.from(new Set(changes.map(x=>String(x.record_id))));
 const data=await fetchHomeVisitRows(fullSnapshot?null:changedIds);
 const mapped=data.map(dbVisit);
 if(fullSnapshot){
  visits=mapped;
  persistedEventIds.clear();
 }else{
  const changedSet=new Set(changedIds);
  // Un registro que ya no es visible por RLS o fue eliminado debe desaparecer de este dispositivo.
  visits=visits.filter(v=>!changedSet.has(String(v.id))).concat(mapped);
 }
 if(cloud.role==='technician')visits=visits.filter(v=>v.assignedUserId===cloud.user?.id);
 visits.sort((a,b)=>String(a.scheduledDate+a.scheduledTime).localeCompare(String(b.scheduledDate+b.scheduledTime)));
 for(const v of (fullSnapshot?visits:mapped)){
  (v.events||[]).forEach(e=>persistedEventIds.add(e.id));
  if(!v.assignmentId&&v.status==='Pendiente de aceptación'&&v.assignedTo){
   try{await ensureVisitAssignment(v)}
   catch(e){cloudNotice('No se pudo completar la asignación de '+v.assignedTo+': '+(e.message||'error desconocido'),true);}
  }
 }
 const requestedVisit=new URLSearchParams(location.search).get('visit');
 if(requestedVisit&&visits.some(v=>v.id===requestedVisit)){selected=requestedVisit;activeTab='agenda';history.replaceState({},'',location.pathname+'?view=domicilios');}
 else if(!visits.some(v=>v.id===selected))selected='';
 if($('hvRows')){
  render();
  if(requestedVisit){setTimeout(()=>document.getElementById('hvDetail')?.scrollIntoView({behavior:'smooth',block:'start'}),120)}
 }
 if(fullSnapshot){
  homeVisitSyncCursor=cursorBefore;
  saveHomeVisitCache();
  // Recupera las modificaciones que pudieron ocurrir mientras se cargaba la instantánea.
  return await loadCloudVisits();
 }
 homeVisitSyncCursor=Number(changes[changes.length-1].seq);
 saveHomeVisitCache();
 return true;
}
async function persistVisit(v){
 const c=cloud.client,w=cloud.workspaceId,u=cloud.user.id;
 const technician=cloud.role==='technician';
 const staffReassignment=!technician&&!!v.assignmentId&&v.assignmentStatus==='rejected';
 const technicianResponse=technician&&v.assignmentId&&['Aceptado','Rechazado'].includes(v.status)&&v.assignmentStatus!=='accepted'&&v.assignmentStatus!=='rejected';
 const notes=JSON.stringify({flebo_meta:true,patientName:v.patientName,document:v.document||'',assignedTo:v.assignedTo||'',assignedPhone:v.assignedPhone||''});
 let dbStatus=statusToDb[v.status]||'pending_assignment';
 if(technicianResponse)dbStatus='pending_acceptance';
 const row={id:v.id,workspace_id:w,patient_id:asUuid(v.patientId),scheduled_at:new Date(v.scheduledDate+'T'+v.scheduledTime+':00-05:00').toISOString(),address:v.address,latitude:v.latitude??null,longitude:v.longitude??null,patient_phone:v.phone||null,status:dbStatus,priority:priorityDb(v.priority),notes,cancellation_reason:v.reason||null,created_by:v.createdById||u,created_at:v.createdAtDb||v.createdAt||new Date().toISOString(),completed_at:v.completedAt||null};
 /* Los técnicos actualizan el registro existente; nunca usan UPSERT/INSERT en home_visits. */
 /* La aceptación/rechazo se confirma primero en la asignación. En ese paso NO se toca home_visits:
    el trigger de seguridad solo permite editar la visita después de que la asignación esté accepted. */
 if(!technician&&v.status==='Cancelado'){
  const cancelled=await c.rpc('cancel_home_visit',{p_home_visit_id:v.id,p_reason:v.reason||''});
  if(cancelled.error)throw cancelled.error;
  try{
   const notice=await invokeDomicileNotifications({action:'cancelled',visit_id:v.id,reason:v.reason||''});
   if(!notice?.ok)cloudNotice('El domicilio se canceló, pero no se confirmó el aviso a los responsables. Revisa el centro de notificaciones.',true);
   else if(notice.notified===0)cloudNotice('El domicilio se canceló. No había otros responsables vinculados para notificar.',false);
   else cloudNotice('Domicilio cancelado. Aviso registrado para '+notice.notified+' responsable(s); Push enviado a '+(notice.push_sent||0)+' dispositivo(s).',false);
  }catch(noticeError){console.error('[Domicilios] La cancelación se guardó, pero falló el aviso:',noticeError);cloudNotice('El domicilio se canceló, pero falló el aviso a los responsables. Revisa el centro de notificaciones.',true)}
  await loadCloudVisits();
  return;
 }
 if(technicianResponse){
  const response=await c.from('home_visit_assignments').update({status:v.status==='Aceptado'?'accepted':'rejected',responded_at:new Date().toISOString(),response_note:v.reason||null}).eq('id',v.assignmentId).eq('workspace_id',w).eq('assigned_user_id',u).eq('status','invited').select('id,status').maybeSingle();
  if(response.error)throw response.error;
  if(!response.data)throw new Error('No se confirmó la respuesta. Esta invitación ya fue respondida o no pertenece a tu cuenta.');
  v.assignmentStatus=response.data.status;
  if(technicianResponse){
   if(response.data.status==='accepted'){
    v.status='Aceptado';
    const acceptanceEvent=(v.events||[])[0];
    if(acceptanceEvent){
     const eventId=asUuid(acceptanceEvent.id)||crypto.randomUUID();
     try{
      const eventResult=await c.from('home_visit_events').insert({id:eventId,workspace_id:w,home_visit_id:v.id,event_type:'Domicilio aceptado',from_status:'pending_acceptance',to_status:'accepted',description:'El flebotomista confirmó que realizará el domicilio.',actor_user_id:u,metadata:{by:actor()}});
      if(eventResult.error)console.warn('[Domicilios] La aceptación se guardó, pero no se pudo registrar el evento:',eventResult.error.message||eventResult.error);
     }catch(eventError){console.warn('[Domicilios] La aceptación se guardó; falló el registro secundario del evento:',eventError?.message||eventError)}
    }
   }
   // Una invitación rechazada queda registrada en home_visit_assignments.
   // No debe intentar insertar un evento de aceptación para una asignación rechazada.
   try{await loadCloudVisits()}catch(refreshError){console.warn('[Domicilios] La respuesta quedó guardada; no se pudo refrescar la agenda:',refreshError?.message||refreshError)}
   return;
  }
 }
 const saved=(technicianResponse||staffReassignment)?{data:{id:v.id},error:null}:technician?await c.from('home_visits').update(row).eq('id',v.id).eq('workspace_id',w).select('id').maybeSingle():await c.from('home_visits').upsert(row,{onConflict:'id'});
 if(saved.error)throw saved.error;
 if(technician&&!saved.data)throw new Error('No se pudo actualizar el domicilio. Verifica que siga asignado a tu cuenta y que tengas permiso para este paso.');
 if(!technicianResponse&&!staffReassignment){
  const testRows=[];
  for(const t of (v.tests||[])){
   const normalizedTestId=asUuid(t.id)||crypto.randomUUID();t.id=normalizedTestId;
   let serviceId=asUuid(t.serviceId||t.testId)||null;
   if(t.source==='adicional'){
    let service=null;
    if(serviceId){const match=await c.from('services').select('id,name').eq('workspace_id',w).eq('id',serviceId).eq('active',true).maybeSingle();if(match.error)throw match.error;service=match.data;}
    if(!service){
     const byName=await c.from('services').select('id,name').eq('workspace_id',w).eq('name',t.name).eq('active',true).limit(1).maybeSingle();
     if(byName.error)throw byName.error;
     service=byName.data;
    }
    serviceId=asUuid(service?.id)||null;
    if(!serviceId)throw new Error('La prueba adicional '+t.name+' no existe activa en el catálogo maestro. Selecciona una prueba de la lista de coincidencias.');
   }
   testRows.push({id:t.id,workspace_id:w,home_visit_id:v.id,service_id:serviceId,test_name:t.name,vessel:t.vessel||null,quantity:t.quantity||1,status:testToDb[t.status]||'pending',source:t.source==='adicional'?'additional':'original',notes:t.notes||null,added_by:asUuid(t.addedById)||u,added_at:t.addedAt||undefined,catalog_snapshot:t.catalogSnapshot||serviceFields(t)});
  }
  if(testRows.length){if(technician){for(const tr of testRows){const upd=await c.from('home_visit_tests').update({status:tr.status,notes:tr.notes,catalog_snapshot:tr.catalog_snapshot}).eq('id',tr.id).eq('workspace_id',w).select('id').maybeSingle();if(upd.error)throw upd.error;if(!upd.data&&tr.source==='additional'){const ins=await c.from('home_visit_tests').insert(tr);if(ins.error)throw ins.error}else if(!upd.data)throw new Error('No se pudo actualizar la prueba '+tr.test_name+'.')}}else{const tr=await c.from('home_visit_tests').upsert(testRows,{onConflict:'id'});if(tr.error)throw tr.error}}
 }
 const eventRows=(staffReassignment?[]:(v.events||[])).filter(e=>e.id&&!persistedEventIds.has(e.id)).map(e=>{
  const transition=(e.detail||'').match(/([^→]+)→\s*([^·]+)/);
  const eventId=asUuid(e.id)||crypto.randomUUID();e.id=eventId;
  return{id:eventId,workspace_id:w,home_visit_id:v.id,event_type:e.action||'Actualización',from_status:transition?.[1]?.trim()||null,to_status:transition?.[2]?.trim()||null,description:e.detail||null,actor_user_id:u,metadata:{by:e.by||''}};
 });
 if(eventRows.length){const er=await c.from('home_visit_events').insert(eventRows);if(er.error)throw er.error;eventRows.forEach(e=>persistedEventIds.add(e.id))}
 const latestEvent=(v.events||[])[0];
 if(latestEvent&&eventRows.length){
  // La notificación es secundaria: no debe convertir un cambio ya guardado en un falso error.
  invokeDomicileNotifications({action:'status-update',visit_id:v.id,event_type:latestEvent.action,description:latestEvent.detail||'',status:v.status})
   .then(result=>{if(!result?.ok)console.warn('[Domicilios] El cambio se guardó, pero el aviso no fue confirmado:',result)})
   .catch(error=>console.warn('[Domicilios] El cambio se guardó; falló el aviso:',error?.message||error));
 }
 if(v.status!=='Cancelado'&&v.assignedTo&&['admin','clinician','reception'].includes(cloud.role)&&(!v.assignmentId||staffReassignment))await ensureVisitAssignment(v);
}
async function save(v){
 if(!cloud.ready||!cloud.client){say('No se guardó: inicia sesión y conecta el laboratorio a Supabase.');return false}
 try{await persistVisit(v);const n=$('hvConnectionNotice');if(n)n.style.display='none';return true}
 catch(e){cloudNotice('Error al guardar en Supabase: '+(e.message||'Error desconocido')+'. El cambio no se confirmó.',true);say('No se pudo guardar el cambio: '+(e.message||'Error desconocido'));return false}
}
let cloudRefreshTimer=null,cloudRefreshRunning=false,cloudRefreshAgain=false;
function scheduleCloudVisitsRefresh(){
 if(cloudRefreshTimer)clearTimeout(cloudRefreshTimer);
 cloudRefreshTimer=setTimeout(async()=>{
  cloudRefreshTimer=null;
  if(cloudRefreshRunning){cloudRefreshAgain=true;return;}
  cloudRefreshRunning=true;
  try{await loadCloudVisits()}catch(error){cloudNotice(error?.message||'No se pudo actualizar la agenda.',true)}
  finally{cloudRefreshRunning=false;if(cloudRefreshAgain){cloudRefreshAgain=false;scheduleCloudVisitsRefresh()}}
 },250);
}
async function connectCloud(){
 if(cloud.loading)return;cloud.loading=true;
 try{
  if(!window.FleboAuth)throw new Error('El módulo de acceso no está disponible.');
  const c=await window.FleboAuth.init();cloud.client=c;const {data:{session},error}=await c.auth.getSession();if(error)throw error;
  if(!session?.user){cloud.ready=false;cloudNotice('Inicia sesión para cargar y guardar la agenda compartida en la nube.',false);return}
  const membership=window.FleboAuth.membership;
  if(!membership?.workspace_id){cloud.ready=false;cloudNotice('La cuenta está autenticada, pero aún no tiene un laboratorio asignado. Crea el espacio de trabajo desde el panel de acceso.',true);return}
  const nextWorkspace=membership.workspace_id,nextRole=membership.role;
  if(cloud.user?.id!==session.user.id||cloud.workspaceId!==nextWorkspace||cloud.role!==nextRole){homeVisitSyncCursor=null;homeVisitCacheActive=false;visits=[];selected='';}
  cloud.user=session.user;cloud.workspaceId=nextWorkspace;cloud.role=nextRole;await loadServiceCatalog();await loadCloudVisits();cloud.ready=true;const n=$('hvConnectionNotice');if(n)n.style.display='none';syncPushActivationUI();registerPushIfPermitted();
  if(cloud.channel)c.removeChannel(cloud.channel);
  cloud.channel=c.channel('fleboreport-home-'+cloud.workspaceId)
   .on('postgres_changes',{event:'*',schema:'public',table:'home_visits',filter:'workspace_id=eq.'+cloud.workspaceId},()=>scheduleCloudVisitsRefresh())
   .on('postgres_changes',{event:'*',schema:'public',table:'home_visit_tests',filter:'workspace_id=eq.'+cloud.workspaceId},()=>scheduleCloudVisitsRefresh())
   .on('postgres_changes',{event:'*',schema:'public',table:'home_visit_assignments',filter:'workspace_id=eq.'+cloud.workspaceId},()=>scheduleCloudVisitsRefresh())
   .on('postgres_changes',{event:'*',schema:'public',table:'home_visit_events',filter:'workspace_id=eq.'+cloud.workspaceId},()=>scheduleCloudVisitsRefresh())
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'sync_change_log',filter:'workspace_id=eq.'+cloud.workspaceId},()=>scheduleCloudVisitsRefresh()).subscribe();
 }catch(e){cloud.ready=false;cloudNotice('No se pudo conectar con Supabase: '+(e.message||'Error de conexión'),true)}
 finally{cloud.loading=false}
}
function log(v,action,detail){v.events.unshift({id:makeId(),at:new Date().toISOString(),by:actor(),action,detail:detail||''});v.updatedAt=new Date().toISOString()}
function dateLabel(s){let d=new Date(s+'T12:00:00');return isNaN(d)?s:d.toLocaleDateString('es-PA',{day:'2-digit',month:'short',year:'numeric'})}
function statusBadge(s){let c=['Finalizado','Muestras tomadas'].includes(s)?'done':['Cancelado','Rechazado','No realizado','Paciente ausente','Paciente rechazó la toma'].includes(s)?'bad':['Aceptado','En camino','En domicilio'].includes(s)?'active':'pending';return '<span class="hv-status '+c+'">'+esc(s)+'</span>'}
function testPicker(prefix){return '<div class="hv-test-picker"><input id="'+prefix+'Search" type="search" autocomplete="off" placeholder="Escribe el nombre o código de la prueba…" aria-label="Buscar prueba por nombre o código" aria-expanded="false" aria-controls="'+prefix+'Choices"><div class="hv-test-dropdown" id="'+prefix+'Dropdown" hidden><div id="'+prefix+'Choices" class="hv-test-choices" role="listbox" aria-label="Coincidencias de pruebas"></div></div><div id="'+prefix+'Selected" class="hv-selected-tests" aria-live="polite"></div></div>'}
function drawTestPicker(prefix,filter,show){let ids=prefix==='hvTests'?newTestSelection:moreTestSelection,normalize=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('es'),q=normalize(filter),codeOf=t=>t.code||t.codigo||t.testCode||t.serviceCode||'',items=q?catalog().filter(t=>[t.name,codeOf(t),t.category,t.description].some(value=>normalize(value).includes(q))):[],host=$(prefix+'Choices'),selectedHost=$(prefix+'Selected'),dropdown=$(prefix+'Dropdown'),input=$(prefix+'Search');if(!host||!selectedHost)return;host.innerHTML=items.length?items.map(t=>'<button type="button" class="hv-test-result" data-add-test="'+esc(t.id)+'" data-prefix="'+prefix+'" role="option"><b>'+esc(t.name)+'</b>'+(codeOf(t)?'<small>Código: '+esc(codeOf(t))+'</small>':'')+'</button>').join(''):q?'<div class="hv-empty">No se encontró ninguna prueba con ese nombre o código.</div>':'';if(dropdown){dropdown.hidden=!q||!show;if(input)input.setAttribute('aria-expanded',String(!dropdown.hidden))}selectedHost.innerHTML=ids.map(id=>{let t=catalog().find(x=>x.id===id);return t?'<span class="hv-test-chip">'+esc(t.name)+' <button type="button" data-remove-test="'+esc(id)+'" data-prefix="'+prefix+'" aria-label="Quitar '+esc(t.name)+'">×</button></span>':''}).join('')}
function toggleTest(prefix,id){let ids=prefix==='hvTests'?newTestSelection:moreTestSelection,at=ids.indexOf(id);if(at>=0)ids.splice(at,1);else ids.push(id);let input=$(prefix+'Search');if(input)input.value='';drawTestPicker(prefix,'',false)}

function reset(){['hvName','hvDoc','hvPhone','hvEmail','hvAddress','hvAssignee','hvAssigneePhone','hvPatientLookup'].forEach(id=>{if($(id))$(id).value=''});['hvPatientId','hvBirthDate'].forEach(id=>{if($(id))$(id).value=''});if($('hvSex'))$('hvSex').value='';if($('hvPatientLookupStatus'))$('hvPatientLookupStatus').textContent='Busca el expediente antes de registrar un paciente nuevo.';selectedProfessional=null;if($('hvProfessionalResults'))$('hvProfessionalResults').innerHTML='';$('hvDate').value=today();$('hvTime').value='08:00';if($('hvPriority'))$('hvPriority').value='normal';newTestSelection=[];if($('hvTestsSearch'))$('hvTestsSearch').value='';drawTestPicker('hvTests','')}
async function create(){
 const button=document.querySelector('#hvCreatePanel .form-actions button[onclick="hvCreate()"]');
 if(createBusy)return;
 createBusy=true;
 const originalLabel=button?.textContent||'Guardar domicilio';
 if(button){button.disabled=true;button.textContent='Guardando domicilio…'}
 try{
  if(!cloud.ready||!cloud.client){say('No se pudo crear el domicilio: la conexión con el laboratorio todavía no está lista.');return}
  if(!['admin','clinician','reception'].includes(cloud.role)){say('Tu perfil no tiene permiso para crear domicilios principales.');return}
  const name=$('hvName').value.trim(),documentNumber=$('hvDoc').value.trim(),date=$('hvDate').value,time=$('hvTime').value,address=$('hvAddress').value.trim(),priority=priorityDb($('hvPriority')?.value||'normal'),ids=newTestSelection.slice(),assignee=$('hvAssignee').value.trim();
  if(!name||!date||!time||!address||!ids.length||!['urgent','high','normal'].includes(priority)){say('Completa paciente, fecha, hora, prioridad, dirección y pruebas.');return}
  if(assignee&&(!selectedProfessional||selectedProfessional.name.toLocaleLowerCase('es')!==assignee.toLocaleLowerCase('es'))){say('Selecciona un flebotomista de la lista de usuarios registrados.');return}
  if(selectedProfessional&&!selectedProfessional.user_id){say('Este flebotomista no tiene una cuenta de usuario vinculada y no podrá recibir la asignación.');return}
  const selectedTests=ids.map(id=>remoteCatalog.find(x=>x.id===id));
  const invalidTest=selectedTests.findIndex((item,i)=>!item||!asUuid(ids[i]));
  if(invalidTest>=0){say('Una de las pruebas seleccionadas ya no pertenece al catálogo central o no tiene un identificador válido. Vuelve a buscarla y selecciónala nuevamente.');return}
  let patientId=asUuid($('hvPatientId').value);
  if(!patientId){
   const parts=name.split(/\s+/),firstName=parts.shift()||name,lastName=parts.join(' ')||' ';
   if(documentNumber){
    const existing=await cloud.client.from('patients').select('id').eq('workspace_id',cloud.workspaceId).eq('document_number',documentNumber).maybeSingle();
    if(existing.error)throw existing.error;
    if(existing.data){say('Ya existe un paciente con esa cédula. Búscalo y selecciónalo antes de continuar.');return}
   }
   const created=await cloud.client.from('patients').insert({workspace_id:cloud.workspaceId,document_number:documentNumber||null,first_name:firstName,last_name:lastName,birth_date:$('hvBirthDate').value||null,sex:$('hvSex').value||null,phone:$('hvPhone').value.trim()||null,email:$('hvEmail').value.trim()||null,address,created_by:cloud.user.id}).select('id').single();
   if(created.error)throw created.error;
   patientId=created.data.id;$('hvPatientId').value=patientId;
  }
  const v={
   id:makeId(),patientId,patientName:name,document:documentNumber,phone:$('hvPhone').value.trim(),address,
   scheduledDate:date,scheduledTime:time,priority,assignedTo:selectedProfessional?.name||'',
   assignedProfessionalId:selectedProfessional?.id||null,assignedPhone:$('hvAssigneePhone').value.trim(),
   status:selectedProfessional?'Pendiente de aceptación':'Pendiente de asignación',
   tests:ids.map((id,i)=>{
    const t=selectedTests[i];
    return{id:crypto.randomUUID(),testId:id,serviceId:t.id,name:t.name,sample:t.sample||'',vessel:t.vessel||'',colorName:t.colorName||'',fasting:t.fasting||'',conditions:t.conditions||'',instructions:t.instructions||'',volume:t.volume||'',method:t.method||'',color:t.color||'',shape:t.shape||'tube',catalogSnapshot:serviceFields(t),status:'Pendiente',source:'original',addedBy:actor()};
   }),
   events:[],createdAt:new Date().toISOString(),createdBy:actor()
  };
  log(v,'Domicilio creado',date+' '+time);visits.unshift(v);
  if(!await save(v)){visits=visits.filter(x=>x.id!==v.id);return}
  selected=v.id;activeTab='agenda';reset();render();
  cloudNotice(v.notificationStatus||'Domicilio creado y guardado correctamente.',false);
  say('Domicilio creado y guardado correctamente.');
 }catch(e){
  const message=e?.message||'Error desconocido al guardar';
  console.error('[Domicilios] No se pudo crear el domicilio:',e);
  cloudNotice('No se pudo completar el domicilio. '+message,true);
  say('No se pudo guardar el domicilio: '+message);
 }finally{
  createBusy=false;
  if(button){button.disabled=false;button.textContent=originalLabel}
 }
}
async function openSamplesReview(id){
 const v=visits.find(x=>x.id===id);if(!v)return;
 if(!cloud.ready||!cloud.client){say('Conecta la agenda con Supabase antes de revisar las pruebas.');return}
 if(!Array.isArray(v.tests))v.tests=[];
 try{
  const result=await cloud.client.from('home_visit_tests').select('*').eq('workspace_id',cloud.workspaceId).eq('home_visit_id',id);
  if(result.error)throw result.error;
  const cloudTests=(result.data||[]).map(t=>{
   const z=t.catalog_snapshot&&typeof t.catalog_snapshot==='object'?t.catalog_snapshot:{};
   return{id:t.id,testId:t.service_id||'',serviceId:t.service_id||null,quantity:t.quantity||1,addedById:t.added_by||null,addedAt:t.added_at||null,catalogSnapshot:z,name:t.test_name||t.name||z.name||'Prueba sin nombre',sample:z.sample||'',vessel:t.vessel||z.vessel||'',colorName:z.colorName||'',fasting:z.fasting||'',conditions:z.conditions||'',instructions:z.instructions||'',volume:z.volume||'',method:z.method||'',color:z.color||'',shape:z.shape||'tube',status:testFromDb[t.status]||'Pendiente',source:t.source==='additional'?'adicional':'original',notes:t.notes||'',addedBy:'Equipo'};
  });
  if(cloudTests.length||!v.tests.length)v.tests=cloudTests;
 }catch(error){
  console.error('[Domicilios] No se pudieron recuperar las pruebas de la visita:',error);
  cloudNotice('No se pudieron recuperar las pruebas solicitadas: '+(error.message||'Error desconocido'),true);
  say('No se pudieron cargar las pruebas de este paciente. No se confirmó ninguna muestra. '+(error.message||''));
  return;
 }
 const overlay=document.createElement('div');overlay.className='hv-review-overlay';overlay.id='hvSamplesReview';
 const correctionSelection=new Set();
 const isRemoved=t=>String(t.notes||'').includes('[CORRECCION: RETIRADA]');
 const total=()=>v.tests.filter(t=>!isRemoved(t)).reduce((n,t)=>n+Number(t.quantity||1),0);
 const counts=()=>({taken:v.tests.filter(t=>!isRemoved(t)&&t.status==='Tomada').length,notTaken:v.tests.filter(t=>!isRemoved(t)&&t.status==='No tomada').length,pending:v.tests.filter(t=>!isRemoved(t)&&(!t.status||t.status==='Pendiente')).length});
 let vessels={};
 const renderTests=()=>v.tests.length?v.tests.map((t,i)=>{
  const removed=isRemoved(t);
  return '<article class="hv-review-test" data-test-row="'+i+'" style="'+(removed?'opacity:.72;border-style:dashed':'')+'"><div class="hv-review-test-head"><b>'+ (i+1)+'. '+esc(t.name)+'</b>'+(removed?'<span class="hv-status bad">Retirada de la solicitud</span>':'<label class="hv-review-choice"><span>Estado de la prueba</span><select data-test-status="'+i+'"><option value="Pendiente" '+(t.status==='Pendiente'||!t.status?'selected':'')+'>Pendiente</option><option value="Tomada" '+(t.status==='Tomada'?'selected':'')+'>Tomada</option><option value="No tomada" '+(t.status==='No tomada'?'selected':'')+'>No tomada</option></select></label>')+'</div><div class="hv-review-meta"><span><small>Muestra</small><b>'+esc(t.sample||'No configurada')+'</b></span><span><small>Recipiente</small><b>'+esc(t.vessel||'No configurado')+'</b></span><span><small>Cantidad</small><b>'+esc(t.quantity||1)+'</b></span>'+(t.colorName?'<span><small>Color</small><b>'+esc(t.colorName)+'</b></span>':'')+(t.volume?'<span><small>Volumen</small><b>'+esc(t.volume)+'</b></span>':'')+(t.fasting?'<span class="wide"><small>Ayuno / preparación</small><b>'+esc(t.fasting)+'</b></span>':'')+(t.conditions?'<span class="wide"><small>Condiciones de toma</small><b>'+esc(t.conditions)+'</b></span>':'')+(t.instructions?'<span class="wide"><small>Indicaciones</small><b>'+esc(t.instructions)+'</b></span>':'')+'</div>'+(removed?'<p class="hv-help">Se conserva en el historial como prueba retirada. No se contará como muestra tomada.</p>':'<button type="button" class="btn" data-remove-requested-test="'+i+'" style="margin-top:8px">Retirar prueba incorrecta</button>')+'</article>';
 }).join(''):'<div class="hv-empty">Este domicilio no tiene pruebas registradas en la solicitud. No es posible confirmar muestras hasta recuperar o registrar las pruebas correctas.</div>';
 const renderCatalogResults=q=>{
  const host=overlay.querySelector('[data-correction-results]');if(!host)return;
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim();
  const query=norm(q);
  const matches=query?catalog().filter(t=>norm(t.name).includes(query)||norm(t.code||t.codigo||t.testCode||t.serviceCode||'').includes(query)).slice(0,12):[];
  host.innerHTML=matches.map(t=>'<button type="button" class="hv-test-result" data-correction-add="'+esc(t.id)+'"><b>'+esc(t.name)+'</b><small>'+(t.code||t.codigo||t.testCode||t.serviceCode?'Código: '+esc(t.code||t.codigo||t.testCode||t.serviceCode):'Catálogo central')+'</small></button>').join('')||(query?'<div class="hv-empty">No se encontraron pruebas activas con ese nombre o código.</div>':'<div class="hv-help">Escribe el nombre o código de la prueba que corresponde.</div>');
 };
 const refresh=()=>{
  vessels={};
  v.tests.filter(t=>!isRemoved(t)).forEach(t=>{const k=t.vessel||'Sin recipiente';vessels[k]=(vessels[k]||0)+Number(t.quantity||1)});
  const list=overlay.querySelector('[data-review-tests]');if(list)list.innerHTML=renderTests();
  const summary=overlay.querySelector('[data-review-vessels]');if(summary)summary.innerHTML=Object.entries(vessels).map(([name,count])=>'<span class="hv-review-chip">'+esc(name)+': <b>'+count+'</b></span>').join('');
  const heading=overlay.querySelector('[data-review-total]');if(heading)heading.textContent=total()+' unidad(es) · '+v.tests.filter(t=>!isRemoved(t)).length+' prueba(s) activas';
  const c=counts(),counter=overlay.querySelector('[data-review-count]');if(counter)counter.textContent='Tomadas: '+c.taken+' · No tomadas: '+c.notTaken+' · Pendientes: '+c.pending;
  const confirm=overlay.querySelector('[data-review-confirm]');if(confirm)confirm.disabled=c.pending>0||c.taken===0;
 };
 overlay.innerHTML='<section class="hv-review-modal" role="dialog" aria-modal="true" aria-labelledby="hvReviewTitle"><header class="hv-review-header"><div><span class="eyebrow">VERIFICACIÓN PREVIA A LA TOMA</span><h2 id="hvReviewTitle">Revisión del paciente y las muestras</h2><p>Verifica que las pruebas correspondan a la solicitud antes de confirmar la toma.</p></div><button type="button" class="hv-review-close" data-review-close aria-label="Cerrar">×</button></header><div class="hv-review-body"><h3>Datos del paciente</h3><div class="hv-review-grid"><div><small>Nombre completo</small><b>'+esc(v.patientName||'—')+'</b></div><div><small>Documento</small><b>'+esc(v.document||'—')+'</b></div><div><small>Teléfono</small><b>'+esc(v.phone||'—')+'</b></div><div><small>Responsable</small><b>'+esc(v.assignedTo||'—')+'</b></div><div><small>Fecha y hora</small><b>'+dateLabel(v.scheduledDate)+' · '+esc(v.scheduledTime)+'</b></div><div class="wide"><small>Dirección</small><b>'+esc(v.address||'—')+'</b></div></div><div class="hv-review-section-title"><h3>Pruebas solicitadas</h3><strong data-review-total></strong></div><div class="hv-review-bulk"><button type="button" class="btn primary" data-mark-all-taken>✓ Marcar todas como tomadas</button><span data-review-count></span></div><div data-review-tests></div><section class="hv-review-correction" style="margin-top:18px;padding:14px;border:1px solid var(--border-color,#d7e0e8);border-radius:14px"><h3>¿La solicitud tiene pruebas incorrectas?</h3><p class="hv-help">Retira las pruebas equivocadas y agrega las correctas desde el catálogo central. Las retiradas quedarán registradas en el historial; no se borrarán silenciosamente.</p><label for="hvCorrectionSearch"><b>Buscar prueba correcta por nombre o código</b></label><input id="hvCorrectionSearch" type="search" autocomplete="off" placeholder="Escribe nombre o código de la prueba" style="width:100%;margin:8px 0"><div data-correction-results class="hv-test-choices" role="listbox"></div></section><h3>Resumen de recipientes</h3><div class="hv-review-chips" data-review-vessels></div><p class="hv-review-warning">Antes de confirmar, cada prueba activa debe quedar como “Tomada” o “No tomada”. Las pruebas retiradas se conservan para auditoría y no se consideran muestras tomadas.</p></div><footer class="hv-review-footer"><button type="button" class="btn" data-review-close>Volver a revisar</button><button type="button" class="btn" data-save-corrections>Guardar correcciones</button><button type="button" class="btn primary" data-review-confirm>Confirmar muestras tomadas</button></footer></section>';
 const updateCount=()=>refresh();
 overlay.addEventListener('change',e=>{const sel=e.target.closest('[data-test-status]');if(!sel)return;const t=v.tests[Number(sel.dataset.testStatus)];if(t)t.status=sel.value;updateCount()});
 overlay.addEventListener('click',async e=>{
  if(e.target===overlay||e.target.closest('[data-review-close]')){overlay.remove();return}
  const remove=e.target.closest('[data-remove-requested-test]');
  if(remove){const t=v.tests[Number(remove.dataset.removeRequestedTest)];if(!t)return;if(t.status==='Tomada'){say('Esta prueba ya está marcada como tomada. No se puede retirar después de registrar su toma.');return}const reason='[CORRECCION: RETIRADA] '+actor()+' · '+new Date().toISOString();t.status='No tomada';t.notes=(t.notes? t.notes+' | ':'')+reason;refresh();return}
  const add=e.target.closest('[data-correction-add]');
  if(add){
   const item=catalog().find(x=>String(x.id)===String(add.dataset.correctionAdd));if(!item){say('La prueba ya no está disponible en el catálogo. Búscala nuevamente.');return}
   if(v.tests.some(t=>!isRemoved(t)&&(t.serviceId===item.id||t.testId===item.id||String(t.name).toLowerCase()===String(item.name).toLowerCase()))){say('Esa prueba ya está incluida en la solicitud.');return}
   v.tests.push({id:crypto.randomUUID(),testId:item.id,serviceId:item.id,name:item.name,sample:item.sample||'',vessel:item.vessel||'',colorName:item.colorName||'',fasting:item.fasting||'',conditions:item.conditions||'',instructions:item.instructions||'',volume:item.volume||'',method:item.method||'',color:item.color||'',shape:item.shape||'tube',catalogSnapshot:serviceFields(item),status:'Pendiente',source:'adicional',addedBy:actor(),addedAt:new Date().toISOString()});
   const input=overlay.querySelector('#hvCorrectionSearch');if(input)input.value='';renderCatalogResults('');refresh();return;
  }
  if(e.target.closest('[data-mark-all-taken]')){v.tests.filter(t=>!isRemoved(t)).forEach(t=>t.status='Tomada');refresh();return}
  if(e.target.closest('[data-save-corrections]')){
   const button=overlay.querySelector('[data-save-corrections]');if(!cloud.ready){say('Conecta la agenda antes de guardar las correcciones.');return}
   button.disabled=true;const label=button.textContent;button.textContent='Guardando…';
   try{if(!await save(v))return;say('Correcciones guardadas. Las pruebas retiradas y las nuevas pruebas quedaron registradas.');}
   finally{button.disabled=false;button.textContent=label}
   return;
  }
  if(e.target.closest('[data-review-confirm]')){
   const c=counts();if(c.pending){say('Todavía hay '+c.pending+' prueba(s) pendientes. Marca cada una como tomada o no tomada.');return}if(!c.taken){say('No hay pruebas tomadas. No se puede confirmar “Muestras tomadas” si ninguna prueba fue tomada.');return}
   overlay.remove();await changeStatus(id,'Muestras tomadas',true);
  }
 });
 const search=overlay.querySelector('#hvCorrectionSearch');search.addEventListener('input',()=>renderCatalogResults(search.value));
 document.body.appendChild(overlay);renderCatalogResults('');refresh();
}
async function changeStatus(id,next,confirmed=false){if(next==='Muestras tomadas'&&!confirmed){openSamplesReview(id);return}if(!cloud.ready){say('Conecta la agenda con Supabase antes de actualizar estados.');return}let v=visits.find(x=>x.id===id);if(!v)return;const staff=['admin','clinician','reception'].includes(cloud.role);if(staff&&next!=='Cancelado'){say('Agenda no acepta ni rechaza domicilios ni actualiza el progreso de campo. Esa respuesta corresponde al flebotomista asignado.');return}if(staff&&next==='Cancelado'&&!['Pendiente de asignación','Pendiente de aceptación','Aceptado','Reprogramado'].includes(v.status)){say('Este domicilio ya inició su ejecución o está cerrado y no puede cancelarse desde Agenda.');return}let flow={'Pendiente de asignación':['Cancelado'],'Pendiente de aceptación':['Aceptado','Rechazado','Cancelado'],'Aceptado':['En camino','Cancelado','Reprogramado'],'En camino':['En domicilio','Paciente ausente','Paciente rechazó la toma','No realizado'],'En domicilio':['Muestras tomadas','Paciente ausente','Paciente rechazó la toma','No realizado'],'Muestras tomadas':['Finalizado'],'Reprogramado':['Pendiente de aceptación','Cancelado'],'No realizado':['Reprogramado','Cancelado'],'Paciente ausente':['Reprogramado','Cancelado'],'Paciente rechazó la toma':['Reprogramado','Cancelado']};if(!(flow[v.status]||[]).includes(next)){say('Cambio de estado no permitido.');return}if(['Muestras tomadas','Finalizado'].includes(next)){let pending=v.tests.filter(t=>t.status==='Pendiente');let taken=v.tests.some(t=>t.status==='Tomada');if(pending.length){say('Actualiza el estado de cada prueba antes de continuar.');return}if(!taken){say('No hay pruebas tomadas. Registra el domicilio como no realizado o indica la incidencia correspondiente.');return}}if(['Rechazado','Cancelado','No realizado','Paciente ausente','Paciente rechazó la toma'].includes(next)){let reason=next==='Rechazado'?'El flebotomista no puede realizar el domicilio.':prompt(next==='Cancelado'&&['admin','clinician','reception'].includes(cloud.role)?'Indica por qué el paciente solicitó cancelar el domicilio:':'Indica el motivo u observación:');if(next!=='Rechazado'&&(!reason||!reason.trim()))return;v.reason=(reason||'').trim()}let prev=v.status,prevReason=v.reason,prevCompleted=v.completedAt;v.status=next;if(next==='Finalizado')v.completedAt=new Date().toISOString();log(v,'Estado actualizado',prev+' → '+next+(v.reason?' · '+v.reason:''));if(await save(v)){if(next==='Aceptado'||next==='Rechazado'){closeAssignmentOverlays();dismissedInvitationId=id;const current=visits.find(x=>x.id===id)||v;current.status=next;current.assignmentStatus=next==='Aceptado'?'accepted':'rejected';if(current!==v){v.status=current.status;v.assignmentStatus=current.assignmentStatus;}selected=id;}render()}else{v.status=prev;v.reason=prevReason;v.completedAt=prevCompleted;v.events.shift();render()}}async function addTests(id){
 if(!cloud.ready){say('Conecta la agenda con Supabase antes de agregar pruebas.');return}
 let v=visits.find(x=>x.id===id);if(!v)return;
 let ids=moreTestSelection.slice();if(!ids.length){say('Selecciona pruebas del catálogo central.');return}
 const restoringOriginal=(v.tests||[]).length===0;
 const selected=ids.map(testId=>catalog().find(x=>x.id===testId));
 if(selected.some((t,i)=>!t||!asUuid(ids[i]))){say('Una de las pruebas ya no está disponible en el catálogo central. Búscala nuevamente y selecciónala.');return}
 selected.forEach((t,i)=>v.tests.push({id:crypto.randomUUID(),testId:ids[i],serviceId:ids[i],name:t.name,sample:t.sample||'',vessel:t.vessel||'',colorName:t.colorName||'',fasting:t.fasting||'',conditions:t.conditions||'',instructions:t.instructions||'',volume:t.volume||'',method:t.method||'',color:t.color||'',shape:t.shape||'tube',catalogSnapshot:serviceFields(t),status:'Pendiente',source:restoringOriginal?'original':'adicional',addedBy:actor()}));
 log(v,restoringOriginal?'Pruebas solicitadas restauradas desde el catálogo':'Pruebas adicionales agregadas',ids.length+' prueba(s)');
 moreTestSelection=[];if(await save(v))render();
}
async function testStatus(id,tid,next){if(!cloud.ready){say('Conecta la agenda con Supabase antes de actualizar pruebas.');return}let v=visits.find(x=>x.id===id),t=v&&v.tests.find(x=>x.id===tid);if(!t)return;let note=t.notes||'';if(next==='No tomada'){note=prompt('Indica por qué no se pudo tomar esta prueba:');if(!note||!note.trim())return;note=note.trim()}t.status=next;t.notes=next==='No tomada'?note:'';t.statusAt=new Date().toISOString();t.statusBy=actor();log(v,'Estado de prueba',t.name+' · '+next+(t.notes?' · '+t.notes:''));if(await save(v))render()}
function technicianFieldScreen(v){
 const id=v.id,canWork=['Aceptado','En camino','En domicilio','Muestras tomadas'].includes(v.status);
 const action=(next,label,cls='primary')=>'<button class="btn '+cls+' hv-field-action" type="button" onclick="hvStatus(\''+id+'\',\''+next+'\')">'+label+'</button>';
 const tests=(v.tests||[]).map(t=>'<article class="hv-field-test"><div class="hv-field-test-top"><div><b>'+esc(t.name)+'</b><small>'+esc(t.sample||'Muestra no especificada')+' · '+esc(t.vessel||'Recipiente no especificado')+'</small></div><span class="hv-field-test-state '+(t.status==='Tomada'?'ok':t.status==='No tomada'?'bad':'wait')+'">'+esc(t.status||'Pendiente')+'</span></div>'+(t.colorName?'<small>Color: '+esc(t.colorName)+'</small>':'')+(t.volume?'<small>Volumen: '+esc(t.volume)+'</small>':'')+(t.fasting?'<small>Preparación: '+esc(t.fasting)+'</small>':'')+(t.conditions?'<small>Condiciones: '+esc(t.conditions)+'</small>':'')+(t.instructions?'<small>Indicaciones: '+esc(t.instructions)+'</small>':'')+(t.notes?'<small class="hv-field-note">Observación: '+esc(t.notes)+'</small>':'')+(canWork&&['En domicilio','En camino'].includes(v.status)?'<label class="hv-field-select">Resultado de esta prueba<select onchange="hvTestStatus(\''+id+'\',\''+t.id+'\',this.value)"><option '+(t.status==='Pendiente'?'selected':'')+'>Pendiente</option><option '+(t.status==='Tomada'?'selected':'')+'>Tomada</option><option '+(t.status==='No tomada'?'selected':'')+'>No tomada</option></select></label>':'')+'</article>').join('');
 const totals={};(v.tests||[]).forEach(t=>{const k=t.vessel||'Sin recipiente';totals[k]=(totals[k]||0)+Number(t.quantity||1)});
 const summary=Object.entries(totals).map(([name,n])=>'<span class="hv-field-vessel"><b>'+n+'</b><small>'+esc(name)+'</small></span>').join('');
 let actions='';
 if(v.status==='Pendiente de aceptación'&&v.assignmentStatus==='invited')actions=action('Aceptado','Aceptar domicilio y ver datos')+action('Rechazado','Rechazar asignación','danger');
 else if(v.status==='Aceptado')actions=action('En camino','Iniciar desplazamiento');
 else if(v.status==='En camino')actions=action('En domicilio','Confirmar llegada')+action('Paciente ausente','Paciente ausente','')+action('Paciente rechazó la toma','Paciente rechazó','danger')+action('No realizado','No se pudo realizar','danger');
 else if(v.status==='En domicilio')actions=action('Muestras tomadas','Revisar y confirmar muestras')+action('Paciente ausente','Paciente ausente','')+action('Paciente rechazó la toma','Paciente rechazó','danger')+action('No realizado','No se pudo realizar','danger');
 else if(v.status==='Muestras tomadas')actions=action('Finalizado','Finalizar domicilio');
 const locked=v.status==='Pendiente de aceptación'&&v.assignmentStatus!=='accepted';
 if(v.assignmentStatus==='rejected'||v.status==='Rechazado')return '<div class="hv-field-screen"><div class="hv-field-banner"><span>ASIGNACIÓN RECHAZADA</span><h2>Has rechazado este domicilio</h2><p>La información del paciente permanece protegida. Coordinación puede asignarte otra visita.</p></div></div>';
 if(locked){
  if(dismissedInvitationId===id)return '<div class="hv-field-screen"><div class="hv-field-banner"><span>ASIGNACIÓN PENDIENTE</span><h2>Tienes un domicilio por confirmar</h2><p>'+dateLabel(v.scheduledDate)+' · '+esc(v.scheduledTime)+'</p></div><p class="hv-help">Los datos del paciente y la dirección permanecen protegidos hasta que aceptes.</p><button type="button" class="btn primary" onclick="hvReopenInvitation(\''+id+'\')">Revisar invitación</button></div>';
  return '<div class="hv-field-screen"><div class="hv-assignment-overlay" role="presentation"><section class="hv-assignment-modal" role="dialog" aria-modal="true" aria-labelledby="hvAssignmentTitle"><div class="hv-assignment-icon">⌂</div><span class="eyebrow">NUEVA ASIGNACIÓN</span><h2 id="hvAssignmentTitle">Domicilio pendiente de aprobación</h2><p>Se te ha asignado un domicilio y necesitamos que confirmes si puedes realizarlo.</p><div class="hv-assignment-time"><small>Fecha y hora programadas</small><b>'+dateLabel(v.scheduledDate)+' · '+esc(v.scheduledTime)+'</b><small class="hv-priority-label hv-priority-'+priorityDb(v.priority)+'">Prioridad: '+priorityLabel(v.priority)+'</small></div><p class="hv-assignment-privacy">Por privacidad, el nombre del paciente, la dirección y las pruebas se mostrarán después de aceptar.</p><div class="hv-assignment-actions"><button type="button" class="btn primary" onclick="hvStatus(\''+id+'\',\'Aceptado\')">✓ Aceptar domicilio</button><button type="button" class="btn danger" onclick="hvStatus(\''+id+'\',\'Rechazado\')">Rechazar domicilio</button></div><button type="button" class="hv-assignment-later" onclick="hvDismissInvitation(\''+id+'\')">Responder más tarde</button></section></div></div>';
 }
 const events=(v.events||[]).slice(0,8).map(e=>'<div class="hv-event"><b>'+esc(e.action)+'</b><small>'+esc(new Date(e.at).toLocaleString('es-PA'))+'</small><span>'+esc(e.detail||'')+'</span></div>').join('');
 return '<div class="hv-field-screen"><div class="hv-field-banner"><span>MI VISITA · '+esc(v.id.slice(0,8).toUpperCase())+'</span><h2>'+esc(v.patientName||'Paciente')+'</h2><p>'+dateLabel(v.scheduledDate)+' · '+esc(v.scheduledTime)+'</p><div class="hv-field-current">'+statusBadge(v.status)+' <span class="hv-priority-label hv-priority-'+priorityDb(v.priority)+'">Prioridad: '+priorityLabel(v.priority)+'</span></div></div><section class="hv-field-card"><h3>Paciente y ubicación</h3><div class="hv-field-info"><div><small>Documento</small><b>'+esc(v.document||'No registrado')+'</b></div><div><small>Teléfono</small><b>'+(v.phone?'<a href="tel:'+esc(v.phone)+'">'+esc(v.phone)+'</a>':'No registrado')+'</b></div><div class="wide"><small>Dirección completa</small><b>'+esc(v.address||'Sin dirección')+'</b></div></div><a class="btn hv-field-map" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(v.address||'')+'">Abrir ubicación en Google Maps</a></section><section class="hv-field-card"><div class="hv-field-section-head"><h3>Pruebas y recipientes</h3><span>'+(v.tests||[]).length+' pruebas</span></div><div class="hv-field-vessels">'+(summary||'<small>Sin recipientes registrados</small>')+'</div><div class="hv-field-tests">'+(tests||'<div class="hv-empty">No hay pruebas asociadas a esta visita.</div>')+'</div></section><section class="hv-field-card"><h3>Observaciones de campo</h3><textarea id="hvFieldObservation" rows="3" placeholder="Incidencias, condiciones de acceso u observaciones de la toma…"></textarea><button class="btn" type="button" onclick="hvSaveFieldObservation(\''+id+'\')">Guardar observación</button></section><section class="hv-field-card"><h3>Acciones de la visita</h3><div class="hv-field-actions">'+actions+'</div></section><section class="hv-field-card"><h3>Actividad reciente</h3><div class="hv-timeline">'+(events||'Sin actividad registrada')+'</div></section></div>';
}
async function saveFieldObservation(id){if(!cloud.ready){say('Necesitas conexión para guardar la observación.');return}const v=visits.find(x=>x.id===id),input=$('hvFieldObservation'),note=input?.value.trim();if(!v||!note){say('Escribe una observación antes de guardar.');return}log(v,'Observación de campo',note);if(await save(v)){render();say('Observación registrada en el historial del domicilio.')}}
function detail(v){if(!v)return'<div class="hv-empty">Selecciona un domicilio.</div>';if(cloud.role==='technician')return technicianFieldScreen(v);const awaitingTechnicianDecision=cloud.role==='technician'&&v.assignmentStatus==='invited'&&v.status==='Pendiente de aceptación';if(awaitingTechnicianDecision){return '<div class="hv-detail-head"><div><div class="eyebrow">NUEVA ASIGNACIÓN</div><h2>Domicilio pendiente de tu respuesta</h2><small>Fecha: '+dateLabel(v.scheduledDate)+' · Hora: '+esc(v.scheduledTime)+'</small></div>'+statusBadge(v.status)+'</div><p class="hv-help">Revisa la fecha y la hora y confirma si puedes realizar este servicio. Por privacidad, los datos del paciente, la dirección y las pruebas se mostrarán únicamente después de aceptar.</p><div class="hv-actions"><button class="btn primary" onclick="hvStatus(\''+v.id+'\',\'Aceptado\')">Aceptar domicilio y ver detalles</button><button class="btn danger" onclick="hvStatus(\''+v.id+'\',\'Rechazado\')">Rechazar domicilio</button></div></div>';}let buttons='';
const canAgendaCancel=['Pendiente de asignación','Pendiente de aceptación','Aceptado','Reprogramado'].includes(v.status);
if(canAgendaCancel)buttons='<button class="btn danger" onclick="hvStatus(\''+v.id+'\',\'Cancelado\')">Cancelar por solicitud del paciente</button>';
;let tests=v.tests.map(t=>'<div class="hv-test"><span><b>'+esc(t.name)+'</b><small>'+'Muestra: '+esc(t.sample||'No configurada')+' · Recipiente: '+esc(t.vessel||'No configurado')+(t.colorName?' · Color: '+esc(t.colorName):'')+'</small>'+(t.fasting?'<small>Ayuno / preparación: '+esc(t.fasting)+'</small>':'')+(t.conditions?'<small>Condiciones de toma: '+esc(t.conditions)+'</small>':'')+(t.instructions?'<small>Indicaciones: '+esc(t.instructions)+'</small>':'')+(t.notes?'<small>Observación de no toma: '+esc(t.notes)+'</small>':'')+(t.volume?'<small>Volumen: '+esc(t.volume)+'</small>':'')+'<small>'+(t.source==='adicional'?'Adicional':'Original')+'</small></span><select onchange="hvTestStatus(\''+v.id+'\',\''+t.id+'\',this.value)"><option '+(t.status==='Pendiente'?'selected':'')+'>Pendiente</option><option '+(t.status==='Tomada'?'selected':'')+'>Tomada</option><option '+(t.status==='No tomada'?'selected':'')+'>No tomada</option></select></div>').join('');let totals={};v.tests.forEach(t=>totals[t.vessel||'Sin recipiente']=(totals[t.vessel||'Sin recipiente']||0)+1);let chips=Object.keys(totals).map(k=>'<span class="hv-chip">'+esc(k)+': <b>'+totals[k]+'</b></span>').join('');let events=v.events.map(e=>'<div class="hv-event"><b>'+esc(e.action)+'</b><small>'+esc(new Date(e.at).toLocaleString('es-PA'))+' · '+esc(e.by)+'</small><span>'+esc(e.detail)+'</span></div>').join('');return '<div class="hv-detail-head"><div><div class="eyebrow">DETALLE DEL SERVICIO</div><h2>'+esc(v.patientName)+'</h2><small>'+esc(v.id)+' · '+dateLabel(v.scheduledDate)+' · '+esc(v.scheduledTime)+'</small><div class="hv-priority-label hv-priority-'+priorityDb(v.priority)+'">Prioridad: '+priorityLabel(v.priority)+'</div></div>'+statusBadge(v.status)+'</div><div class="hv-info"><div><small>Teléfono</small><b>'+esc(v.phone||'—')+'</b></div><div><small>Responsable</small><b>'+esc(v.assignedTo||'Sin asignar')+'</b></div><div class="wide"><small>Dirección</small><b>'+esc(v.address)+'</b></div></div><div class="hv-actions">'+buttons+'</div><h3>Pruebas y recipientes</h3><div>'+(tests||'<div class="hv-empty">Este domicilio no tiene pruebas guardadas. Añádelas desde el catálogo compartido.</div>')+'</div><div class="hv-chips">'+chips+'</div><div class="hv-more"><label>Agregar pruebas adicionales</label>'+testPicker('hvMoreTests')+'<button class="btn" onclick="hvAddTests(\''+v.id+'\')">＋ Agregar pruebas</button></div><h3>Documentos adjuntos</h3><div class="hv-doc-list">'+((v.documents||[]).map(d=>'<div class="hv-doc-row"><span>📎 <b>'+esc(d.file_name)+'</b><small>'+(Number(d.file_size||0)/1024).toFixed(0)+' KB</small></span><button class="btn small" type="button" onclick="hvOpenDocument(\''+v.id+'\',\''+d.id+'\')">Abrir</button></div>').join('')||'<div class="hv-empty">No hay documentos adjuntos.</div>')+'</div><div class="hv-doc-upload"><input type="file" id="hvDocumentFile" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"><button class="btn" type="button" onclick="hvUploadDocument(\''+v.id+'\')">＋ Adjuntar documento</button><small>PDF, imágenes o Word · máximo 15 MB · archivo privado</small></div><h3>Historial de actividad</h3><div class="hv-timeline">'+(events||'Sin movimientos')+'</div>'}
function additionalPatientsPanel(v){
 const rows=v.additionalPatients||[];
 const manager=['admin','clinician','reception'].includes(cloud.role);
 const list=rows.length?rows.map(p=>'<article class="hv-additional-row"><div><b>'+esc([p.first_name,p.last_name].filter(Boolean).join(' '))+'</b><small>'+esc(p.document_number||'Sin identificación')+' · '+esc(p.phone||'Sin teléfono')+'</small><small>Estado: '+(p.status==='pending_review'?'Pendiente de revisión':p.status==='approved'?'Aprobado':'Rechazado')+'</small>'+(p.review_note?'<small>Observación: '+esc(p.review_note)+'</small>':'')+'</div>'+(manager&&p.status==='pending_review'?'<div class="hv-additional-actions"><button class="btn primary small" onclick="hvReviewAdditionalPatient(\''+p.id+'\',\'approved\')">Aprobar</button><button class="btn danger small" onclick="hvReviewAdditionalPatient(\''+p.id+'\',\'rejected\')">Rechazar</button></div>':'')+'</article>').join(''):'<div class="hv-empty">Todavía no hay pacientes adicionales registrados.</div>';
 const canAdd=cloud.role==='technician'||manager,formOpen=additionalFormOpenFor===v.id;
 return '<section class="hv-additional-panel"><div class="hv-additional-heading"><div><h3>Pacientes adicionales de esta visita</h3><p class="hv-help">Los pacientes registrados por Campo quedan pendientes de revisión. Oficina debe aprobarlos antes de incorporarlos al proceso administrativo y de facturación.</p></div>'+(canAdd?'<button class="btn primary hv-additional-toggle" type="button" aria-expanded="'+String(formOpen)+'" onclick="hvToggleAdditionalPatientForm(\''+v.id+'\')">'+(formOpen?'Cerrar formulario':'＋ Añadir paciente')+'</button>':'')+'</div>'+list+(canAdd?'<div class="hv-additional-form" '+(formOpen?'':'hidden')+'><h4>Registrar paciente adicional</h4><div class="fields"><div class="field"><label>Nombre *</label><input id="hvExtraFirst" autocomplete="given-name"></div><div class="field"><label>Apellido *</label><input id="hvExtraLast" autocomplete="family-name"></div><div class="field"><label>Cédula / documento</label><input id="hvExtraDoc"></div><div class="field"><label>Fecha de nacimiento</label><input id="hvExtraBirth" type="date"></div><div class="field"><label>Teléfono</label><input id="hvExtraPhone" type="tel"></div><div class="field"><label>Correo</label><input id="hvExtraEmail" type="email"></div><div class="field"><label>Dirección</label><input id="hvExtraAddress" autocomplete="street-address"></div><div class="field wide"><label>Pruebas solicitadas (separadas por coma)</label><input id="hvExtraTests" placeholder="Ej. Hemograma, glucosa"></div></div><button class="btn primary" onclick="hvAddAdditionalPatient(\''+v.id+'\')">Enviar paciente para revisión</button></div>':'')+'</section>';
}
function toggleAdditionalPatientForm(visitId){additionalFormOpenFor=additionalFormOpenFor===visitId?'':visitId;render();if(additionalFormOpenFor){const input=$('hvExtraFirst');if(input)input.focus()}}
window.hvToggleAdditionalPatientForm=toggleAdditionalPatientForm;
async function addAdditionalPatient(visitId){
 if(!cloud.ready||!cloud.client){say('Conecta la agenda antes de registrar pacientes adicionales.');return}
 const v=visits.find(x=>x.id===visitId);if(!v)return;
 const first=$('hvExtraFirst')?.value.trim(),last=$('hvExtraLast')?.value.trim();
 if(!first||!last){say('Completa el nombre y apellido del paciente.');return}
 try{
  const row={workspace_id:cloud.workspaceId,home_visit_id:visitId,document_number:$('hvExtraDoc').value.trim()||null,first_name:first,last_name:last,birth_date:$('hvExtraBirth').value||null,phone:$('hvExtraPhone').value.trim()||null,email:$('hvExtraEmail').value.trim()||null,address:$('hvExtraAddress').value.trim()||null,requested_tests:($('hvExtraTests').value||'').split(',').map(x=>x.trim()).filter(Boolean).map(name=>({name})),created_by:cloud.user.id,status:'pending_review'};
  const result=await cloud.client.from('home_visit_additional_patients').insert(row).select('id').single();
  if(result.error)throw result.error;
  log(v,'Paciente adicional enviado a revisión',first+' '+last);
  await loadCloudVisits();selected=visitId;additionalFormOpenFor='';render();say('Paciente adicional registrado. Quedó pendiente de revisión por Oficina.');
 }catch(e){say('No se pudo registrar el paciente adicional: '+(e.message||'error'));cloudNotice('Error al registrar paciente adicional: '+(e.message||'error'),true)}
}
async function reviewAdditionalPatient(id,status){
 if(!['admin','clinician','reception'].includes(cloud.role)){say('Solo Oficina puede revisar pacientes adicionales.');return}
 if(!['approved','rejected'].includes(status)){say('Estado de revisión no válido.');return}
 const note=status==='rejected'?prompt('Indica el motivo del rechazo:'):null;
 if(status==='rejected'&&(!note||!note.trim()))return;
 try{
  const result=await cloud.client.rpc('review_home_visit_additional_patient',{p_additional_patient_id:id,p_status:status,p_review_note:note?note.trim():null});
  if(result.error)throw result.error;
  const v=visits.find(x=>(x.additionalPatients||[]).some(p=>p.id===id));
  if(v)log(v,status==='approved'?'Paciente adicional aprobado y vinculado al expediente':'Paciente adicional rechazado',id);
  await loadCloudVisits();render();
  say(status==='approved'?'Paciente aprobado y vinculado al expediente central.':'Paciente adicional rechazado.');
 }catch(e){say('No se pudo guardar la revisión: '+(e.message||'error'));cloudNotice('Error al revisar paciente adicional: '+(e.message||'error'),true)}
}
function setTab(tab){if(!['agenda','history','calendar','create'].includes(tab))return;if(tab==='create'&&!['admin','clinician','reception'].includes(cloud.role))return;activeTab=tab;detailOpen=false;render();}
window.hvSetTab=setTab;
function render(){
  const technician=cloud.role==='technician';
  if(technician&&!selected&&visits.length)selected=visits[0].id;
  const createPanel=$('hvCreatePanel'),kpis=$('hvKpis'),detailPanel=$('hvDetail'),calendarPanel=$('hvCalendar')?.closest('.hv-calendar-panel'),agendaPanel=$('hvAgendaPanel');
  const manager=['admin','clinician','reception'].includes(cloud.role);
  if(technician&&activeTab==='create')activeTab='agenda';
  const historyPanel=$('hvHistoryPanel');
  document.querySelectorAll('#hvWorkspace [data-hv-tab]').forEach(button=>{
    const tab=button.dataset.hvTab;
    button.hidden=tab==='create'&&(!manager||technician);
    button.classList.toggle('active',tab===activeTab);
    button.setAttribute('aria-selected',String(tab===activeTab));
  });
  if(createPanel)createPanel.hidden=technician||!manager||activeTab!=='create';
  if(agendaPanel)agendaPanel.hidden=activeTab!=='agenda';
  if(detailPanel)detailPanel.hidden=activeTab!=='agenda'||!detailOpen;
  if(historyPanel)historyPanel.hidden=activeTab!=='history';
  if(calendarPanel)calendarPanel.hidden=activeTab!=='calendar';
  if(kpis)kpis.hidden=technician;
  if(agendaPanel){const heading=agendaPanel.querySelector('h2');if(heading)heading.textContent=technician?'Mis domicilios':'Agenda y seguimiento';}
  if(calendarPanel){const heading=calendarPanel.querySelector('h2');if(heading)heading.textContent=technician?'Mi calendario':'Calendario de domicilios';}
  const q=($('hvSearch').value||'').toLowerCase(),date=$('hvFilterDate').value||'',st=$('hvFilterStatus').value||'';
  const normalizeSearch=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim();
  const matches=v=>(!q||normalizeSearch([v.patientName,v.document,v.id,v.address,v.assignedTo].join(' ')).includes(normalizeSearch(q)))&&(!date||v.scheduledDate===date)&&(!st||v.status===st);
  const historyQuery=normalizeSearch($('hvHistorySearch')?.value||''),historyDate=$('hvHistoryDate')?.value||'';
  const historyMatches=v=>(!historyQuery||normalizeSearch([v.patientName,v.document,v.id,v.address,v.assignedTo].join(' ')).includes(historyQuery))&&(!historyDate||v.scheduledDate===historyDate);
  const historyStatuses=['Finalizado','Rechazado','Cancelado','No realizado','Paciente ausente','Paciente rechazó la toma'];
  const sortVisits=(a,b)=>priorityRank(a.priority)-priorityRank(b.priority)||a.scheduledDate.localeCompare(b.scheduledDate)||a.scheduledTime.localeCompare(b.scheduledTime)||String(b.createdAtDb||b.createdAt||'').localeCompare(String(a.createdAtDb||a.createdAt||''));
  const activeList=visits.filter(v=>!historyStatuses.includes(v.status)&&matches(v)).sort(sortVisits);
  const historyList=visits.filter(v=>historyStatuses.includes(v.status)&&historyMatches(v)).sort((a,b)=>b.scheduledDate.localeCompare(a.scheduledDate)||b.scheduledTime.localeCompare(a.scheduledTime));
  const todayList=visits.filter(v=>v.scheduledDate===today());
  if(kpis)kpis.innerHTML=[['Hoy',todayList.length],['Pendientes',visits.filter(v=>['Pendiente de asignación','Pendiente de aceptación'].includes(v.status)).length],['En proceso',visits.filter(v=>['Aceptado','En camino','En domicilio'].includes(v.status)).length],['Finalizados',visits.filter(v=>v.status==='Finalizado').length]].map(x=>'<div class="hv-kpi"><small>'+x[0]+'</small><b>'+x[1]+'</b></div>').join('');
  const rowHtml=v=>{const privatePending=technician&&v.assignmentStatus==='invited'&&v.status==='Pendiente de aceptación';return '<button class="hv-visit '+(selected===v.id?'selected':'')+'" onclick="hvSelect(\''+v.id+'\')"><span><b>'+(privatePending?'Nuevo domicilio asignado':esc(v.patientName))+'</b><small>'+dateLabel(v.scheduledDate)+' · '+esc(v.scheduledTime)+' · '+(privatePending?'Requiere tu respuesta':esc(v.assignedTo||'Sin asignar'))+'</small><small class="hv-priority-label hv-priority-'+priorityDb(v.priority)+'">Prioridad: '+priorityLabel(v.priority)+'</small>'+(privatePending?'':'<small>'+esc(v.address)+'</small>')+'</span>'+statusBadge(v.status)+'</button>'};
  $('hvRows').innerHTML=activeList.length?activeList.map(rowHtml).join(''):'<div class="hv-empty">No hay domicilios activos para estos filtros.</div>';
  const historyHost=$('hvHistoryRows');if(historyHost)historyHost.innerHTML=historyList.length?historyList.map(rowHtml).join(''):'<div class="hv-empty">Todavía no hay domicilios en el historial.</div>';
  const historyCount=$('hvHistoryCount');if(historyCount)historyCount.textContent=String(historyList.length);
  const historyTabCount=$('hvHistoryTabCount');if(historyTabCount)historyTabCount.textContent=String(historyList.length);
  const exportButton=document.querySelector('#view-domicilios .heading-actions button');if(exportButton)exportButton.hidden=technician;
  const activeVisit=visits.find(v=>v.id===selected);
  const existingDetailModal=document.querySelector('body > .hv-detail-backdrop');
  if(activeVisit&&detailOpen&&['agenda','history'].includes(activeTab)){
    const dialogMarkup='<button type="button" class="hv-detail-close" onclick="hvCloseDetail()" aria-label="Cerrar detalles">×</button>'+detail(activeVisit)+additionalPatientsPanel(activeVisit);
    if(existingDetailModal){
      const existingDialog=existingDetailModal.querySelector('.hv-detail-dialog');
      if(existingDialog)existingDialog.innerHTML=dialogMarkup;
    }else if(detailPanel){
      detailPanel.innerHTML='<div class="hv-detail-backdrop" onclick="hvCloseDetail(event)" role="presentation"><section class="hv-detail-dialog" role="dialog" aria-modal="true" aria-label="Detalle y seguimiento del domicilio" onclick="event.stopPropagation()">'+dialogMarkup+'</section></div>';
      const detailBackdrop=detailPanel.querySelector('.hv-detail-backdrop');
      if(detailBackdrop)document.body.appendChild(detailBackdrop);
    }
    if(detailPanel)detailPanel.hidden=true;
  }else{
    if(existingDetailModal)existingDetailModal.remove();
    if(detailPanel)detailPanel.innerHTML='';
  }
  portalAssignmentOverlay();
  let moreSearch=$('hvMoreTestsSearch');if(moreSearch){if(!moreSearch.dataset.bound){moreSearch.addEventListener('input',()=>{drawTestPicker('hvMoreTests',moreSearch.value,true);clearTimeout(serviceSearchTimer);serviceSearchTimer=setTimeout(()=>refreshCentralCatalogForSearch('hvMoreTests',moreSearch.value),280)});moreSearch.addEventListener('focus',()=>refreshCentralCatalogForSearch('hvMoreTests',moreSearch.value));moreSearch.dataset.bound='1'}drawTestPicker('hvMoreTests',moreSearch.value)}
  renderCalendar();
}
async function uploadVisitDocument(id){if(!cloud.ready||!cloud.client){say('Conecta la agenda antes de adjuntar documentos.');return}const v=visits.find(x=>x.id===id),input=$('hvDocumentFile'),file=input&&input.files&&input.files[0];if(!v||!file){say('Selecciona primero un documento.');return}const allowed=['application/pdf','image/jpeg','image/png','image/webp','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];if(file.size>15*1024*1024){say('El documento supera el límite de 15 MB.');return}const ext=(file.name.split('.').pop()||'').toLowerCase(),mimeByExt={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},mime=file.type||mimeByExt[ext];if(!allowed.includes(mime)||!mimeByExt[ext]){say('Formato no permitido. Adjunta PDF, JPG, PNG, WEBP o Word.');return}const safeName=file.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-100)||'documento',path=cloud.workspaceId+'/'+v.id+'/'+crypto.randomUUID()+'_'+safeName;try{const up=await cloud.client.storage.from('home-visit-documents').upload(path,file,{contentType:mime,upsert:false});if(up.error)throw up.error;const saved=await cloud.client.from('home_visit_documents').insert({workspace_id:cloud.workspaceId,home_visit_id:v.id,file_name:file.name,storage_path:path,mime_type:file.type,file_size:file.size}).select('id').single();if(saved.error){await cloud.client.storage.from('home-visit-documents').remove([path]);throw saved.error}input.value='';await loadCloudVisits();selected=id;render();say('Documento adjuntado correctamente.')}catch(e){cloudNotice('No se pudo adjuntar el documento: '+(e.message||'Error desconocido'),true);say('No se pudo adjuntar el documento: '+(e.message||'Error desconocido'))}}
async function openVisitDocument(visitId,documentId){const v=visits.find(x=>x.id===visitId),d=v&&(v.documents||[]).find(x=>x.id===documentId);if(!d)return;const popup=window.open('about:blank','_blank');try{const result=await cloud.client.storage.from('home-visit-documents').createSignedUrl(d.storage_path,90);if(result.error)throw result.error;if(popup)popup.location.href=result.data.signedUrl;else window.location.href=result.data.signedUrl}catch(e){if(popup)popup.close();say('No se pudo abrir el documento: '+(e.message||'Error desconocido'))}}
function exportCsv(){let rows=[['Código','Paciente','Documento','Teléfono','Fecha','Hora','Prioridad','Dirección','Responsable','Estado','Pruebas'],...visits.map(v=>[v.id,v.patientName,v.document,v.phone,v.scheduledDate,v.scheduledTime,priorityLabel(v.priority),v.address,v.assignedTo,v.status,v.tests.map(t=>t.name+' - '+t.status+(t.notes?' ('+t.notes+')':'' )).join('; ')] )],csv=rows.map(r=>r.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(',')).join('\r\n'),blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='FleboReport-domicilios-'+today()+'.csv';a.click();URL.revokeObjectURL(url)}

function calendarDateKey(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function calendarVisits(){const source=cloud.role==='technician'?visits.filter(v=>v.assignedUserId===cloud.user?.id):visits;return source}
function renderCalendar(){
 const host=$('hvCalendar');if(!host)return;
 const year=calendarMonth.getFullYear(),month=calendarMonth.getMonth();
 const monthTitle=new Intl.DateTimeFormat('es-PA',{month:'long',year:'numeric'}).format(calendarMonth);
 const first=new Date(year,month,1),offset=(first.getDay()+6)%7,start=new Date(year,month,1-offset);
 const all=calendarVisits(),days=[];
 for(let i=0;i<42;i++){const d=new Date(start.getFullYear(),start.getMonth(),start.getDate()+i),key=calendarDateKey(d),items=all.filter(v=>v.scheduledDate===key);days.push({d,key,items})}
 const weekdays=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
 const cells=days.map(x=>'<button type="button" class="hv-cal-day '+(x.d.getMonth()!==month?'outside ':'')+(x.key===calendarSelectedDate?'selected ':'')+(x.key===today()?'today':'')+'" onclick="hvCalendarSelect(\''+x.key+'\')"><span>'+x.d.getDate()+'</span>'+(x.items.length?'<small>'+x.items.length+' domicilio(s)</small>':'')+'</button>').join('');
 const selected=all.filter(v=>v.scheduledDate===calendarSelectedDate).sort((a,b)=>a.scheduledTime.localeCompare(b.scheduledTime));
 const agenda=selected.length?selected.map(v=>'<button type="button" class="hv-cal-event" onclick="hvCalendarVisit(\''+v.id+'\')"><span><b>'+esc(v.scheduledTime)+' · '+esc(v.patientName||'Paciente')+'</b><small class="hv-priority-label hv-priority-'+priorityDb(v.priority)+'">Prioridad: '+priorityLabel(v.priority)+'</small><small>'+esc(v.assignedTo||'Sin asignar')+' · '+esc(v.address||'')+'</small></span>'+statusBadge(v.status)+'</button>').join(''):'<div class="hv-empty">No hay domicilios programados para esta fecha.</div>';
 host.innerHTML='<div class="hv-cal-head"><div><h2>Calendario de domicilios</h2><p>'+(cloud.role==='technician'?'Tus domicilios asignados para realizar':'Programación de domicilios del equipo')+'</p></div><div class="hv-cal-nav"><button type="button" class="btn" onclick="hvCalendarMove(-1)" aria-label="Mes anterior">‹</button><b>'+esc(monthTitle)+'</b><button type="button" class="btn" onclick="hvCalendarMove(1)" aria-label="Mes siguiente">›</button><button type="button" class="btn" onclick="hvCalendarToday()">Hoy</button></div></div><div class="hv-cal-grid">'+weekdays.map(x=>'<div class="hv-cal-weekday">'+x+'</div>').join('')+cells+'</div><div class="hv-cal-agenda"><h3>'+esc(new Intl.DateTimeFormat('es-PA',{dateStyle:'full'}).format(new Date(calendarSelectedDate+'T12:00:00')))+' · '+selected.length+' domicilio(s)</h3>'+agenda+'</div>';
}
function calendarMove(delta){calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+delta,1);renderCalendar()}
function calendarSelect(date){calendarSelectedDate=date;const d=new Date(date+'T12:00:00');calendarMonth=new Date(d.getFullYear(),d.getMonth(),1);renderCalendar()}
function calendarToday(){calendarSelectedDate=today();calendarMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);renderCalendar()}
function calendarVisit(id){selected=id;activeTab='agenda';render()}
window.hvCalendarMove=calendarMove;window.hvCalendarSelect=calendarSelect;window.hvCalendarToday=calendarToday;window.hvCalendarVisit=calendarVisit;
function mount(){let main=document.querySelector('main.content');if(!main)return;let view=document.createElement('section');view.id='view-domicilios';view.className='view';view.innerHTML='<div class="page-heading"><div><div class="eyebrow">ATENCIÓN EXTRAMUROS</div><h1>Agenda de domicilios</h1><p>Programa visitas, asigna flebotomistas y controla la toma de muestras.</p></div><div class="heading-actions"><button class="btn" onclick="hvExport()">Exportar CSV</button></div></div><div class="hv-notice" id="hvConnectionNotice">Conectando la agenda de domicilios con Supabase…</div><nav class="hv-module-tabs" aria-label="Secciones de domicilios"><button type="button" class="hv-module-tab active" data-hv-tab="agenda" aria-selected="true" onclick="hvSetTab(this.dataset.hvTab)">Agenda y seguimiento</button><button type="button" class="hv-module-tab" data-hv-tab="history" aria-selected="false" onclick="hvSetTab(this.dataset.hvTab)">Historial <span class="hv-history-count" id="hvHistoryTabCount">0</span></button><button type="button" class="hv-module-tab" data-hv-tab="calendar" aria-selected="false" onclick="hvSetTab(this.dataset.hvTab)">Calendario</button><button type="button" class="hv-module-tab" data-hv-tab="create" aria-selected="false" onclick="hvSetTab(this.dataset.hvTab)" id="hvCreateTab">＋ Crear domicilio</button></nav><style>.hv-calendar-panel{margin:14px 0;padding:16px}.hv-cal-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px}.hv-cal-head h2{margin:0;color:#183d56;font-size:17px}.hv-cal-head p{margin:4px 0 0;color:#718596;font-size:12px}.hv-cal-nav{display:flex;align-items:center;gap:8px}.hv-cal-nav>b{text-transform:capitalize;min-width:130px;text-align:center;color:#28495f}.hv-cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}.hv-cal-weekday{text-align:center;color:#718596;font-size:11px;font-weight:800;padding:6px 0}.hv-cal-day{min-height:62px;border:1px solid #e0eaf0;border-radius:9px;background:#fff;padding:7px;text-align:left;color:#24445a;display:flex;flex-direction:column;gap:5px}.hv-cal-day.outside{opacity:.38}.hv-cal-day.today{border-color:#62b6aa;background:#f1faf8}.hv-cal-day.selected{border:2px solid #13877d;background:#eaf8f5}.hv-cal-day>span{font-weight:800;font-size:12px}.hv-cal-day small{font-size:9px;color:#087a70;font-weight:750}.hv-cal-agenda{margin-top:15px;border-top:1px solid #e6edf1;padding-top:12px}.hv-cal-agenda h3{font-size:13px;color:#28495f;text-transform:capitalize;margin:0 0 9px}.hv-cal-event{width:100%;display:flex;justify-content:space-between;align-items:center;gap:10px;text-align:left;padding:10px;border:1px solid #e0eaf0;border-radius:9px;background:#fbfdfe;margin:5px 0}.hv-cal-event>span{display:grid;gap:4px;min-width:0}.hv-cal-event small{color:#718596;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hv-cal-event .hv-status{white-space:nowrap}@media(max-width:650px){.hv-calendar-panel{padding:10px}.hv-cal-grid{gap:3px}.hv-cal-day{min-height:50px;padding:5px 4px}.hv-cal-day small{font-size:8px}.hv-cal-nav{width:100%;justify-content:space-between}.hv-cal-nav>b{min-width:0}.hv-cal-event{align-items:flex-start;flex-direction:column}}</style><div id="hvKpis" class="hv-kpis"></div><section class="panel hv-calendar-panel"><div id="hvCalendar"></div></section><div class="hv-layout"><section class="panel form-panel" id="hvCreatePanel"><h2>Crear domicilio</h2><div class="fields"><div class="field full"><label for="hvPatientLookup">Buscar paciente por cédula o nombre</label><div class="hv-patient-lookup"><input id="hvPatientLookup" autocomplete="off" placeholder="Escribe cédula o nombre del paciente"><button type="button" class="btn" id="hvFindPatient">Buscar</button></div><small id="hvPatientLookupStatus" class="hv-professional-hint">Busca el expediente antes de registrar un paciente nuevo.</small><div id="hvPatientHistory" class="hv-patient-history" hidden></div><input type="hidden" id="hvPatientId"></div><div class="field"><label>Nombre del paciente *</label><input id="hvName" placeholder="Nombre completo"></div><div class="field"><label>Documento / cédula</label><input id="hvDoc" autocomplete="off" placeholder="Identificación"></div><div class="field"><label>Fecha de nacimiento</label><input id="hvBirthDate" type="date"></div><div class="field"><label>Sexo</label><select id="hvSex"><option value="">Sin especificar</option><option>Femenino</option><option>Masculino</option><option>Otro</option><option>Prefiere no indicar</option></select></div><div class="field"><label>Teléfono</label><input id="hvPhone" type="tel" placeholder="+507..."></div><div class="field"><label>Correo electrónico</label><input id="hvEmail" type="email" placeholder="correo@ejemplo.com"></div><div class="field"><label>Fecha *</label><input id="hvDate" type="date" value="'+today()+'"></div><div class="field"><label>Hora *</label><input id="hvTime" type="time" value="08:00"></div><div class="field"><label for="hvPriority">Prioridad del domicilio *</label><select id="hvPriority" required><option value="normal" selected>Normal</option><option value="high">Prioritario</option><option value="urgent">Urgente</option></select><small class="hv-professional-hint">Se mostrará al flebotomista antes de aceptar.</small></div><div class="field full"><label>Dirección completa *</label><textarea id="hvAddress" placeholder="Provincia, distrito, corregimiento, calle, casa y referencias"></textarea></div><div class="field"><label>Flebotomista asignado</label><div class="hv-professional-picker"><input id="hvAssignee" autocomplete="off" placeholder="Escribe el nombre del flebotomista"><div id="hvProfessionalResults" class="hv-professional-results" role="listbox" hidden></div></div><small id="hvProfessionalHint" class="hv-professional-hint">Escribe para buscar entre los flebotomistas registrados.</small></div><div class="field"><label>WhatsApp del flebotomista</label><input id="hvAssigneePhone" type="tel" placeholder="507XXXXXXXX"></div><div class="field full"><label>Pruebas solicitadas *</label>'+testPicker('hvTests')+'</div></div><div class="form-actions"><button class="btn primary" onclick="hvCreate()">Guardar domicilio</button><button class="btn" onclick="hvReset()">Limpiar</button></div><p class="hv-help">Puedes registrar varios domicilios el mismo día o programar fechas futuras.</p></section><section class="panel form-panel" id="hvAgendaPanel"><h2>Agenda y seguimiento</h2><div class="fields"><div class="field"><label>Buscar</label><input id="hvSearch" placeholder="Paciente, código o dirección"></div><div class="field"><label>Fecha</label><input id="hvFilterDate" type="date" value=""></div><div class="field full"><label>Estado</label><select id="hvFilterStatus"><option value="">Todos los estados</option>'+['Pendiente de asignación','Pendiente de aceptación','Aceptado','En camino','En domicilio','Muestras tomadas','Finalizado','Rechazado','Cancelado','Reprogramado','No realizado','Paciente ausente','Paciente rechazó la toma'].map(x=>'<option>'+x+'</option>').join('')+'</select></div></div><div id="hvRows" class="hv-visit-list"></div></section></div><section class="panel form-panel hv-history-panel" id="hvHistoryPanel"><div class="hv-section-heading"><div><h2>Historial de domicilios</h2><p>Busca por cédula o nombre, o filtra por la fecha programada.</p></div><span class="hv-history-count" id="hvHistoryCount">0</span></div><div class="fields hv-history-filters"><div class="field"><label for="hvHistorySearch">Buscar paciente</label><input id="hvHistorySearch" type="search" autocomplete="off" placeholder="Cédula o nombre del paciente"></div><div class="field"><label for="hvHistoryDate">Fecha del domicilio</label><input id="hvHistoryDate" type="date"></div></div><div id="hvHistoryRows" class="hv-visit-list"></div></section><section class="panel form-panel hv-detail-panel" id="hvDetail"><div class="hv-empty">Selecciona un domicilio.</div></section>';const workspace=document.createElement('div');workspace.id='hvWorkspace';while(view.children.length>1)workspace.appendChild(view.children[1]);view.appendChild(workspace);
const hvLayout=workspace.querySelector('.hv-layout'),hvCreate=workspace.querySelector('#hvCreatePanel'),hvAgenda=workspace.querySelector('#hvAgendaPanel'),hvCalendar=workspace.querySelector('.hv-calendar-panel');
if(hvLayout)hvLayout.style.display='contents';
if(hvCreate&&hvCalendar)workspace.insertBefore(hvCreate,hvCalendar);
if(hvAgenda&&hvCalendar)workspace.insertBefore(hvAgenda,hvCalendar);
if(!document.getElementById('hv-responsive-agenda-v2')){
 const style=document.createElement('style');style.id='hv-responsive-agenda-v2';
 style.textContent='.hv-priority-label{display:inline-flex;align-items:center;gap:5px;width:max-content;max-width:100%;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:800;line-height:1.3}.hv-priority-urgent{background:#fff0ed;color:#b42318;border:1px solid #f3b5ad}.hv-priority-high{background:#fff6df;color:#8a5700;border:1px solid #efd18a}.hv-priority-normal{background:#edf3f7;color:#476174;border:1px solid #d5e0e8}#hvWorkspace{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:start}#hvWorkspace>.hv-notice,#hvWorkspace>.hv-push-panel,#hvWorkspace>#hvKpis,#hvWorkspace>.hv-calendar-panel,#hvWorkspace>.hv-detail-panel{grid-column:1/-1}#hvWorkspace>#hvCreatePanel,#hvWorkspace>#hvAgendaPanel{min-width:0;margin:0}#hvWorkspace .hv-layout{display:contents!important}#hvWorkspace .hv-visit-list{display:grid;gap:8px}#hvWorkspace .hv-history-details{margin-top:14px;border-top:1px solid #e3ebf0;padding-top:12px}#hvWorkspace .hv-history-details>summary{display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;list-style:none;font-weight:800;color:#31536a;padding:8px 2px}#hvWorkspace .hv-history-details>summary::-webkit-details-marker{display:none}#hvWorkspace .hv-history-count{display:inline-flex;align-items:center;justify-content:center;min-width:25px;height:25px;border-radius:20px;background:#edf3f7;color:#35556b;font-size:12px;padding:0 7px}#hvWorkspace .hv-history-details[open] #hvHistoryRows{margin-top:10px}#hvWorkspace [hidden]{display:none!important}@media(max-width:900px){#hvWorkspace{grid-template-columns:minmax(0,1fr)}}@media(max-width:650px){#hvWorkspace{gap:10px}#hvWorkspace>#hvCreatePanel,#hvWorkspace>#hvAgendaPanel,#hvWorkspace>.hv-calendar-panel{padding:12px}#hvWorkspace .hv-visit{align-items:flex-start;gap:8px;padding:11px}#hvWorkspace .hv-visit>span{min-width:0;overflow-wrap:anywhere}#hvWorkspace .hv-history-details>summary{min-height:42px}}';
 style.textContent+='.hv-detail-backdrop{position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;padding:22px;background:rgba(10,28,42,.66);}.hv-detail-dialog{position:relative;width:min(920px,96vw);max-height:min(90vh,900px);overflow:auto;padding:24px;border:1px solid #dce8ed;border-radius:18px;background:#fff;box-shadow:0 24px 80px #071b2b55;overscroll-behavior:contain}.hv-detail-close{position:sticky;top:0;float:right;z-index:2;display:flex;align-items:center;justify-content:center;width:40px;height:40px;margin:-10px -10px 8px 12px;border:1px solid #dce7ed;border-radius:50%;background:#fff;color:#25465c;font-size:27px;line-height:1;cursor:pointer}.hv-detail-close:hover{background:#edf5f7}.hv-detail-dialog .hv-detail-head{padding-right:38px}.hv-detail-dialog .hv-timeline{max-height:260px;overflow:auto}@media(max-width:700px){.hv-detail-backdrop{align-items:flex-end;padding:0}.hv-detail-dialog{width:100%;max-height:94dvh;max-height:94vh;border-radius:20px 20px 0 0;padding:18px 14px calc(20px + env(safe-area-inset-bottom));}.hv-detail-close{width:42px;height:42px;margin:-5px -3px 8px 10px}.hv-detail-dialog .hv-detail-head{padding-right:42px}.hv-detail-dialog .hv-info{grid-template-columns:1fr}.hv-detail-dialog .hv-info .wide{grid-column:auto}}';style.textContent+="#hvWorkspace>.hv-module-tabs{grid-column:1/-1;order:-2;display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 2px;padding:5px;border:1px solid #e1eaf0;border-radius:14px;background:#f7fafc}#hvWorkspace>.hv-module-tabs .hv-module-tab{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:9px 14px;border:1px solid transparent;border-radius:10px;background:transparent;color:#456176;font-weight:750;cursor:pointer}#hvWorkspace>.hv-module-tabs .hv-module-tab.active{background:#fff;color:#126f69;border-color:#cfe4e0;box-shadow:0 1px 3px #17394a12}#hvWorkspace>#hvKpis{order:-1}#hvWorkspace>#hvAgendaPanel{grid-column:1;order:1}#hvWorkspace>.hv-detail-panel{grid-column:2;order:2;position:sticky;top:12px;max-height:calc(100vh - 28px);overflow:auto}#hvWorkspace>#hvCreatePanel{grid-column:1/-1;order:3}#hvWorkspace>.hv-history-panel{grid-column:1/-1;order:4}#hvWorkspace>.hv-calendar-panel{grid-column:1/-1;order:5}#hvWorkspace .hv-section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}#hvWorkspace .hv-section-heading h2{margin:0}#hvWorkspace .hv-section-heading p{margin:5px 0 0;color:#718596;font-size:13px}#hvWorkspace>#hvAgendaPanel[hidden],#hvWorkspace>.hv-detail-panel[hidden],#hvWorkspace>#hvCreatePanel[hidden],#hvWorkspace>.hv-history-panel[hidden],#hvWorkspace>.hv-calendar-panel[hidden]{display:none!important}#hvWorkspace .hv-detail-panel{min-width:0}#hvWorkspace .hv-detail-panel .hv-info{grid-template-columns:repeat(2,minmax(0,1fr))}#hvWorkspace .hv-detail-panel .hv-info .wide{grid-column:1/-1}@media(max-width:900px){#hvWorkspace>#hvAgendaPanel{grid-column:1/-1;order:1}#hvWorkspace>.hv-detail-panel{grid-column:1/-1;order:2;position:static;max-height:none;overflow:visible}#hvWorkspace>#hvCreatePanel,#hvWorkspace>.hv-history-panel,#hvWorkspace>.hv-calendar-panel{grid-column:1/-1}#hvWorkspace>.hv-module-tabs{overflow-x:auto;flex-wrap:nowrap}#hvWorkspace>.hv-module-tabs .hv-module-tab{white-space:nowrap}}";
 document.head.appendChild(style);
}
main.appendChild(view);window.dispatchEvent(new Event('flebo:domicilios-mounted'));let p=document.querySelector('[data-nav="patients"]');if(p&&!document.querySelector('[data-nav="domicilios"]')){let n=document.createElement('button');n.type='button';n.dataset.nav='domicilios';n.innerHTML='<span>⌂</span>Domicilios';n.onclick=()=>window.navigate('domicilios');p.parentNode.insertBefore(n,p.nextSibling)}const lookupPatient=async()=>{const q=$('hvPatientLookup').value.trim()||$('hvDoc').value.trim();const status=$('hvPatientLookupStatus');if(!q){status.textContent='Escribe una cédula o nombre para buscar.';return}if(!cloud.ready||!cloud.client){status.textContent='La conexión con el laboratorio aún no está lista.';return}status.textContent='Buscando expediente…';try{const result=await cloud.client.rpc('search_workspace_patients',{p_workspace_id:cloud.workspaceId,p_query:q});if(result.error)throw result.error;const rows=result.data?(Array.isArray(result.data)?result.data:[result.data]):[];if(rows.length===1){const p=rows[0],data=p.app_data||{},attentions=Array.isArray(data.attentions)?data.attentions:[],journeys=Array.isArray(data.journeyHistory)?data.journeyHistory:[];$('hvPatientId').value=p.id;$('hvName').value=[p.first_name,p.last_name].filter(Boolean).join(' ');$('hvDoc').value=p.document_number||'';$('hvBirthDate').value=p.birth_date||'';$('hvSex').value=p.sex||'';$('hvPhone').value=p.phone||'';$('hvEmail').value=p.email||'';$('hvAddress').value=p.address||'';let homeRows=[];try{const resultVisits=await cloud.client.from('home_visits').select('id,scheduled_at,address,status').eq('workspace_id',cloud.workspaceId).eq('patient_id',p.id).order('scheduled_at',{ascending:false}).limit(20);if(resultVisits.error)throw resultVisits.error;homeRows=resultVisits.data||[]}catch(e){console.warn('No se pudo cargar el historial de domicilios:',e)}const dateLabel=v=>{if(!v)return'Fecha no registrada';try{return new Intl.DateTimeFormat('es-PA',{dateStyle:'medium',timeZone:'America/Panama'}).format(new Date(v))}catch(_){return String(v)}};const statusLabel=v=>({'pending_assignment':'Pendiente de asignación','pending_acceptance':'Pendiente de aceptación','accepted':'Aceptado','on_the_way':'En camino','arrived':'En domicilio','samples_collected':'Muestras tomadas','completed':'Finalizado','rejected':'Rechazado','cancelled':'Cancelado','rescheduled':'Reprogramado','not_done':'No realizado'}[v]||v||'Sin estado');const attentionHtml=attentions.length?attentions.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).map(a=>'<article class="hv-patient-history-item"><b>'+esc(a.type||'Atención médica')+' · '+esc(dateLabel(a.date))+'</b><small>Profesional: '+esc(a.professional||'No registrado')+'</small>'+(a.reason?'<p><b>Motivo:</b> '+esc(a.reason)+'</p>':'')+((a.tests||[]).length?'<div class="hv-patient-history-tests">'+a.tests.map(t=>'<span>'+esc(t.name||t.testName||'Prueba')+(t.result?' · Resultado: '+esc(t.result):'')+(t.status?' · '+esc(t.status):'')+'</span>').join('')+'</div>':'')+(a.notes?'<p><b>Observaciones:</b> '+esc(a.notes)+'</p>':'')+(a.conclusions?'<p><b>Conclusiones:</b> '+esc(a.conclusions)+'</p>':'')+'</article>').join(''):'<small>Sin atenciones médicas registradas en el expediente sincronizado.</small>';const journeyHtml=journeys.length?journeys.slice().sort((a,b)=>String(b.journeyDate||'').localeCompare(String(a.journeyDate||''))).map(j=>'<article class="hv-patient-history-item"><b>Jornada · '+esc(dateLabel(j.journeyDate||j.date))+'</b><small>'+(Array.isArray(j.testIds)?j.testIds.length:0)+' pruebas asociadas · '+esc(j.status||'Registro de jornada')+'</small></article>').join(''):'<small>Sin jornadas previas registradas en el expediente sincronizado.</small>';const homeHtml=homeRows.length?homeRows.map(v=>'<article class="hv-patient-history-item"><b>Domicilio · '+esc(dateLabel(v.scheduled_at))+'</b><small>'+esc(statusLabel(v.status))+'</small><p>'+esc(v.address||'Sin dirección registrada')+'</p></article>').join(''):'<small>Sin domicilios previos vinculados a este paciente.</small>';const history=$('hvPatientHistory');if(history){history.hidden=false;history.innerHTML='<div class="hv-patient-history-head"><b>Expediente central encontrado</b><span>Información sincronizada</span></div><div class="hv-patient-history-grid"><span><b>'+attentions.length+'</b><small>Atenciones médicas</small></span><span><b>'+journeys.length+'</b><small>Registros de jornada</small></span><span><b>'+homeRows.length+'</b><small>Domicilios recientes</small></span></div><div class="hv-patient-history-section"><b>Datos del expediente</b><p>'+esc([data.company?'Empresa: '+data.company:'',data.emergency?'Contacto de emergencia: '+data.emergency:'',data.emergencyPhone?'Teléfono de emergencia: '+data.emergencyPhone:''].filter(Boolean).join(' · ')||'Sin datos adicionales del expediente.')+'</p>'+(data.generalNotes||data.notes?'<p><b>Notas generales:</b> '+esc(data.generalNotes||data.notes)+'</p>':'')+'</div><details class="hv-patient-history-details" open><summary>Historial de atenciones médicas</summary>'+attentionHtml+'</details><details class="hv-patient-history-details"><summary>Historial de jornadas</summary>'+journeyHtml+'</details><details class="hv-patient-history-details"><summary>Historial de domicilios</summary>'+homeHtml+'</details><small>El domicilio actual quedará vinculado al mismo expediente central.</small>'}status.textContent='Expediente encontrado. Se vinculará al domicilio.'}else if(rows.length>1){status.textContent='Se encontraron varios resultados. Refina la búsqueda con la cédula completa.'}else{$('hvPatientId').value='';if(/^[0-9A-Za-z-]{4,}$/.test(q)&&!q.includes(' '))$('hvDoc').value=q;status.textContent='No existe un expediente con esos datos. Completa la información y se creará al guardar el domicilio.'}}catch(e){status.textContent='No se pudo buscar el paciente: '+(e.message||'Error');}};$('hvFindPatient').addEventListener('click',lookupPatient);$('hvPatientLookup').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();lookupPatient()}});$('hvDoc').addEventListener('change',()=>{if($('hvDoc').value.trim()){$('hvPatientLookup').value=$('hvDoc').value.trim();lookupPatient()}});bindProfessionalPicker();['hvSearch','hvFilterDate','hvFilterStatus','hvHistorySearch','hvHistoryDate'].forEach(id=>{$(id).oninput=render;$(id).onchange=render});$('hvDate').min=today();['hvTests','hvMoreTests'].forEach(prefix=>{let input=$(prefix+'Search'),host=$(prefix+'Choices'),dropdown=$(prefix+'Dropdown');if(input){input.addEventListener('focus',()=>drawTestPicker(prefix,input.value,true));input.addEventListener('input',()=>drawTestPicker(prefix,input.value,true));input.addEventListener('keydown',e=>{if(e.key==='Escape'&&dropdown){dropdown.hidden=true;input.setAttribute('aria-expanded','false')}})}if(host)host.dataset.bound='1'});document.addEventListener('click',e=>{let add=e.target.closest('[data-add-test]');if(add){toggleTest(add.dataset.prefix,add.dataset.addTest);return}let remove=e.target.closest('[data-remove-test]');if(remove){let prefix=remove.dataset.prefix,ids=prefix==='hvTests'?newTestSelection:moreTestSelection;let at=ids.indexOf(remove.dataset.removeTest);if(at>=0)ids.splice(at,1);drawTestPicker(prefix,$(prefix+'Search')?.value||'',false)}});document.addEventListener('click',e=>{['hvTests','hvMoreTests'].forEach(prefix=>{let wrap=document.querySelector('#'+prefix+'Search')?.closest('.hv-test-picker'),dropdown=$(prefix+'Dropdown'),input=$(prefix+'Search');if(wrap&&dropdown&&!wrap.contains(e.target)){dropdown.hidden=true;if(input)input.setAttribute('aria-expanded','false')}})});drawTestPicker('hvTests','');render();syncPushActivationUI();connectCloud()}
function bindProfessionalPicker(){
 const input=$('hvAssignee'),results=$('hvProfessionalResults'),hint=$('hvProfessionalHint');
 if(!input||!results||input.dataset.professionalBound==='1')return;
 input.dataset.professionalBound='1';
 const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim();
 if(!document.getElementById('hvProfessionalPickerStyles')){
  const style=document.createElement('style');style.id='hvProfessionalPickerStyles';
  style.textContent='.hv-professional-picker{position:relative}.hv-professional-results{position:absolute;z-index:9999;top:calc(100% + 5px);left:0;right:0;max-height:260px;overflow:auto;background:#fff;border:1px solid #cbd8e2;border-radius:12px;box-shadow:0 12px 28px #16324a26;padding:6px}.hv-professional-results[hidden]{display:none!important}.hv-professional-option{display:flex;flex-direction:column;gap:3px;width:100%;padding:11px 12px;border:0;border-radius:8px;background:#fff;color:#18344b;text-align:left;cursor:pointer}.hv-professional-option:hover,.hv-professional-option:focus{background:#edf6fb;outline:2px solid #9bcde2}.hv-professional-option small{font-size:11px;color:#60788a}.hv-professional-empty{padding:12px;color:#526b7e;font-size:13px}';
  document.head.appendChild(style);
 }
 let directory=null,directoryPromise=null;
 const loadDirectory=async()=>{
  if(directory)return directory;
  if(directoryPromise)return directoryPromise;
  directoryPromise=(async()=>{
   const {data,error}=await cloud.client.from('professionals').select('id,name,user_id').eq('workspace_id',cloud.workspaceId).eq('active',true).order('name').limit(300);
   if(error)throw error;
   directory=(data||[]).filter(p=>p.id&&p.name);
   window.__hvProfessionals=directory;
   return directory;
  })();
  try{return await directoryPromise}finally{directoryPromise=null}
 };
 input.addEventListener('input',()=>{
  selectedProfessional=null;
  const seq=++professionalSearchSeq;
  clearTimeout(professionalSearchTimer);
  const q=input.value.trim();
  if(q.length<2){results.hidden=true;results.innerHTML='';if(hint)hint.textContent='Escribe al menos 2 letras para buscar.';return}
  results.hidden=false;results.innerHTML='<div class="hv-professional-empty">Buscando flebotomistas…</div>';
  if(hint)hint.textContent='Consultando el directorio del laboratorio…';
  professionalSearchTimer=setTimeout(async()=>{
   try{
    if(!cloud.ready||!cloud.client||!cloud.workspaceId){results.innerHTML='<div class="hv-professional-empty">La agenda todavía se está conectando. Espera unos segundos e intenta nuevamente.</div>';if(hint)hint.textContent='Conectando con el laboratorio…';return}
    const all=await loadDirectory();if(seq!==professionalSearchSeq)return;
    const nq=normalize(q);
    const items=all.filter(p=>normalize(p.name).includes(nq)).slice(0,12);
    results.innerHTML=items.length?items.map(p=>'<button type="button" class="hv-professional-option" data-professional-id="'+esc(p.id)+'"><b>'+esc(p.name)+'</b><small>'+(p.user_id?'Cuenta vinculada · Recibirá notificación':'Sin cuenta vinculada · No puede recibir notificación')+'</small></button>').join(''):'<div class="hv-professional-empty">No se encontraron flebotomistas activos que coincidan con «'+esc(q)+'».</div>';
    results.hidden=false;
    if(hint)hint.textContent=items.length?'Selecciona un nombre de la lista para asignarlo.':'Prueba con otra parte del nombre o verifica que el usuario esté activo.';
   }catch(e){
    if(seq!==professionalSearchSeq)return;
    results.innerHTML='<div class="hv-professional-empty">No se pudo consultar el directorio: '+esc(e.message||'Error de conexión')+'</div>';
    results.hidden=false;if(hint)hint.textContent=e.message||'Error al buscar.';
   }
  },180);
 });
 results.addEventListener('click',e=>{
  const btn=e.target.closest('[data-professional-id]');if(!btn)return;
  const p=(window.__hvProfessionals||[]).find(x=>x.id===btn.dataset.professionalId);if(!p)return;
  selectedProfessional=p;input.value=p.name;results.hidden=true;results.innerHTML='';
  if(hint)hint.textContent=p.user_id?'Flebotomista seleccionado. Se enviará una notificación al guardar.':'Este perfil no tiene cuenta vinculada y no puede recibir notificaciones.';
 });
 results.addEventListener('mousedown',e=>e.preventDefault());
 input.addEventListener('keydown',e=>{if(e.key==='Escape'){results.hidden=true;}});
}

function closeAssignmentOverlays(){document.querySelectorAll('.hv-assignment-overlay').forEach(node=>node.remove())}
function dismissInvitation(id){dismissedInvitationId=id;closeAssignmentOverlays();render()}function reopenInvitation(id){dismissedInvitationId='';selected=id;render()}window.hvDismissInvitation=dismissInvitation;window.hvReopenInvitation=reopenInvitation;
window.hvCreate=create;window.hvAddAdditionalPatient=addAdditionalPatient;window.hvReviewAdditionalPatient=reviewAdditionalPatient;window.hvReset=reset;window.hvStatus=changeStatus;window.hvAddTests=addTests;window.hvTestStatus=testStatus;window.hvToggleTest=toggleTest;window.hvSelect=id=>{selected=id;detailOpen=true;moreTestSelection=[];render()};window.hvCloseDetail=event=>{if(event&&event.target!==event.currentTarget)return;detailOpen=false;render()};window.hvOpenNotificationVisit=id=>{const visit=visits.find(v=>v.id===id);if(!visit)return;selected=id;activeTab='agenda';detailOpen=true;render()};window.hvExport=exportCsv;window.hvUploadDocument=uploadVisitDocument;window.hvOpenDocument=openVisitDocument;window.hvSaveFieldObservation=saveFieldObservation;
async function activatePush(){
 const button=$('hvActivatePush'),status=$('hvPushStatus');
 const set=(message,error=false)=>{if(status){status.textContent=message;status.style.color=error?'#a33e47':'#557184'}};
 if(!cloud.ready||!cloud.client){set('Inicia sesión y espera a que la agenda conecte con el laboratorio.',true);return}
 const appleMobile=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const installedWebApp=(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;
 if(appleMobile&&!installedWebApp){set('Para instalar FleboReport en este iPad: abre esta página en Safari, toca Compartir → Añadir a pantalla de inicio, activa «Abrir como app» y pulsa Añadir. Después abre FleboReport desde el nuevo icono y vuelve a tocar Activar notificaciones.',true);return}
 if(appleMobile&&(!('PushManager'in window)||!('Notification'in window))){set('Las notificaciones web requieren iPadOS 16.4 o posterior. Actualiza el iPad desde Ajustes → General → Actualización de software y vuelve a intentarlo desde FleboReport instalada en la pantalla de inicio.',true);return}
 if(!('Notification'in window)||!('serviceWorker'in navigator)||!('PushManager'in window)||!window.isSecureContext){set('Este navegador o contexto no admite notificaciones Push. En iPad, abre FleboReport instalada desde la pantalla de inicio y utiliza iPadOS 16.4 o posterior.',true);return}
 if(button){button.disabled=true;button.textContent='Activando…'}
 try{
  let permission=Notification.permission;
  if(permission==='default')permission=await Notification.requestPermission();
  if(permission!=='granted'){set(permission==='denied'?'El permiso está bloqueado. Habilita Notificaciones en los ajustes del navegador para este sitio.':'No se concedió el permiso de notificaciones.',true);return}
  const ok=await registerPushIfPermitted();
  if(!ok){set(window.hvPushLastError||'No se pudo registrar el dispositivo. Revisa la configuración Push del servidor.',true);return}
  set('Notificaciones activadas en este dispositivo. Recibirás avisos de domicilios.');
  if(button){button.textContent='Notificaciones activadas';button.classList.remove('primary')}
 }catch(e){set('Error al activar: '+(e.message||'Push failed'),true)}
 finally{if(button&&button.textContent==='Activando…'){button.disabled=false;button.textContent='Reintentar activación'}}
}
window.hvActivatePush=activatePush;
async function testPushInBackground(){
 const button=$('hvTestPush'),status=$('hvPushStatus');
 const set=(message,error=false)=>{if(status){status.textContent=message;status.style.color=error?'#a33e47':'#557184'}};
 if(!cloud.ready||!cloud.client){set('Inicia sesión y espera a que la agenda conecte con el laboratorio.',true);return}
 if(!('Notification'in window)||Notification.permission!=='granted'){set('Primero activa y concede el permiso de notificaciones en este dispositivo.',true);return}
 if(!('serviceWorker'in navigator)||!('PushManager'in window)||!window.isSecureContext){set('Este navegador no admite notificaciones Push en segundo plano.',true);return}
 if(button){button.disabled=true;button.textContent='Enviando prueba…'}
 try{
  const activated=await registerPushIfPermitted();
  if(!activated)throw new Error(window.hvPushLastError||'No se pudo registrar o renovar este dispositivo para Push.');
  const registration=await navigator.serviceWorker.ready;
  const subscription=await registration.pushManager.getSubscription();
  if(!subscription)throw new Error('No existe una suscripción Push activa en este dispositivo. Pulsa Activar notificaciones y vuelve a probar.');
  const result=await invokeDomicileNotifications({action:'test-push'});
  if(!result?.ok||!result.sent)throw new Error(result?.error||'El servidor no confirmó el envío de la notificación de prueba.');
  set('Prueba enviada al proveedor Push ('+result.sent+' dispositivo(s)). Ahora vuelve a la pantalla de inicio sin cerrar FleboReport y espera hasta 30 segundos. Si no aparece, revisaremos el navegador, el permiso y el Service Worker.');
 }catch(e){set('No se pudo enviar la prueba: '+(e.message||'Error desconocido'),true)}
 finally{if(button){button.disabled=false;button.textContent='Probar notificación en segundo plano'}}
}
window.hvTestPush=testPushInBackground;
let style=document.createElement('style');style.textContent='.hv-field-screen{display:grid;gap:13px}.hv-field-banner{padding:20px;border-radius:17px;background:linear-gradient(135deg,#e8f7f5,#f3f8ff);border:1px solid #d6e9e8}.hv-field-banner>span{font-size:10px;font-weight:850;letter-spacing:1px;color:#087f76}.hv-field-banner h2{margin:7px 0;font-size:23px;color:#173d55}.hv-field-banner p{margin:0;color:#627b8b;font-size:13px}.hv-field-current{margin-top:12px}.hv-field-card{padding:16px;border:1px solid #dce8ed;border-radius:15px;background:#fff;box-shadow:0 6px 18px #163d5508}.hv-field-card h3{margin:0 0 12px;font-size:15px;color:#173d55}.hv-field-info{display:grid;grid-template-columns:1fr 1fr;gap:9px}.hv-field-info>div{display:grid;gap:5px;padding:11px;border-radius:10px;background:#f5f8fa;min-width:0}.hv-field-info .wide{grid-column:1/-1}.hv-field-info small,.hv-field-test small{font-size:11px;color:#657d8c}.hv-field-info b{font-size:13px;overflow-wrap:anywhere}.hv-field-map{display:flex;justify-content:center;margin-top:12px;text-decoration:none}.hv-field-section-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.hv-field-section-head span{font-size:11px;color:#678090}.hv-field-vessels{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.hv-field-vessel{display:grid;min-width:85px;gap:3px;padding:9px 12px;border-radius:10px;background:#eaf5f3;color:#176e65}.hv-field-vessel b{font-size:19px}.hv-field-vessel small{font-size:10px}.hv-field-tests{display:grid;gap:8px}.hv-field-test{display:grid;gap:7px;padding:12px;border:1px solid #e1eaf0;border-radius:12px}.hv-field-test-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.hv-field-test-top>div{display:grid;gap:4px}.hv-field-test-top b{font-size:13px;color:#183c54}.hv-field-test-state{padding:5px 8px;border-radius:20px;font-size:10px;font-weight:800;white-space:nowrap;background:#fff4db;color:#8b6417}.hv-field-test-state.ok{background:#e7f7f0;color:#13734f}.hv-field-test-state.bad{background:#fff0f0;color:#a33e47}.hv-field-select{display:grid;gap:5px;font-size:11px;color:#587184}.hv-field-select select{width:100%;min-height:42px;padding:8px;border:1px solid #d8e5eb;border-radius:9px;background:#fff}.hv-field-note{color:#9b4b38!important}.hv-field-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px}.hv-field-action{min-height:48px;white-space:normal}.hv-field-screen textarea{width:100%;padding:11px;border:1px solid #d8e5eb;border-radius:10px;resize:vertical;margin-bottom:9px}.hv-field-screen .hv-field-actions .btn:only-child{grid-column:1/-1}@media(max-width:560px){.hv-field-card{padding:13px}.hv-field-banner{padding:16px}.hv-field-banner h2{font-size:20px}.hv-field-info{grid-template-columns:1fr}.hv-field-info .wide{grid-column:auto}.hv-field-actions{grid-template-columns:1fr}.hv-field-action{width:100%;min-height:50px}.hv-field-vessel{flex:1 1 100px}}';style.textContent+='.hv-patient-history-section{margin:10px 0;padding:9px;border-radius:9px;background:#fff}.hv-patient-history-section>b{font-size:10px}.hv-patient-history-section p{margin:5px 0;font-size:10px;line-height:1.5}.hv-patient-history-details{margin:8px 0;border:1px solid #dce9ec;border-radius:9px;background:#fff;overflow:hidden}.hv-patient-history-details summary{padding:9px 10px;color:#27566b;font-size:10px;font-weight:800;cursor:pointer}.hv-patient-history-item{padding:9px 10px;border-top:1px solid #edf2f4}.hv-patient-history-item>b{display:block;color:#294e63;font-size:10px}.hv-patient-history-item small{display:block;margin-top:4px;color:#668393;font-size:9px}.hv-patient-history-item p{margin:5px 0;font-size:9px;line-height:1.5;white-space:pre-wrap}.hv-patient-history-tests{display:grid;gap:4px;margin-top:6px}.hv-patient-history-tests span{padding:5px 7px;border-radius:6px;background:#f3f8fa;color:#4b6d7e;font-size:9px}.hv-patient-history-details>small{display:block;padding:9px;color:#748b98}';style.textContent+='.hv-patient-history{margin-top:8px;padding:11px;border:1px solid #cfe5e4;border-radius:10px;background:linear-gradient(145deg,#f0faf8,#f8fcfd);color:#31576b}.hv-patient-history-head{display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:11px}.hv-patient-history-head span,.hv-patient-history small{font-size:9px;color:#668393}.hv-patient-history-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:9px 0}.hv-patient-history-grid span{display:grid;gap:3px;padding:8px;border-radius:8px;background:#fff}.hv-patient-history-grid b{font-size:17px;color:#167c75}.hv-patient-history-grid small{font-size:9px;color:#617d8e}.hv-patient-history p{margin:5px 0;font-size:10px;white-space:pre-line}.hv-additional-panel{margin-top:20px;padding:16px;border:1px solid #dce8ed;border-radius:13px;background:#fbfdfe}.hv-additional-panel h3{margin:0 0 7px}.hv-additional-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.hv-additional-heading>div{min-width:0}.hv-additional-heading .hv-help{margin:5px 0 0}.hv-additional-toggle{flex:0 0 auto;min-height:42px;white-space:nowrap}.hv-additional-form[hidden]{display:none!important}.hv-additional-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px;margin:8px 0;border:1px solid #e1eaf0;border-radius:10px;background:#fff}.hv-additional-row>div:first-child{display:grid;gap:4px}.hv-additional-row small{font-size:11px;color:#647b8a}.hv-additional-actions{display:flex;gap:6px;flex-wrap:wrap}.hv-additional-form{margin-top:14px;padding-top:13px;border-top:1px solid #dce8ed}.hv-additional-form h4{margin:0 0 10px}.hv-additional-form .fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.hv-additional-form input{width:100%}@media(max-width:560px){.hv-additional-row{align-items:flex-start;flex-direction:column}.hv-additional-form .fields{grid-template-columns:1fr}}.hv-patient-lookup{display:flex;gap:7px}.hv-patient-lookup input{flex:1;min-width:0}.hv-patient-lookup button{white-space:nowrap}.hv-patient-lookup-status{display:block;margin-top:5px;font-size:11px;color:#587184}';style.textContent+='#hvWorkspace[hidden],#fleboAuthPanel[hidden]{display:none!important}.hv-test-picker{display:grid;gap:8px;position:relative}.hv-test-picker>input[type=search]{display:block;width:100%;min-height:46px;padding:12px 14px!important;font-size:14px!important;line-height:1.3;cursor:text;pointer-events:auto;touch-action:manipulation}.hv-test-picker>input[type=search]:focus{outline:3px solid #0c8b8330;border-color:#0c8b83}.hv-test-dropdown{position:relative;z-index:12;display:grid;gap:7px;padding:9px;border:1px solid #dce7ed;border-radius:11px;background:#fff;box-shadow:0 10px 28px #173b521c}.hv-test-dropdown[hidden]{display:none!important}.hv-test-picker input{width:100%;min-height:42px;border:1px solid #dce7ed;border-radius:9px;padding:10px 12px;background:#fff;color:#1b394e;font-size:12px}.hv-test-choices{display:grid;gap:5px;max-height:190px;overflow:auto;padding:2px}.hv-test-result{display:grid;grid-template-columns:minmax(0,1fr);align-items:start;justify-content:stretch;gap:4px;width:100%;min-width:0;max-width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--ink);text-align:left;cursor:pointer;white-space:normal;writing-mode:horizontal-tb;overflow-wrap:anywhere;word-break:normal;line-height:1.4}.hv-test-result b{display:block;width:100%;min-width:0;font-size:12px;white-space:normal;writing-mode:horizontal-tb;overflow-wrap:anywhere;word-break:normal;line-height:1.4}.hv-test-result small{display:block;width:100%;min-width:0;font-size:10px;color:var(--muted);white-space:normal;writing-mode:horizontal-tb;overflow-wrap:anywhere;word-break:normal;line-height:1.35}.hv-test-choices,.hv-review-correction,.hv-review-correction *{min-width:0;max-width:100%}.hv-review-correction .hv-test-result{display:grid;grid-template-columns:minmax(0,1fr);justify-items:start;text-align:left}.hv-review-correction .hv-test-result b,.hv-review-correction .hv-test-result small{width:100%;text-align:left;white-space:normal;writing-mode:horizontal-tb;overflow-wrap:anywhere;word-break:normal}.hv-test-result:active{background:#eef9f6;border-color:#0c8b83}.hv-selected-tests{display:flex;gap:6px;flex-wrap:wrap;padding:0;background:transparent;color:#176e65;font-size:10px}.hv-test-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 8px;border-radius:7px;background:#eaf5f3}.hv-test-chip button{border:0;background:transparent;color:#9b2c2c;font-weight:800;font-size:14px;line-height:1;cursor:pointer}.hv-professional-picker{position:relative}.hv-professional-results{position:absolute;z-index:30;top:100%;left:0;right:0;display:grid;gap:5px;max-height:220px;overflow:auto;padding:8px;background:#fff;border:1px solid #dce7ed;border-radius:10px;box-shadow:0 10px 28px #173b521c}.hv-professional-results[hidden]{display:none!important}.hv-professional-option{display:grid;gap:3px;width:100%;padding:10px;text-align:left;border:1px solid #e5edf1;border-radius:8px;background:#fff;color:#1b394e}.hv-professional-option small,.hv-professional-hint{font-size:10px;color:#667b8a}.hv-professional-empty{padding:10px;font-size:11px;color:#667b8a}.hv-push-panel{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:0 0 14px;padding:14px 16px;background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow)}.hv-push-panel b,.hv-push-panel small{display:block}.hv-push-panel b{font-size:12px;color:var(--navy)}.hv-push-panel small{margin-top:5px;color:var(--muted);font-size:10px;line-height:1.45}.hv-push-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.hv-push-actions button{white-space:normal}.hv-push-panel button:disabled{opacity:.65;cursor:wait}@media(max-width:560px){.hv-push-panel{align-items:stretch;flex-direction:column}.hv-push-actions{display:grid;grid-template-columns:1fr}.hv-push-actions button{width:100%;min-height:44px}}.hv-notice{padding:12px 15px;border:1px solid #f0dfb8;background:#fff9eb;color:#76591b;border-radius:12px;font-size:11px;margin-bottom:14px}.hv-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}.hv-kpi{background:#fff;border:1px solid var(--line);border-radius:13px;padding:14px}.hv-kpi small{display:block;color:var(--muted)}.hv-kpi b{display:block;margin-top:5px;font-size:24px;color:var(--navy)}.hv-layout{display:grid;grid-template-columns:1fr 1fr;gap:14px}.hv-visit-list{display:grid;gap:7px;margin-top:12px;max-height:560px;overflow:auto}.hv-visit{display:flex;align-items:center;justify-content:space-between;gap:9px;text-align:left;padding:11px;border:1px solid var(--line);border-radius:11px;background:#fff;width:100%}.hv-visit.selected{border-color:#0c8b83;background:#f0faf8}.hv-visit b,.hv-visit small{display:block}.hv-visit small{font-size:9px;color:var(--muted);margin-top:3px}.hv-status{display:inline-flex;align-items:center;justify-content:center;min-height:28px;line-height:1.2;text-align:center;white-space:normal;border-radius:99px;padding:5px 10px;background:#fff3d9;color:#8b6417;font-size:9px;font-weight:800}.hv-status.done{background:#e7f7f0;color:#13734f}.hv-status.bad{background:#fff0f0;color:#a33e47}.hv-status.active{background:#eaf3ff;color:#2266a2}.hv-detail-panel{margin-top:14px}.hv-review-overlay{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:14px;background:#10233fb8;overflow:auto}.hv-review-modal{width:min(760px,100%);max-height:min(92vh,900px);display:flex;flex-direction:column;background:#fff;border-radius:18px;box-shadow:0 24px 80px #07162955;overflow:hidden;color:#18344b}.hv-review-header{display:flex;justify-content:space-between;gap:14px;padding:20px 22px;border-bottom:1px solid #e6edf2}.hv-review-header h2{margin:6px 0;font-size:21px}.hv-review-header p{margin:0;color:#60788a;font-size:12px;line-height:1.5}.hv-review-close{width:38px;height:38px;flex:0 0 38px;border:0;border-radius:50%;background:#eef3f6;color:#24445b;font-size:25px}.hv-review-body{padding:18px 22px;overflow:auto}.hv-review-body h3{margin:4px 0 12px;font-size:15px}.hv-review-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:20px}.hv-review-grid>div,.hv-review-meta>span{display:grid;gap:5px;padding:11px;border-radius:10px;background:#f4f8fa;min-width:0}.hv-review-grid small,.hv-review-meta small{font-size:10px;color:#6c8291}.hv-review-grid b,.hv-review-meta b{font-size:12px;overflow-wrap:anywhere}.hv-review-grid .wide,.hv-review-meta .wide{grid-column:1/-1}.hv-review-section-title{display:flex;justify-content:space-between;align-items:center;gap:8px}.hv-review-section-title strong{font-size:11px;color:#087f76}.hv-review-test{padding:12px;margin:8px 0;border:1px solid #e3ebef;border-radius:12px}.hv-review-bulk{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:12px 0;padding:12px;border:1px solid var(--line);border-radius:12px;background:#f5f9ff}.hv-review-bulk span{font-size:12px;font-weight:700;color:var(--muted)}.hv-review-choice{display:grid;gap:4px;min-width:130px;font-size:10px;color:var(--muted);font-weight:600}.hv-review-choice select{max-width:100%;padding:7px 9px;border:1px solid var(--line);border-radius:8px;background:#fff;color:#24364b;font-size:12px}.hv-review-test-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.hv-review-test-head b{font-size:13px}.hv-review-state{padding:5px 8px;border-radius:20px;background:#eaf3ff;color:#245f95;font-size:10px;font-weight:700}.hv-review-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:10px}.hv-review-chips{display:flex;gap:7px;flex-wrap:wrap}.hv-review-chip{padding:7px 10px;background:#eaf5f6;border-radius:8px;font-size:11px}.hv-review-warning{margin:18px 0 0;padding:12px;border-radius:10px;background:#fff8e8;color:#795d20;font-size:11px;line-height:1.5}.hv-review-footer{display:flex;justify-content:flex-end;gap:9px;padding:14px 22px;border-top:1px solid #e6edf2;background:#fbfcfd}@media(max-width:560px){.hv-review-overlay{padding:7px;align-items:flex-end}.hv-review-modal{max-height:95vh;border-radius:17px 17px 10px 10px}.hv-review-header,.hv-review-body{padding:15px}.hv-review-grid{grid-template-columns:1fr}.hv-review-grid .wide{grid-column:auto}.hv-review-meta{grid-template-columns:1fr 1fr}.hv-review-meta .wide{grid-column:1/-1}.hv-review-footer{padding:12px 15px;flex-direction:column-reverse}.hv-review-footer button{width:100%}}.hv-detail-head{display:flex;justify-content:space-between;gap:10px}.hv-detail-head h2{margin:5px 0}.hv-detail-grid,.hv-info{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:15px 0}.hv-detail-grid>div,.hv-info>div{display:flex;flex-direction:column;justify-content:center;gap:5px;min-height:66px;background:#f6f9fb;border-radius:10px;padding:10px}.hv-info b,.hv-detail-grid b{display:block;margin:0;line-height:1.35;overflow-wrap:anywhere}.hv-info small,.hv-detail-grid small{margin:0;line-height:1.25}.hv-detail-grid .wide,.hv-info .wide{grid-column:1/-1}.hv-detail-grid small,.hv-info small{display:block;color:var(--muted);font-size:9px}.hv-actions{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0 18px}.hv-test{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px;background:#f8fafb;border-radius:9px;margin:6px 0}.hv-test b,.hv-test small{display:block;font-size:10px}.hv-test small{color:var(--muted);margin-top:3px;line-height:1.4}.hv-test select,.hv-more select{border:1px solid var(--line);border-radius:8px;padding:7px;background:white}.hv-chips{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}.hv-chip{display:inline-flex;align-items:center;justify-content:center;min-height:28px;line-height:1.25;text-align:center;background:#eaf5f6;padding:6px 8px;border-radius:8px;font-size:9px}.hv-more{display:grid;gap:8px;padding:12px;background:#f6f9fb;border-radius:10px}.hv-more select{width:100%}.hv-timeline{display:grid;gap:8px;border-left:2px solid #dcece9;padding-left:12px}.hv-event{display:grid;gap:3px;font-size:10px}.hv-event small,.hv-event span{color:var(--muted);font-size:9px}.hv-doc-list{display:grid;gap:7px;margin:8px 0}.hv-doc-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#fff}.hv-doc-row span{display:grid;gap:3px;min-width:0;overflow-wrap:anywhere}.hv-doc-row b{font-size:11px}.hv-doc-row small,.hv-doc-upload small{font-size:10px;color:var(--muted)}.hv-doc-upload{display:grid;gap:8px;margin:10px 0 18px;padding:12px;background:#f6f9fb;border-radius:10px}.hv-doc-upload input{max-width:100%;font-size:12px}.hv-empty{padding:18px;text-align:center;color:var(--muted)}.hv-help{color:var(--muted);font-size:10px}@media(max-width:900px){.hv-layout{grid-template-columns:1fr}}@media(max-width:600px){.hv-kpis{grid-template-columns:repeat(2,1fr)}.hv-visit{align-items:flex-start;flex-direction:column}.hv-detail-grid,.hv-info{grid-template-columns:1fr}.hv-detail-grid .wide,.hv-info .wide{grid-column:auto}}';style.textContent+='.hv-assignment-overlay{position:fixed;inset:0;z-index:100050;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(8,27,42,.58);backdrop-filter:blur(5px)}.hv-assignment-modal{width:min(440px,100%);padding:24px;border:1px solid #dce8ee;border-radius:21px;background:#fff;box-shadow:0 25px 80px #071b2b66;color:#183d55;text-align:center}.hv-assignment-icon{width:54px;height:54px;display:grid;place-items:center;margin:0 auto 12px;border-radius:17px;background:#fff3d9;color:#9a6814;font-size:26px}.hv-assignment-modal h2{margin:8px 0;font-size:22px}.hv-assignment-modal>p{color:#60798a;font-size:12px;line-height:1.55}.hv-assignment-time{display:grid;gap:5px;margin:16px 0;padding:13px;border-radius:12px;background:#f2f7fa}.hv-assignment-time small{color:#6d8492;font-size:10px}.hv-assignment-time b{font-size:14px;color:#244b62}.hv-assignment-privacy{padding:10px;border-radius:10px;background:#f7f9fa;font-size:10px!important}.hv-assignment-actions{display:grid;gap:9px;margin-top:17px}.hv-assignment-actions .btn{min-height:48px;width:100%}.hv-assignment-later{margin-top:14px;border:0;background:transparent;color:#6b8190;font-size:11px;text-decoration:underline;cursor:pointer}';
document.head.appendChild(style);
style.textContent+='.hv-assignment-overlay{position:fixed!important;inset:0!important;display:flex!important;align-items:center!important;justify-content:center!important;padding: max(20px,env(safe-area-inset-top)) 16px max(20px,env(safe-area-inset-bottom))!important;overflow-y:auto!important;box-sizing:border-box!important}.hv-assignment-modal{margin:auto!important;max-height:calc(100dvh - 40px)!important;overflow-y:auto!important;flex:0 0 auto!important}';
const portalAssignmentOverlay=()=>{
 const active=visits.find(v=>v.id===selected);
 const orphan=document.querySelector('body > .hv-assignment-overlay');
 if(orphan&&(!active||active.status!=='Pendiente de aceptación'||active.assignmentStatus!=='invited'||dismissedInvitationId===active.id))orphan.remove();
 const overlay=document.querySelector('#view-domicilios .hv-assignment-overlay');
 if(overlay&&overlay.parentElement!==document.body)document.body.appendChild(overlay);
};
document.addEventListener('click',e=>{if(e.target&&e.target.id==='hvActivatePush')activatePush();if(e.target&&e.target.id==='hvTestPush')testPushInBackground()});
window.addEventListener('flebo:auth-changed',()=>{connectCloud()});
window.addEventListener('online',()=>{if(!cloud.ready)connectCloud();else scheduleCloudVisitsRefresh()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&cloud.ready)scheduleCloudVisitsRefresh()});
function mountSafe(){
 try{mount();const params=new URLSearchParams(location.search);if(params.get('view')==='domicilios'&&window.navigate)window.navigate('domicilios')}
 catch(error){
  console.error('[Domicilios] Error al iniciar el módulo:',error);
  let view=document.getElementById('view-domicilios');
  const main=document.querySelector('main.content');
  if(!view&&main){view=document.createElement('section');view.id='view-domicilios';view.className='view';main.appendChild(view)}
  if(view){view.classList.add('active');view.hidden=false;view.innerHTML='<section class="panel form-panel" style="margin:18px;padding:22px"><h2>No se pudo iniciar Domicilios</h2><p>El módulo encontró un error al cargar. Recarga FleboReport. Si el problema continúa, comparte esta pantalla con soporte.</p><small style="color:#a33">'+esc(error&&error.message||'Error desconocido')+'</small></section>'}
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountSafe);else mountSafe();
})();