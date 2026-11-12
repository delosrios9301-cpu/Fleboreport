(function(){
'use strict';
const QUEUE_KEY='fleboreport.appActivityQueue.v1';
let flushing=false;
const memoryQueue=[];
function readQueue(){
 try{const value=JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]');return Array.isArray(value)?value:[]}catch(_){return[]}
}
function writeQueue(items){
 try{localStorage.setItem(QUEUE_KEY,JSON.stringify(items));return true}catch(_){return false}
}
function enqueue(event){
 const items=readQueue();items.push(event);
 if(!writeQueue(items))memoryQueue.push(event);
}
async function flushQueue(){
 if(flushing)return;
 const api=window.FleboCloudAudit;
 if(!api||!api.ready)return;
 flushing=true;
 try{
  let items=readQueue();
  while(items.length||memoryQueue.length){
   const fromMemory=items.length===0;
   const event=fromMemory?memoryQueue[0]:items[0];
   try{await api.record(event)}catch(error){console.warn('[FleboReport Activity]',error);break}
   if(fromMemory)memoryQueue.shift();else{items.shift();writeQueue(items)}
  }
 }finally{flushing=false}
}
function auditAdd(section,action){
 // Los clics de navegación y el foco de las credenciales no son cambios
 // operativos. Evitar ruido, escrituras repetitivas y rastros de pantallas
 // de autenticación. Se conservan los eventos de sesión y las mutaciones.
 const actionLabel=String(action||'Actividad').trim();
 if(actionLabel==='Abrir menú de módulos'||actionLabel==='Usuario'||actionLabel==='Contraseña')return;
 const state=window.FleboAppState&&window.FleboAppState.get?window.FleboAppState.get():{};
 const event={
  id:'log-'+Date.now()+'-'+Math.random().toString(36).slice(2,9),
  timestamp:new Date().toISOString(),
  operator:String(state.auditOperator||'Operador local').trim()||'Operador local',
  section:String(section||'Aplicación'),
  action:String(action||'Actividad')
 };
 enqueue(event);
 flushQueue();
 const panel=document.getElementById('settings-audit');
 if(panel&&!panel.hidden&&typeof window.renderAuditLog==='function')window.renderAuditLog();
}
function renderAuditLog(){
 const rows=document.getElementById('auditLogRows');
 if(rows)rows.innerHTML='<tr><td colspan="4">El historial completo se conserva en la bitácora central. Abre “Historial General” para buscar, filtrar y exportar los registros.</td></tr>';
 const count=document.getElementById('auditLogCount');
 if(count)count.textContent='En la nube';
 const empty=document.getElementById('auditEmpty');
 if(empty)empty.hidden=true;
 const op=document.getElementById('auditOperatorInput');
 const state=window.FleboAppState&&window.FleboAppState.get?window.FleboAppState.get():{};
 if(op&&op.value!==state.auditOperator)op.value=state.auditOperator||'';
}
function clearAuditLog(){
 if(window.toast)window.toast('El historial central es inmutable y se conserva para auditoría.');
}
function exportAuditLogCsv(){
 if(window.FleboAuditHistory&&typeof window.FleboAuditHistory.exportCsv==='function')window.FleboAuditHistory.exportCsv();
 else if(window.toast)window.toast('Abre Historial General para exportar la bitácora.');
}
function saveAuditOperator(){
 const input=document.getElementById('auditOperatorInput');
 const next=(input&&input.value||'').trim();
 const current=window.FleboAppState&&window.FleboAppState.get?window.FleboAppState.get():{};
 if(next===current.auditOperator)return;
 current.auditOperator=next;
 if(typeof window.auditPersist==='function')window.auditPersist();
 auditAdd('Configuración','Actualizó el operador local');
 if(window.FleboCloudSync)window.FleboCloudSync.syncNow();
 if(window.toast)window.toast('Operador actualizado.');
}
window.auditAdd=auditAdd;
window.renderAuditLog=renderAuditLog;
window.clearAuditLog=clearAuditLog;
window.exportAuditLogCsv=exportAuditLogCsv;
window.saveAuditOperator=saveAuditOperator;
window.addEventListener('flebo:cloud-sync-ready',flushQueue);
window.addEventListener('flebo:auth-changed',flushQueue);
window.addEventListener('online',flushQueue);
if(document.readyState!=='loading')flushQueue();
else document.addEventListener('DOMContentLoaded',flushQueue);
})();