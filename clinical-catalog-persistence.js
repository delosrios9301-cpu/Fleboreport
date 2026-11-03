/* FleboReport · Persistencia de catálogos clínicos */
(function(){
 'use strict';
 const cloud=()=>window.FleboClinicalCloud;
 const app=()=>window.FleboAppState&&window.FleboAppState.get?window.FleboAppState.get():null;
 const saveLocal=()=>window.FleboAppState&&window.FleboAppState.save?window.FleboAppState.save():false;
 const isCloudCatalog=type=>type==='visits'||type==='sampleTypes';
 async function ensureCloud(){
  const api=cloud();
  if(!api)throw new Error('No está disponible la conexión con Supabase.');
  await api.connect();
  if(!api.ready)throw new Error('Supabase no está conectado. Inicia sesión y vuelve a intentarlo.');
  if(api.role!=='admin')throw new Error('Solo el administrador puede modificar los catálogos oficiales del estudio.');
  return api;
 }
 async function persistCloudCatalog(){
  const api=await ensureCloud();
  if(typeof api.saveConfiguration!=='function')throw new Error('La sincronización de catálogos no está disponible.');
  await api.saveConfiguration();
  return true;
 }
 const baseDelete=window.deleteClinicalCatalogItem;
 window.deleteClinicalCatalogItem=async function(type,id){
  const state=app(),map={visits:'clinicalVisits',sampleTypes:'clinicalSampleTypes'};
  if(!state||!map[type]){
   if(typeof baseDelete==='function')return baseDelete(type,id);
   return;
  }
  const arr=state[map[type]]||[],item=arr.find(x=>String(x.id)===String(id));
  if(!item||item.active===false)return;
  if(!confirm('¿Desactivar este elemento del catálogo oficial? Dejará de aparecer en nuevos registros. Los registros históricos se conservarán y podrás reactivarlo.'))return;
  const previous={active:item.active,updatedAt:item.updatedAt};
  item.active=false;item.updatedAt=new Date().toISOString();
  if(type==='visits')state.clinicalStudies.forEach(s=>{s.visitIds=Array.isArray(s.visitIds)?s.visitIds:s.visitIds||[]});
  if(!saveLocal()){item.active=previous.active;item.updatedAt=previous.updatedAt;return}
  if(typeof window.auditAdd==='function')window.auditAdd('Configuración · Estudios clínicos','Desactivó '+(type==='visits'?'visita':'tipo de muestra')+': '+(item.name||item.code||id));
  if(typeof window.renderClinicalCatalogList==='function')window.renderClinicalCatalogList();
  if(typeof window.renderClinicalStudies==='function')window.renderClinicalStudies();
  try{
   await persistCloudCatalog();
   if(typeof window.toast==='function')window.toast('Catálogo actualizado en Supabase. Ya no aparecerá en el formulario de Registro.');
  }catch(error){
   console.error('[FleboReport · Catálogos]',error);
   item.active=previous.active;item.updatedAt=previous.updatedAt;saveLocal();
   if(typeof window.renderClinicalCatalogList==='function')window.renderClinicalCatalogList();
   if(typeof window.renderClinicalStudies==='function')window.renderClinicalStudies();
   if(typeof window.toast==='function')window.toast('No se confirmó la desactivación en la nube: '+(error.message||'Error de sincronización')+'. No se eliminó ningún dato.');
  }
 };
 window.restoreClinicalCatalogItem=async function(type,id){
  const state=app(),map={visits:'clinicalVisits',sampleTypes:'clinicalSampleTypes'};
  if(!state||!map[type])return;
  const item=(state[map[type]]||[]).find(x=>String(x.id)===String(id));
  if(!item)return;
  const previous=item.active;item.active=true;item.updatedAt=new Date().toISOString();
  if(!saveLocal()){item.active=previous;return}
  try{
   await persistCloudCatalog();
   if(typeof window.renderClinicalCatalogList==='function')window.renderClinicalCatalogList();
   if(typeof window.renderClinicalStudies==='function')window.renderClinicalStudies();
   if(typeof window.toast==='function')window.toast('Elemento reactivado y sincronizado con Supabase.');
  }catch(error){
   item.active=previous;saveLocal();
   if(typeof window.toast==='function')window.toast('No se pudo reactivar en la nube: '+(error.message||'Error'));
  }
 };
 const originalUpdate=window.updateClinicalProtocolOptions;
 window.updateClinicalProtocolOptions=function(){
  const state=app(),studyId=document.getElementById('clinicalProcessStudy')?.value||'';
  const study=(state&&state.clinicalStudies||[]).find(x=>x.id===studyId);
  if(!study){if(typeof originalUpdate==='function')return originalUpdate();return}
  const visits=(state.clinicalVisits||[]).filter(x=>x.active!==false&&(study.visitIds||[]).includes(x.id));
  const types=(state.clinicalSampleTypes||[]).filter(x=>x.active!==false&&(study.sampleTypeIds||[]).includes(x.id));
  const selectedVisit=document.getElementById('clinicalProcessVisit')?.value||'';
  const selectedType=document.getElementById('clinicalSampleType')?.value||'';
  window.clinicalSetSelect('clinicalProcessVisit',visits,'Selecciona visita…',x=>x.id,x=>(x.code?x.code+' · ':'')+x.name+(x.dayScheduled!=null?' · Día '+x.dayScheduled:''),selectedVisit);
  window.clinicalSetSelect('clinicalSampleType',types,'Selecciona muestra…',x=>x.id,x=>(x.code?x.code+' · ':'')+x.name,selectedType);
  if(typeof window.updateClinicalSubjectOptions==='function')window.updateClinicalSubjectOptions('clinicalProcessStudy','clinicalProcessSubject');
  window.clinicalSetSelect('clinicalReceivedBy',(state.clinicalStaff||[]).filter(x=>x.status!=='Inactivo'),'Selecciona personal…',x=>x.id,x=>x.name+' · '+(x.role||''));
  window.clinicalSetSelect('clinicalQueueVisit',(state.clinicalVisits||[]).filter(x=>x.active!==false),'Todas las visitas',x=>x.id,x=>x.name);
  window.clinicalSetSelect('clinicalQueueType',(state.clinicalSampleTypes||[]).filter(x=>x.active!==false),'Todos los tipos',x=>x.id,x=>x.name);
  window.clinicalSetSelect('clinicalQueueStudy',state.clinicalStudies||[],'Todos los estudios',x=>x.id,x=>x.protocol+' · '+x.name);
  if(typeof window.renderClinicalSampleDetails==='function')window.renderClinicalSampleDetails();
 };
 const originalList=window.renderClinicalCatalogList;
 window.renderClinicalCatalogList=function(){
  if(typeof originalList==='function')originalList();
  const state=app(),type=window.clinicalConfigType,map={visits:'clinicalVisits',sampleTypes:'clinicalSampleTypes'};
  if(!state||!map[type])return;
  const host=document.getElementById('clinicalConfigList');if(!host)return;
  const items=(state[map[type]]||[]).slice().sort((a,b)=>type==='visits'?(Number(a.order)||999)-(Number(b.order)||999):String(a.name||'').localeCompare(String(b.name||''),'es'));
  if(!items.length){host.innerHTML='<div class="empty-state">Este catálogo está vacío.</div>';return}
  host.innerHTML=items.map(x=>{
   const inactive=x.active===false;
   const detail=type==='visits'?[x.code,x.order&&('Orden '+x.order)].filter(Boolean).join(' · '):[x.code,x.description].filter(Boolean).join(' · ');
   const title=String(x.name||'Elemento');
   const action=inactive
    ?'<button class="btn" onclick="restoreClinicalCatalogItem(\''+type+'\',\''+String(x.id).replace(/'/g,'&#39;')+'\')">Reactivar</button>'
    :'<button class="btn danger" onclick="deleteClinicalCatalogItem(\''+type+'\',\''+String(x.id).replace(/'/g,'&#39;')+'\')">Desactivar</button>';
   return '<div class="clinical-config-row"><span><strong>'+window.esc(title)+'</strong><small>'+window.esc(detail||'Configurado')+(inactive?' · INACTIVO':' · ACTIVO')+'</small></span><span class="clinical-actions">'+action+'</span></div>';
  }).join('');
 };
})();
