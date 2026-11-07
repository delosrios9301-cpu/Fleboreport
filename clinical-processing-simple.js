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
 function currentSamples(){
  var snapshot=window.FleboAppState&&typeof window.FleboAppState.get==='function'?window.FleboAppState.get():null;
  if(snapshot&&Array.isArray(snapshot.clinicalSamples))return snapshot.clinicalSamples;
  return typeof state!=='undefined'&&state&&Array.isArray(state.clinicalSamples)?state.clinicalSamples:[];
 }
 function findClinicalSample(id){
  var key=String(id);
  return currentSamples().find(function(x){return String(x.id)===key||String(x.cloudId)===key})||null;
 }
 function sampleAgeClass(sample,status){
  if(status!=='PENDIENTE_PROCESO')return '';
  var raw=sample&&sample.collectedAt;
  if(!raw){
   var date=String(sample&&sample.collectionDate||'').trim();
   var time=String(sample&&sample.collectionTime||'').trim();
   if(!date)return '';
   raw=date+(time?'T'+time: 'T00:00:00');
  }
  var takenAt=new Date(raw);
  if(Number.isNaN(takenAt.getTime()))return '';
  var elapsed=Date.now()-takenAt.getTime();
  if(elapsed<0)return '';
  if(elapsed>=60*60*60*1000)return 'clinical-age-red';
  if(elapsed>=48*60*60*1000)return 'clinical-age-orange';
  return '';
 }
 function ensureSampleAgeStyles(){
  if(document.getElementById('clinical-sample-age-styles'))return;
  var style=document.createElement('style');
  style.id='clinical-sample-age-styles';
  style.textContent='#view-clinical-processing .clinical-table tbody tr.clinical-age-orange>td{background-color:#fff1dc!important}#view-clinical-processing .clinical-table tbody tr.clinical-age-orange>td:first-child{box-shadow:inset 3px 0 0 #e6ad61}#view-clinical-processing .clinical-table tbody tr.clinical-age-red>td{background-color:#fde9e9!important}#view-clinical-processing .clinical-table tbody tr.clinical-age-red>td:first-child{box-shadow:inset 3px 0 0 #df9292}';
  document.head.appendChild(style);
 }
 function renderQueue(){
  var host=byId('clinicalQueueRows'),view=byId('view-clinical-processing');
  if(!host||!view)return;
  ensureSampleAgeStyles();
  var samples=currentSamples();
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
   var canDeleteSample=!!(window.FleboAuth&&window.FleboAuth.membership&&window.FleboAuth.membership.role==='admin');
   if(canDeleteSample)action+='<button class="btn danger" onclick="deleteClinicalSample(\''+esc(x.id)+'\')">Eliminar sujeto</button>';
   var aliquotInfo='<strong>Principales:</strong> '+esc(x.primaryAliquots==null?'—':x.primaryAliquots)+'<br><strong>Backup:</strong> '+esc(x.backupAliquots==null?'—':x.backupAliquots)+'<br><strong>Total:</strong> '+((Number(x.primaryAliquots)||0)+(Number(x.backupAliquots)||0));
   function actorTime(raw){if(!raw)return '';var d=new Date(raw);return Number.isNaN(d.getTime())?String(raw):d.toLocaleString('es-PA',{dateStyle:'short',timeStyle:'short'})}var actorRows=[['Recibió',x.receivedBy,x.receivedAt],['Verificó',x.reviewedBy,x.reviewedAt],['Inició proceso',x.processingStartedBy,x.processingStartedAt],['Procesó',x.processedBy,x.processedAt],['Almacenó',x.storedBy,x.storedAt]].filter(function(item){return !!(item[1]||item[2])}).map(function(item){return '<small><strong>'+esc(item[0])+':</strong> '+esc(item[1]||'Responsable no identificado')+(item[2]?' · '+esc(actorTime(item[2])):'')+'</small>'}).join('<br>')||'—';
   var ageClass=sampleAgeClass(x,st);
   return '<tr'+(ageClass?' class="'+ageClass+'"':'')+'><td>'+esc(typeof clinicalStudyName==='function'?clinicalStudyName(x.studyId):'—')+'<br><strong>'+esc(x.subjectCode||'—')+'</strong></td><td>'+esc(x.visit||'—')+'<br>'+esc(x.sampleType||'—')+'</td><td>'+esc(x.collectionDate||'—')+' '+esc(x.collectionTime||'')+'<br>'+esc(typeof clinicalRecordDate==='function'?clinicalRecordDate(x):'—')+' '+esc(typeof clinicalRecordTime==='function'?clinicalRecordTime(x):'')+'</td><td>'+esc(x.tubes==null?'—':x.tubes)+'</td><td>'+aliquotInfo+'</td><td><span class="clinical-status">'+esc(labels[st]||st)+'</span></td><td>'+actorRows+'</td><td class="clinical-actions">'+action+'</td></tr>';
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
 // Ficha de inicio: esta versión es la autoridad final y lee siempre el estado vigente.
 window.openClinicalProcessingModal=function(id){
  var appState=window.FleboAppState&&typeof window.FleboAppState.get==='function'?window.FleboAppState.get():null;
  var samples=currentSamples();
  var sample=samples.find(function(x){return String(x.id)===String(id)||String(x.cloudId)===String(id)});
  if(!sample){if(typeof toast==='function')toast('No se encontró la muestra seleccionada. Actualiza la bandeja de procesamiento.');return}
  var current=statusOf(sample);
  if(current!=='PENDIENTE_PROCESO'&&current!=='PROCESANDO'){if(typeof toast==='function')toast('La muestra debe estar aprobada para iniciar el procesamiento. Estado actual: '+(labels[current]||current));return}
  var previous=document.getElementById('clinicalProcessingModal');if(previous)previous.remove();
  function value(v){return v==null||String(v).trim()===''?'—':String(v)}
  function dateTime(raw,date,time){
   var textValue=raw||((date||'')+(time?'T'+time:''));
   if(!textValue)return '—';
   var d=new Date(textValue);
   return Number.isNaN(d.getTime())?String(textValue):d.toLocaleString('es-PA',{dateStyle:'short',timeStyle:'short'});
  }
  var study=(appState.clinicalStudies||[]).find(function(x){return String(x.id)===String(sample.studyId)})||{};
  var visit=(appState.clinicalVisits||[]).find(function(x){return String(x.id)===String(sample.visitId)})||{};
  var type=(appState.clinicalSampleTypes||[]).find(function(x){return String(x.id)===String(sample.sampleTypeId)})||{};
  var overlay=document.createElement('div');overlay.id='clinicalProcessingModal';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','clinicalProcessingModalTitle');
  overlay.style.cssText='position:fixed;inset:0;z-index:2147483000;background:rgba(7,28,44,.68);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:14px;overflow:auto;';
  var card=document.createElement('section');card.style.cssText='width:min(560px,100%);max-height:94dvh;overflow:auto;background:#fff;border:1px solid #dce8ee;border-radius:18px;box-shadow:0 24px 80px rgba(7,28,44,.32);padding:20px;color:#173d55;';
  var title=document.createElement('h2');title.id='clinicalProcessingModalTitle';title.textContent=current==='PROCESANDO'?'Actualizar alícuotas del procesamiento':'Iniciar procesamiento';title.style.cssText='margin:0 0 5px;font-size:20px;';
  var sub=document.createElement('p');sub.textContent=current==='PROCESANDO'?'Corrija o complete las cantidades de alícuotas ya iniciadas; la muestra seguirá en procesamiento.':'Complete las cantidades de alícuotas de esta muestra antes de iniciar.';sub.style.cssText='margin:0 0 16px;color:#718596;font-size:12px;';
  var info=document.createElement('div');info.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px;background:#f3f8fa;border:1px solid #dfebef;border-radius:12px;padding:13px;margin-bottom:16px;';
  function detail(label,val){var box=document.createElement('div');box.style.cssText='min-width:0;display:grid;gap:4px;';var l=document.createElement('small');l.textContent=label;l.style.cssText='color:#718896;font-size:10px;font-weight:700;';var v=document.createElement('strong');v.textContent=value(val);v.style.cssText='color:#173d55;font-size:12px;overflow-wrap:anywhere;';box.append(l,v);info.appendChild(box)}
  detail('Número de sujeto',sample.subjectCode||sample.subjectId);
  detail('Estudio',study.protocol?(study.protocol+' · '+(study.name||'')):study.name);
  detail('Fecha y hora de toma',dateTime(sample.collectedAt,sample.collectionDate,sample.collectionTime));
  detail('Fecha y hora de recepción',dateTime(sample.receivedAt,sample.date,sample.time));
  detail('Visita',sample.visit||visit.name);
  detail('Tipo de muestra',sample.sampleType||type.name);
  var form=document.createElement('div');form.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;';
  function numberField(label,val,id){var wrap=document.createElement('label');wrap.style.cssText='display:grid;gap:6px;color:#456276;font-size:11px;font-weight:750;';var caption=document.createElement('span');caption.textContent=label;var input=document.createElement('input');input.type='number';input.min='0';input.step='1';input.inputMode='numeric';input.id=id;input.value=val==null?'':String(val);input.placeholder='0';input.style.cssText='width:100%;min-height:44px;border:1px solid #d6e3e9;border-radius:10px;padding:10px 12px;color:#173d55;background:#fff;font-size:14px;';wrap.append(caption,input);form.appendChild(wrap);return input}
  var primary=numberField('Alícuotas principales',sample.primaryAliquots,'clinicalPrimaryAliquots');
  var backup=numberField('Alícuotas backup',sample.backupAliquots,'clinicalBackupAliquots');
  var help=document.createElement('small');help.textContent='Si no se colectó ninguna alícuota backup, coloca 0. Debe registrarse al menos una alícuota en total.';help.style.cssText='display:block;margin:9px 0 14px;color:#718596;font-size:10px;line-height:1.45;';
  var noteWrap=document.createElement('label');noteWrap.style.cssText='display:grid;gap:6px;color:#456276;font-size:11px;font-weight:750;';
  var noteLabel=document.createElement('span');noteLabel.textContent='Observaciones (opcional)';
  var note=document.createElement('textarea');note.rows=3;note.placeholder='Escribe alguna observación del procesamiento…';note.value=sample.processingNotes||'';note.style.cssText='width:100%;border:1px solid #d6e3e9;border-radius:10px;padding:10px 12px;color:#173d55;background:#fff;font-size:12px;resize:vertical;';
  noteWrap.append(noteLabel,note);
  var error=document.createElement('p');error.style.cssText='display:none;margin:10px 0 0;padding:9px 11px;border-radius:9px;background:#fff0f0;color:#a8323c;font-size:11px;';
  var actions=document.createElement('div');actions.style.cssText='display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:16px;';
  var cancel=document.createElement('button');cancel.type='button';cancel.className='btn';cancel.textContent='Cancelar';cancel.onclick=function(){overlay.remove()};
  var saveButton=document.createElement('button');saveButton.type='button';saveButton.className='btn primary';saveButton.textContent=current==='PROCESANDO'?'Guardar cambios':'Guardar e iniciar procesamiento';
  saveButton.onclick=async function(){
   var p=primary.value.trim()===''?0:Number(primary.value),b=backup.value.trim()===''?0:Number(backup.value);
   if(!Number.isInteger(p)||p<0||!Number.isInteger(b)||b<0){error.textContent='Las cantidades deben ser números enteros iguales o mayores que cero.';error.style.display='block';return}
   if(p+b<1){error.textContent='Registra al menos una alícuota principal o backup.';error.style.display='block';return}
   if(current!=='PENDIENTE_PROCESO'&&current!=='PROCESANDO'){error.textContent='Esta muestra no está en un estado que permita guardar alícuotas.';error.style.display='block';return}
   saveButton.disabled=true;cancel.disabled=true;saveButton.textContent='Guardando…';error.style.display='none';
   try{
    var cloud=window.FleboClinicalCloud;if(!cloud)throw new Error('No está disponible la conexión con Supabase.');
    var result;
    if(current==='PROCESANDO'){
     result=await cloud.saveAliquots(sample,p,b);
     if(!result||result.ok!==true)throw new Error('Supabase no confirmó las cantidades de alícuotas.');
     sample.primaryAliquots=p;sample.backupAliquots=b;sample.updatedAt=new Date().toISOString();
     sample.processingNotes=String(note.value||'').trim()||sample.processingNotes||'';
    }else{
     result=await cloud.transition(sample,'PROCESANDO',{primaryAliquots:p,backupAliquots:b,notes:String(note.value||'').trim()||'Inicio de procesamiento técnico'});
     if(!result||result.ok!==true||result.status!=='PROCESANDO')throw new Error('El servidor no confirmó el inicio del procesamiento.');
     sample.workflowStatus='PROCESANDO';sample.status='Pendiente de procesamiento';sample.primaryAliquots=p;sample.backupAliquots=b;sample.processingNotes=String(note.value||'').trim();sample.processingStartedAt=sample.processingStartedAt||new Date().toISOString();sample.processingStartedBy=typeof clinicalActor==='function'?clinicalActor():sample.processingStartedBy||'Responsable no identificado';
     if(typeof appendClinicalSampleHistory==='function')appendClinicalSampleHistory(sample,result.previous_status||'PENDIENTE_PROCESO','PROCESANDO',String(note.value||'').trim()||'Inicio de procesamiento técnico',typeof clinicalActor==='function'?clinicalActor():'');
    }
    if(typeof save==='function')save();
    overlay.remove();renderQueue();if(typeof window.renderClinicalStudies==='function')window.renderClinicalStudies();
    if(typeof toast==='function')toast('Procesamiento iniciado. Alícuotas y observaciones guardadas.');
   }catch(e){console.error('[FleboReport · Modal de procesamiento]',e);error.textContent=e&&e.message?e.message:'No se pudo guardar el procesamiento.';error.style.display='block';saveButton.disabled=false;cancel.disabled=false;saveButton.textContent='Reintentar guardado'}
  };
  actions.append(cancel,saveButton);card.append(title,sub,info,form,help,noteWrap,error,actions);overlay.appendChild(card);
  overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.remove()});
  document.body.appendChild(overlay);setTimeout(function(){primary.focus()},0);
 };
 window.startClinicalProcessing=function(id){
  var sample=findClinicalSample(id);
  if(!sample){if(typeof toast==='function')toast('No se encontró la muestra seleccionada en la bandeja. Actualiza la vista e inténtalo nuevamente.');return}
  if(statusOf(sample)!=='PENDIENTE_PROCESO'){if(typeof toast==='function')toast('La muestra no está aprobada para iniciar procesamiento. Estado actual: '+(labels[statusOf(sample)]||statusOf(sample)));return}
  if(typeof window.openClinicalProcessingModal!=='function'){if(typeof toast==='function')toast('No está disponible la ficha de procesamiento. Recarga la aplicación.');return}
  window.openClinicalProcessingModal(sample.id);
 };
 window.processClinicalSample=window.startClinicalProcessing;
 window.completeClinicalSampleProcessing=async function(id){
  var sample=findClinicalSample(id);
  if(!sample||statusOf(sample)!=='PROCESANDO'){if(typeof toast==='function')toast('La muestra no está en procesamiento.');return}
  if((Number(sample.primaryAliquots)||0)+(Number(sample.backupAliquots)||0)<1){
   if(typeof toast==='function')toast('Primero registra y guarda las alícuotas principales y de backup.');
   if(typeof window.openClinicalProcessingModal==='function')window.openClinicalProcessingModal(id);
   return;
  }
  return move(sample,'ALMACENAMIENTO_TEMPORAL','Procesamiento completado; alícuotas verificadas y almacenamiento temporal autorizado');
 };
 window.finalizeClinicalSampleStorage=function(id){
  var sample=findClinicalSample(id);
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
 if(!window.__clinicalSampleAgeRefreshTimer)window.__clinicalSampleAgeRefreshTimer=window.setInterval(renderQueue,60000);
})();
