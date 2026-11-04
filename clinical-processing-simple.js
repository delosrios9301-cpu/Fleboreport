/* FleboReport · Flujo simplificado de procesamiento sin cajas */
(function(){
 'use strict';
 var busy=new Set();
 var labels={
  REGISTRADO:'Registrada',
  EN_REVISION:'En revisión',
  PENDIENTE_PROCESO:'Pendiente de procesamiento',
  PROCESANDO:'Procesando',
  ALMACENAMIENTO_TEMPORAL:'Almacenamiento temporal',
  CONGELADOR_DEFINITIVO:'Almacenamiento definitivo'
 };
 var legacy={
  EN_REVISION:'En revisión',
  PENDIENTE_PROCESO:'Pendiente de procesamiento',
  PROCESANDO:'Pendiente de procesamiento',
  ALMACENAMIENTO_TEMPORAL:'Procesada',
  CONGELADOR_DEFINITIVO:'Almacenada'
 };
 function statusOf(sample){
  if(sample&&sample.workflowStatus)return sample.workflowStatus;
  return ({
   'Recibida':'REGISTRADO',
   'Registrada':'REGISTRADO',
   'En revisión':'EN_REVISION',
   'Pendiente de procesamiento':'PENDIENTE_PROCESO',
   'Procesando':'PROCESANDO',
   'Procesada':'ALMACENAMIENTO_TEMPORAL',
   'Almacenamiento temporal':'ALMACENAMIENTO_TEMPORAL',
   'Almacenada':'CONGELADOR_DEFINITIVO',
   'Almacenamiento definitivo':'CONGELADOR_DEFINITIVO'
  })[sample&&sample.status]||'REGISTRADO';
 }
 window.workflowStatusOf=statusOf;
 window.workflowLabel=function(status){return labels[status]||status||'—'};
 function esc(value){return typeof window.esc==='function'?window.esc(value):String(value==null?'':value).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])})}
 function byId(id){return document.getElementById(id)}
 function renderQueue(){
  var host=byId('clinicalQueueRows'),view=byId('view-clinical-processing');
  if(!host||!view)return;
  var samples=Array.isArray(state.clinicalSamples)?state.clinicalSamples:[];
  var visible=samples.filter(function(x){return ['PENDIENTE_PROCESO','PROCESANDO','ALMACENAMIENTO_TEMPORAL','CONGELADOR_DEFINITIVO'].includes(statusOf(x))});
  var fs=byId('clinicalQueueStudy')?.value||'',fv=byId('clinicalQueueVisit')?.value||'',ft=byId('clinicalQueueType')?.value||'',fst=byId('clinicalQueueStatus')?.value||'',fd=byId('clinicalQueueDate')?.value||'',q=(byId('clinicalQueueSearch')?.value||'').trim().toLocaleLowerCase('es');
  visible=visible.filter(function(x){
   var hay=[x.subjectCode,x.sampleType,x.visit,typeof clinicalStudyName==='function'?clinicalStudyName(x.studyId):''].join(' ').toLocaleLowerCase('es');
   return (!fs||x.studyId===fs)&&(!fv||x.visitId===fv)&&(!ft||(x.sampleTypeId===ft||x.sampleType===ft))&&(!fst||statusOf(x)===fst||x.status===fst)&&(!fd||(String(x.receivedAt||x.date||'').slice(0,10)===fd))&&(!q||hay.includes(q));
  }).sort(function(a,b){return String(b.receivedAt||b.createdAt||'').localeCompare(String(a.receivedAt||a.createdAt||''))});
  var counts={
   pending:samples.filter(function(x){return statusOf(x)==='PENDIENTE_PROCESO'}).length,
   processing:samples.filter(function(x){return statusOf(x)==='PROCESANDO'}).length,
   temporary:samples.filter(function(x){return statusOf(x)==='ALMACENAMIENTO_TEMPORAL'}).length,
   definitive:samples.filter(function(x){return statusOf(x)==='CONGELADOR_DEFINITIVO'}).length
  };
  if(byId('clinicalQueueKpiReceived'))byId('clinicalQueueKpiReceived').textContent=counts.pending;
  if(byId('clinicalQueueKpiPending'))byId('clinicalQueueKpiPending').textContent=counts.processing;
  if(byId('clinicalQueueKpiProcessed'))byId('clinicalQueueKpiProcessed').textContent=counts.temporary;
  if(byId('clinicalQueueKpiStored'))byId('clinicalQueueKpiStored').textContent=counts.definitive;
  host.innerHTML=visible.map(function(x){
   var st=statusOf(x),action='';
   if(st==='PENDIENTE_PROCESO')action='<button class="btn primary" onclick="startClinicalProcessing(\''+esc(x.id)+'\')">Iniciar procesamiento</button>';
   else if(st==='PROCESANDO')action='<button class="btn primary" onclick="completeClinicalSampleProcessing(\''+esc(x.id)+'\')">Pasar a almacenamiento temporal</button>';
   else if(st==='ALMACENAMIENTO_TEMPORAL')action='<button class="btn primary" onclick="finalizeClinicalSampleStorage(\''+esc(x.id)+'\')">Marcar definitivo</button>';
   else action='<span class="clinical-status">Proceso finalizado</span>';
   var aliquotInfo=(Number(x.primaryAliquots)||0)+(Number(x.backupAliquots)||0)>0?'<br><small>Alícuotas: '+(Number(x.primaryAliquots)||0)+' principales · '+(Number(x.backupAliquots)||0)+' respaldo</small>':'';
   return '<tr><td>'+esc(typeof clinicalStudyName==='function'?clinicalStudyName(x.studyId):'—')+'<br><strong>'+esc(x.subjectCode||'—')+'</strong></td><td>'+esc(x.visit||'—')+'<br>'+esc(x.sampleType||'—')+aliquotInfo+'</td><td>'+esc(x.collectionDate||'—')+' '+esc(x.collectionTime||'')+'<br>'+esc(typeof clinicalRecordDate==='function'?clinicalRecordDate(x):'—')+' '+esc(typeof clinicalRecordTime==='function'?clinicalRecordTime(x):'')+'</td><td>'+esc(x.tubes==null?'—':x.tubes)+'</td><td><span class="clinical-status">'+esc(labels[st]||st)+'</span></td><td>'+esc(x.processedBy||x.receivedBy||'—')+'</td><td class="clinical-actions">'+action+'</td></tr>';
  }).join('');
  var empty=byId('clinicalQueueEmpty');if(empty)empty.hidden=visible.length>0;
 }
 async function move(sample,next,note,extra){
  if(!sample||busy.has(sample.id))return;
  busy.add(sample.id);
  try{
   var cloud=window.FleboClinicalCloud;
   if(!cloud)throw new Error('No está disponible la conexión clínica con Supabase.');
   if(!cloud.ready&&cloud.connect)await cloud.connect();
   var result=await cloud.transition(sample,next,Object.assign({notes:note},extra||{}));
   if(!result||result.ok!==true||result.status!==next)throw new Error('Supabase no confirmó el cambio de estado.');
   var previous=result.previous_status||statusOf(sample),now=new Date().toISOString();
   sample.workflowStatus=next;
   sample.status=legacy[next]||sample.status;
   sample.updatedAt=now;
   if(next==='PROCESANDO'){sample.processingStartedAt=now;if(extra&&extra.primaryAliquots!=null)sample.primaryAliquots=Number(extra.primaryAliquots);if(extra&&extra.backupAliquots!=null)sample.backupAliquots=Number(extra.backupAliquots)}
   if(next==='ALMACENAMIENTO_TEMPORAL'){sample.processedAt=now;sample.processedBy=typeof clinicalActor==='function'?clinicalActor():''}
   if(next==='CONGELADOR_DEFINITIVO'){sample.storedAt=now;sample.storedBy=typeof clinicalActor==='function'?clinicalActor():''}
   if(typeof appendClinicalSampleHistory==='function')appendClinicalSampleHistory(sample,previous,next,note,typeof clinicalActor==='function'?clinicalActor():'',now);
   if(typeof save==='function'&&!save())throw new Error('El cambio llegó a la nube, pero no se pudo guardar la vista local. Recarga la bandeja para recuperar el estado confirmado.');
   if(typeof auditAdd==='function')auditAdd('Procesamiento de muestras','Cambió estado de '+(sample.subjectCode||sample.sampleType||sample.id)+' a '+labels[next]);
   renderQueue();
   if(typeof window.renderOperationalDashboard==='function')window.renderOperationalDashboard();
   if(typeof toast==='function')toast('Estado actualizado: '+labels[next]+'.');
  }catch(error){
   console.error('[FleboReport · Procesamiento simplificado]',error);
   if(typeof toast==='function')toast(error&&error.message?error.message:'No se pudo actualizar el estado.');
  }finally{busy.delete(sample.id)}
 }
 window.startClinicalProcessing=function(id){
  var sample=(state.clinicalSamples||[]).find(function(x){return x.id===id});
  if(!sample||statusOf(sample)!=='PENDIENTE_PROCESO'){if(typeof toast==='function')toast('La muestra no está aprobada para iniciar procesamiento.');return}
  var types=Array.isArray(state.clinicalSampleTypes)?state.clinicalSampleTypes:[],type=types.find(function(x){return x.id===sample.sampleTypeId||x.cloudId===sample.sampleTypeCloudId})||types.find(function(x){return String(x.name||'').toLowerCase()===String(sample.sampleType||'').toLowerCase()})||{};
  var expectedPrimary=type.expectedPrimaryAliquots==null?null:Number(type.expectedPrimaryAliquots),expectedBackup=type.expectedBackupAliquots==null?null:Number(type.expectedBackupAliquots);
  var defaultPrimary=expectedPrimary==null?(Number(sample.primaryAliquots)||0):expectedPrimary,defaultBackup=expectedBackup==null?(Number(sample.backupAliquots)||0):expectedBackup;
  var primaryText=window.prompt('Cantidad de alícuotas PRINCIPALES para '+(sample.subjectCode||sample.sampleType||'esta muestra')+':',String(defaultPrimary));
  if(primaryText===null)return;
  var backupText=window.prompt('Cantidad de alícuotas de RESPALDO (backup):',String(defaultBackup));
  if(backupText===null)return;
  var primary=Number(primaryText.trim()),backup=Number(backupText.trim());
  if(!/^\d+$/.test(primaryText.trim())||!/^\d+$/.test(backupText.trim())||!Number.isSafeInteger(primary)||!Number.isSafeInteger(backup)||primary<0||backup<0||primary+backup<1){if(typeof toast==='function')toast('Indica cantidades enteras válidas; el total de alícuotas debe ser mayor que cero.');return}
  if(expectedPrimary!==null&&primary!==expectedPrimary){if(typeof toast==='function')toast('El protocolo exige '+expectedPrimary+' alícuotas principales.');return}
  if(expectedBackup!==null&&backup!==expectedBackup){if(typeof toast==='function')toast('El protocolo exige '+expectedBackup+' alícuotas de respaldo.');return}
  return move(sample,'PROCESANDO','Inicio de procesamiento técnico. Alícuotas principales: '+primary+'; respaldo: '+backup,{primaryAliquots:primary,backupAliquots:backup});
 };
 window.processClinicalSample=window.startClinicalProcessing;
 window.completeClinicalSampleProcessing=function(id){
  var sample=(state.clinicalSamples||[]).find(function(x){return x.id===id});
  if(!sample||statusOf(sample)!=='PROCESANDO'){if(typeof toast==='function')toast('La muestra no está en procesamiento.');return}
  return move(sample,'ALMACENAMIENTO_TEMPORAL','Procesamiento completado; almacenamiento temporal confirmado');
 };
 window.finalizeClinicalSampleStorage=function(id){
  var sample=(state.clinicalSamples||[]).find(function(x){return x.id===id});
  if(!sample||statusOf(sample)!=='ALMACENAMIENTO_TEMPORAL'){if(typeof toast==='function')toast('La muestra debe estar en almacenamiento temporal.');return}
  if(!confirm('¿Confirmas que esta muestra pasa a almacenamiento definitivo?'))return;
  return move(sample,'CONGELADOR_DEFINITIVO','Almacenamiento definitivo confirmado');
 };
 var baseRender=window.renderClinicalStudies;
 window.renderClinicalStudies=function(){
  if(typeof baseRender==='function')baseRender();
  renderQueue();
 };
 function removeBoxWorkflow(){
  var panel=byId('clinicalCryoPanel');
  if(panel){panel.hidden=true;panel.innerHTML=''}
  var config=byId('clinicalConfigTabs');
  if(config)config.querySelectorAll('button').forEach(function(button){if(/ubicaciones/i.test(button.textContent))button.hidden=true});
 }
 function init(){
  removeBoxWorkflow();
  var root=byId('view-clinical-processing');
  if(root){
   var labels=root.querySelectorAll('.clinical-kpi small');
   if(labels.length>=4){labels[0].textContent='Pendientes';labels[1].textContent='Procesando';labels[2].textContent='Almacenamiento temporal';labels[3].textContent='Almacenamiento definitivo'}
  }
  renderQueue();
 }
 document.addEventListener('DOMContentLoaded',init);
 setTimeout(init,0);
})();
