(function(){
'use strict';
const TABLE='patients';
let client=null,userId=null,workspaceId=null,channel=null,ready=false,busy=false,dirty=false,timer=null,lastContent=new Map();
const app=()=>window.FleboAppState?.get?.();
const norm=v=>String(v||'').trim().toLocaleLowerCase('es').replace(/[^a-z0-9]/g,'');
const docOf=p=>String(p?.document||p?.cedula||p?.document_number||'').trim();
const keyOf=p=>{const d=norm(docOf(p));if(d)return'doc:'+d;const id=String(p?.id||'');return id&&!id.startsWith('cloud-')?'legacy:'+id:(p?.cloudPatientId?'cloud:'+p.cloudPatientId:'legacy:'+id)};
function contentOf(p){const x={...p};delete x.cloudPatientId;delete x.updatedAt;delete x.updated_at;return JSON.stringify(x)}
function payloadOf(p){
 const data={...p};delete data.cloudPatientId;
 data.legacyId=String(p.id||p.legacyId||'');data.updatedAt=p.updatedAt||new Date().toISOString();
 data.name=p.name||p.fullName||'';data.fullName=p.fullName||p.name||'';data.document=docOf(p);
 return data;
}
function fromRow(r){
 const d=r.app_data&&typeof r.app_data==='object'?r.app_data:{};
 return {...d,id:d.legacyId||r.legacy_id||'cloud-'+r.id,cloudPatientId:r.id,
  name:d.name||[r.first_name,r.last_name].filter(Boolean).join(' '),
  fullName:d.fullName||d.name||[r.first_name,r.last_name].filter(Boolean).join(' '),
  document:r.document_number||d.document||d.cedula||'',cedula:r.document_number||d.cedula||d.document||'',
  birthDate:d.birthDate||r.birth_date||'',sex:d.sex||r.sex||'',phone:d.phone||r.phone||'',
  email:d.email||r.email||'',address:d.address||r.address||'',updatedAt:r.updated_at||d.updatedAt||''};
}
function merge(local,remote){
 const map=new Map();(local||[]).forEach(p=>map.set(keyOf(p),p));
 (remote||[]).forEach(r=>{const k=keyOf(r),old=map.get(k);if(!old){map.set(k,r);return}
  const localTime=Date.parse(old.updatedAt||old.createdAt||0)||0,remoteTime=Date.parse(r.updatedAt||0)||0;
  const winner=remoteTime>localTime?r:old,other=winner===r?old:r;
  map.set(k,{...other,...winner,id:old.id||winner.id,cloudPatientId:r.cloudPatientId||old.cloudPatientId});
 });
 return Array.from(map.values());
}
async function fetchAll(){
 const {data,error}=await client.from(TABLE).select('id,legacy_id,document_number,first_name,last_name,birth_date,sex,phone,email,address,app_data,updated_at').eq('workspace_id',workspaceId).order('updated_at',{ascending:false}).limit(5000);
 if(error)throw error;return(data||[]).map(fromRow);
}
async function pushOne(p){
 const data=payloadOf(p),result=await client.rpc('sync_workspace_patient',{p_workspace_id:workspaceId,p_legacy_id:String(p.id||''),p_data:data});
 if(result.error)throw result.error;const row=Array.isArray(result.data)?result.data[0]:result.data;
 if(row){p.cloudPatientId=row.patient_id;p.updatedAt=row.updated_at||data.updatedAt}
}
function saveList(list){
 const s=app();if(!s)return;
 const before=JSON.stringify(s.patients||[]),after=JSON.stringify(list);
 if(before===after)return;s.patients=list;window.FleboAppState.save();
}
async function syncNow(){
 if(!ready||busy||!client||!workspaceId)return;
 busy=true;dirty=false;
 try{
  const local=(app()?.patients||[]).slice(),remote=await fetchAll();
  let merged=merge(local,remote),remoteByKey=new Map(remote.map(p=>[keyOf(p),p]));
  for(const p of merged){
   const old=remoteByKey.get(keyOf(p)),changed=!old||contentOf(p)!==contentOf(old);
   if(changed&&(!old||(Date.parse(p.updatedAt||p.createdAt||0)||0)>=(Date.parse(old.updatedAt||0)||0))){
    p.updatedAt=new Date().toISOString();await pushOne(p);
   }
  }
  const latest=await fetchAll();merged=merge(merged,latest);saveList(merged);
  lastContent=new Map(merged.map(p=>[keyOf(p),contentOf(p)]));
 }catch(e){console.error('[FleboReport Patient Sync]',e);const el=document.getElementById('fleboSyncStatus');if(el){el.textContent='Expedientes pendientes de sincronizar';el.dataset.error='true'}}
 finally{busy=false;if(dirty)schedule(300)}
}
function schedule(delay=900){
 if(!ready)return;dirty=true;
 const list=app()?.patients||[];
 list.forEach(p=>{const k=keyOf(p),old=lastContent.get(k);if(old!==undefined&&old!==contentOf(p))p.updatedAt=new Date().toISOString()});
 clearTimeout(timer);timer=setTimeout(syncNow,delay);
}
function subscribe(){
 if(!client||!workspaceId)return;if(channel)client.removeChannel(channel);
 channel=client.channel('flebo-patient-master-'+workspaceId)
  .on('postgres_changes',{event:'*',schema:'public',table:TABLE,filter:'workspace_id=eq.'+workspaceId},()=>{if(!busy)syncNow();else dirty=true})
  .subscribe();
}
async function connect(){
 const auth=window.FleboAuth;if(!auth)return;
 try{
  client=await auth.init();const user=auth.user,m=auth.membership;
  if(!user||!m?.workspace_id||m.active!==true){ready=false;if(channel)client.removeChannel(channel);channel=null;return}
  if(!['admin','clinician','reception','viewer'].includes(m.role)){ready=false;return}
  const changed=workspaceId!==m.workspace_id||userId!==user.id;userId=user.id;workspaceId=m.workspace_id;ready=true;
  if(changed)subscribe();await syncNow();
 }catch(e){ready=false;console.error('[FleboReport Patient Sync] Conexión:',e)}
}
window.addEventListener('flebo:local-state-saved',()=>{if(ready)schedule()});
window.addEventListener('flebo:auth-changed',()=>{if(window.FleboAuth?.user)connect();else{ready=false;if(channel&&client)client.removeChannel(channel);channel=null}});
window.addEventListener('online',()=>{if(ready)syncNow();else connect()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&navigator.onLine){if(ready)syncNow();else connect()}});
setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine){if(ready)syncNow();else connect()}},20000);
function boot(){if(window.FleboAuth&&window.FleboAuth.user)connect();else window.addEventListener('flebo:auth-changed',connect,{once:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
window.FleboPatientCloud={syncNow,connect,get ready(){return ready},get workspaceId(){return workspaceId}};
})();