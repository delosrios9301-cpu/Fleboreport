/* FleboReport · Dashboard sincronizado por módulo (solo lectura, respetando RLS).
   Los contadores de Inicio usan únicamente consultas autorizadas de la nube. */
(function(root,factory){
 'use strict';
 const core=factory();
 if(typeof module==='object'&&module.exports)module.exports=core;
 if(root)root.FleboLiveDashboardCore=core;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const LABELS={pending_acceptance:'Pendiente',accepted:'Aceptado',en_route:'En camino',on_site:'En domicilio',samples_taken:'Muestras tomadas',completed:'Finalizado',cancelled:'Cancelado',rejected:'Rechazado',not_performed:'No realizado'};
 function day(value){
  const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Panama',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return parts.year+'-'+parts.month+'-'+parts.day;
 }
 function metric(rows){return Array.isArray(rows)?rows.length:null;}
 function legacyFromState(state){
  if(!state||typeof state!=='object')return null;
  const companies=Array.isArray(state.companies)?state.companies.filter(c=>c&&c.active!==false).length:0;
  const reports=Array.isArray(state.reportHistory)?state.reportHistory.filter(r=>r&&r.snapshot).length:0;
  const snapshotSessions=new Set((state.reportHistory||[]).filter(r=>r&&r.snapshot).map(r=>{
   const x=r.snapshot;
   return [x.journeyDate||'',x.start||'',x.end||'',x.clientName||x.companyName||''].join('|');
  }));
  const entries=Array.isArray(state.journeyEntries)?state.journeyEntries.filter(e=>e&&!e.removedAt):[];
  const distinctJourneys=new Set(entries.map(e=>String(e.journeyId||'')).filter(Boolean));
  return {companies,reports,journeys:Math.max(snapshotSessions.size,distinctJourneys.size),
   participations:entries.length};
 }
 function cloudCount(tableCount,legacyCount){
  const t=Number.isFinite(tableCount)?tableCount:null;
  const l=Number.isFinite(legacyCount)?legacyCount:null;
  if(t===null&&l===null)return null;
  if(t===null)return l;
  if(l===null)return t>0?t:null; // Un cero relacional no prueba que el estado compartido esté vacío.
  return Math.max(t,l); // El mismo registro puede existir en ambas estructuras; no sumarlos.
 }
 function calculate(data,now=new Date()){
  const home=data.home,patients=data.patients,homeTests=data.homeTests,
   attentions=data.attentions,attentionTests=data.attentionTests,samples=data.samples,
   studies=data.studies,journeys=data.journeys,reports=data.reports,
   invoices=data.invoices,companies=data.companies,legacy=data.sharedLegacy;
  const currentDay=day(now),currentMonth=currentDay.slice(0,7);
  const visits=Array.isArray(home)?home:null;
  const completed=visits?visits.filter(v=>v.status==='completed'):null;
  const completeDay=v=>day(v.completed_at||v.updated_at||v.scheduled_at);
  const countBy={};
  for(const v of visits||[])countBy[v.status]=(countBy[v.status]||0)+1;
  const active=visits?visits.filter(v=>['pending_acceptance','accepted','en_route','on_site','samples_taken'].includes(v.status)).length:null;
  const patientIds=patients?new Set(patients.map(p=>p.id)) :null;
  const attendedSet=new Set();
  if(completed)for(const v of completed)if(v.patient_id)attendedSet.add(v.patient_id);
  if(attentions)for(const a of attentions)if(a.patient_id)attendedSet.add(a.patient_id);
  const attended=(visits&&attentions)?attendedSet.size:null;
  const collected=homeTests?homeTests.filter(t=>t.status==='collected').reduce((n,t)=>n+Math.max(1,Number(t.quantity)||1),0):null;
  const additionalTaken=attentionTests?attentionTests.filter(t=>t.status==='completed'||t.status==='performed').length:null;
  const testsTaken=(collected!==null&&additionalTaken!==null)?collected+additionalTaken:null;
  const processed=samples?samples.filter(s=>!!s.processed_at||['Procesada','Almacenada'].includes(s.status)||/proces|almacen|congelador/i.test(s.workflow_status||'')).length:null;
  const definitive=samples?samples.filter(s=>s.status==='Almacenada'||/definitiv|congelador/i.test(s.workflow_status||'')).length:null;
  const invoiceRows=Array.isArray(invoices)?invoices.filter(x=>day(x.issued_at).slice(0,7)===currentMonth):null;
  const currencies=invoiceRows?[...new Set(invoiceRows.map(x=>x.currency||'USD'))]:[];
  const revenue=invoiceRows&&currencies.length<=1?invoiceRows.reduce((sum,r)=>sum+(Number(r.total)||0),0):null;
  const byTests={};for(const t of homeTests||[])if(t.status==='collected'){const label=String(t.test_name||'Prueba sin nombre');byTests[label]=(byTests[label]||0)+Math.max(1,Number(t.quantity)||1);}
  const dates=[];for(let i=6;i>=0;i--){const date=day(new Date(now.getTime()-i*86400000));dates.push({key:date,name:date.slice(8),count:completed?completed.filter(v=>completeDay(v)===date).length:0});}
  const statuses=[];if(samples)for(const sample of samples){const status=String(sample.status||sample.workflow_status||'Sin estado');let row=statuses.find(x=>x.name===status);if(!row){row={name:status,count:0};statuses.push(row);}row.count++;}
  return {patients:metric(patients),attended,homeTotal:metric(visits),homeCompleted:completed?.length??null,
   homeMonth:completed?completed.filter(v=>completeDay(v).slice(0,7)===currentMonth).length:null,
   homeToday:completed?completed.filter(v=>completeDay(v)===currentDay).length:null,
   homeActive:active,homeStatuses:visits?countBy:null,homeDates:completed?dates:null,
   homeArchived:visits?visits.filter(v=>!!v.archived_at).length:null,
   testsTaken,homeTestsCollected:collected,homeTestsPending:homeTests?homeTests.filter(t=>t.status==='pending').length:null,
   studies:studies??null,samples:metric(samples),processed,definitive,
   journeys:cloudCount(metric(journeys),legacy?.journeys),reports:cloudCount(reports,legacy?.reports),
   companies:cloudCount(companies,legacy?.companies),participations:legacy?.participations??null,
   revenue,revenueCurrency:currencies.length===1?currencies[0]:'USD',
   invoiceCount:metric(invoices),attentionCount:metric(attentions),
   testKinds:homeTests?Object.entries(byTests).map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count).slice(0,8):null,
   clinicalStatuses:samples?statuses:null,patientTimeline:patients?patients.map(p=>day(p.created_at)).filter(Boolean):null,
   currentDay};
 }
 return {calculate,legacyFromState,cloudCount,day,LABELS};
});
(function(){
 'use strict';
 if(typeof window==='undefined'||typeof document==='undefined')return;
 const core=window.FleboLiveDashboardCore;if(!core)return;
 const $=id=>document.getElementById(id);
 let data=null,verifiedWorkspace='',inflight=null,lastFetch=0,seq=0,timer=0,lastError='',installed=false,refreshAfterInflight=false;
 let legacyMemo={workspace:'',revision:null,counts:null};
 const attr=(el,key,val)=>el.setAttribute(key,val);
 function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;}
 function onHome(){return !!$('view-home')?.classList.contains('active');}
 function auth(){const a=window.FleboAuth,m=a?.membership;if(!a?.client||!a?.user||!m?.workspace_id||m.active!==true)return null;return{client:a.client,workspace:m.workspace_id};}
 function ensurePanel(){
  const home=$('view-home');if(!home)return null;
  // Desactivar las gráficas heredadas calculadas en local: nunca mostrar cifras contradictorias.
  home.classList.add('dl-cloud-dashboard');
  let p=$('dlLiveDashboard');
  if(!p){
   p=el('section','dl-live-dashboard');p.id='dlLiveDashboard';
   const head=el('div','dl-live-head');
   const copy=el('div','');copy.append(el('h2','','Indicadores sincronizados de todos los módulos'),
    el('p','','Actividad real del laboratorio, con registros históricos y actuales.'));
   const refresh=el('button','btn','Actualizar');refresh.id='dlLiveRefresh';refresh.type='button';
   refresh.addEventListener('click',()=>{void refresh(true);});head.append(copy,refresh);p.append(head);
   const status=el('p','dl-live-status','Verificando registros de la nube…');status.id='dlLiveStatus';attr(status,'role','status');p.append(status);
   const cards=el('div','dl-live-cards');cards.id='dlLiveCards';p.append(cards);
   const charts=el('div','dl-live-charts');
   for(const [id,title] of [['dlLiveStatuses','Domicilios por estado'],['dlLiveDays','Domicilios finalizados · últimos 7 días'],
     ['dlLiveModules','Actividad por módulo'],['dlLiveClinical','Estado de muestras clínicas'],['dlLiveTests','Pruebas tomadas en domicilios']]){
    const box=el('section','dl-live-chart');box.append(el('h3','',title));const body=el('div','dl-live-chart-body');body.id=id;box.append(body);charts.append(box);
   }
   p.append(charts);
  }
  const flow=home.querySelector('.hp-dashboard-flow');
  const stage=flow?.querySelector('.vc-kpi-stage')||home.querySelector('#operationalKpis')?.closest('.vc-kpi-stage');
  if(flow){if(p.parentElement!==flow){if(stage)stage.insertAdjacentElement('afterend',p);else flow.prepend(p);}}
  else if(!p.parentElement)home.append(p);
  return p;
 }
 function setStatus(s){const host=$('dlLiveStatus');if(host)host.textContent=s;}
 function setKpi(idx,label,value,subtitle){
  const roots=[$('operationalKpis'),...document.querySelectorAll('[data-shared-kpis]')];
  for(const root of roots){const item=root?.querySelectorAll('.op-kpi')[idx];if(!item)continue;
   const valueEl=item.querySelector('.op-kpi-value'),labelEl=item.querySelector('.op-kpi-label'),desc=item.querySelector('.op-kpi-trend');
   if(labelEl&&labelEl.textContent!==label)labelEl.textContent=label;
   const str=value==null?'—':String(value);
   if(valueEl&&valueEl.textContent!==str)valueEl.textContent=str;
   if(desc&&desc.textContent!==subtitle)desc.textContent=subtitle;
  }
 }
 function currency(n,c){if(n==null)return null;try{return new Intl.NumberFormat('es-PA',{style:'currency',currency:c||'USD',maximumFractionDigits:2}).format(n)}catch(_){return String(n)}}
 function paintKpis(){
  const d=data;
  setKpi(0,'Pacientes totales',d?.patients??null,'Expedientes activos en nube');
  setKpi(1,'Pacientes atendidos',d?.attended??null,'Pacientes únicos atendidos');
  setKpi(2,'Empresas registradas',d?.companies??null,'Registros en nube');
  setKpi(3,'Jornadas registradas',d?.journeys??null,'Jornadas guardadas en nube');
  setKpi(4,'Pruebas tomadas',d?.testsTaken??null,'Muestras tomadas en domicilios y atenciones');
  setKpi(5,'Ingresos del mes',currency(d?.revenue??null,d?.revenueCurrency),'Facturas del mes en nube');
  setKpi(6,'Atenciones domiciliarias',d?.homeCompleted??null,'Finalizados históricos, incluidos archivados');
 }
 function chartRows(host,records){
  if(!host)return;
  host.replaceChildren();
  if(!records||!records.length){host.append(el('p','dl-live-empty','Sin datos verificados para este gráfico.'));return;}
  const max=Math.max(1,...records.map(x=>x.count));
  for(const item of records){
   const row=el('div','dl-live-row'),name=el('span','',item.name),track=el('div','dl-live-track'),fill=el('i','dl-live-fill');
   fill.style.width=Math.round(item.count/max*100)+'%';track.append(fill);
   row.append(name,track,el('b','',item.count));host.append(row);
  }
 }
 function paint(){
  ensurePanel();paintKpis();
  if(!data)return;
  const d=data,cards=$('dlLiveCards');if(!cards)return;
  const metrics=[['Pacientes',d.patients,'Expedientes activos'],
   ['Domicilios finalizados',d.homeCompleted,'Todos los períodos y archivados'],
   ['Domicilios activos',d.homeActive,'Pendientes y en atención'],
   ['Finalizados hoy',d.homeToday,'Fecha de Panamá'],
   ['Pruebas domiciliarias tomadas',d.homeTestsCollected,'Muestras registradas'],
   ['Pruebas domiciliarias pendientes',d.homeTestsPending,'Sin marcar tomadas'],
   ['Estudios clínicos',d.studies,'Protocolos registrados'],
   ['Muestras clínicas',d.samples,'Registros recibidos'],
   ['Muestras procesadas',d.processed,'Procesamiento registrado'],
   ['Almacenadas definitivamente',d.definitive,'Almacenamiento final'],
   ['Jornadas',d.journeys,'Jornadas consolidadas de la nube'],
   ['Participaciones en jornada',d.participations,'Participaciones vigentes sincronizadas'],
   ['Reportes',d.reports,'Informes guardados en nube']];
  cards.replaceChildren();
  for(const [title,value,caption] of metrics){
   const card=el('article','dl-live-card');card.append(el('small','',title),el('strong','',value==null?'—':value),el('span','',caption));cards.append(card);
  }
  chartRows($('dlLiveStatuses'),d.homeStatuses?Object.keys(core.LABELS).filter(k=>d.homeStatuses[k]).map(k=>({name:core.LABELS[k],count:d.homeStatuses[k]})):null);
  const mod=[['Pacientes',d.patients],['Domicilios finalizados',d.homeCompleted],['Jornadas',d.journeys],
   ['Estudios clínicos',d.studies],['Muestras procesadas',d.processed],['Reportes',d.reports]];
  chartRows($('dlLiveModules'),mod.filter(([_,n])=>n!=null).map(([name,count])=>({name,count})));
  chartRows($('dlLiveClinical'),d.clinicalStatuses);
  chartRows($('dlLiveTests'),d.testKinds);
  const host=$('dlLiveDays');if(host){
   host.replaceChildren();
   if(d.homeDates){const max=Math.max(1,...d.homeDates.map(x=>x.count));
    for(const day of d.homeDates){
     const box=el('div','dl-live-day'),stick=el('div','dl-live-day-stick'),fill=el('i','dl-live-day-fill');
     fill.style.height=(day.count?Math.max(8,Math.round(day.count/max*100)):0)+'%';
     stick.append(fill);box.append(el('b','',day.count),stick,el('small','',day.name));attr(box,'aria-label',day.key+': '+day.count+' domicilios finalizados');host.append(box);
    }
   }else host.append(el('p','dl-live-empty','Datos no verificados.'));
  }
  const home=$('view-home');if(home)home.classList.add('dl-cloud-verified');
 }
 async function rows(client,ws,table,fields,extra){
  const acc=[];
  for(let offset=0;offset<10000;offset+=500){
   let q=client.from(table).select(fields).eq('workspace_id',ws);
   if(extra)q=extra(q);
   const res=await q.order('id',{ascending:true}).range(offset,offset+499);
   if(res.error)throw new Error(table+': '+res.error.message);
   const chunk=res.data||[];acc.push(...chunk);
   if(chunk.length<500)return acc;
  }
  throw new Error('La consulta de '+table+' supera 10000 registros; no usar resultados parciales.');
 }
 async function count(client,ws,table,extra){
  let q=client.from(table).select('id',{count:'exact',head:true}).eq('workspace_id',ws);
  if(extra)q=extra(q);
  const res=await q;if(res.error)throw new Error(table+': '+res.error.message);
  return res.count;
 }
 // Fuentes relacionales + estado modular del servidor. La caché de revisión
 // evita bajar el catálogo completo cada vez que se consultan los indicadores.
 async function legacyCloudCounts(client,ws){
  const meta=await client.rpc('get_workspace_shared_app_state_meta',{p_workspace_id:ws});
  if(meta.error)throw new Error('No se pudo verificar el estado compartido: '+meta.error.message);
  const metaRow=Array.isArray(meta.data)?meta.data[0]:meta.data;
  const rev=metaRow?.revision??0;
  if(legacyMemo.workspace===ws&&legacyMemo.revision===rev&&legacyMemo.counts)return legacyMemo.counts;
  let response=await client.rpc('get_workspace_modular_snapshot',{p_workspace_id:ws});
  if(response.error)response=await client.rpc('get_workspace_shared_app_state',{p_workspace_id:ws});
  if(response.error)throw new Error('No se pudo leer el estado modular: '+response.error.message);
  const row=Array.isArray(response.data)?response.data[0]:response.data;
  const counts=core.legacyFromState(row?.state||{});
  legacyMemo={workspace:ws,revision:rev,counts};
  return counts;
 }
 async function refresh(force=false){
  ensurePanel();if(!onHome()&&!force)return false;
  const session=auth();
  if(!session){
   data=null;verifiedWorkspace='';lastFetch=0;paintKpis();
   setStatus('Esperando autenticación y permisos. Los datos locales no se usan como indicadores.');
   return false;
  }
  if(verifiedWorkspace!==session.workspace){verifiedWorkspace=session.workspace;legacyMemo={workspace:'',revision:null,counts:null};data=null;lastFetch=0;seq++;paintKpis();}
  if(inflight){if(force)refreshAfterInflight=true;return inflight;}
  if(!force&&Date.now()-lastFetch<30000){paint();return true;}
  const ws=session.workspace,client=session.client,stamp=++seq,btn=$('dlLiveRefresh');
  if(btn)btn.disabled=true;
  setStatus('Consultando los registros reales de Supabase…');
  const calls={
   home:rows(client,ws,'home_visits','id,status,patient_id,scheduled_at,completed_at,updated_at,archived_at'),
   patients:rows(client,ws,'patients','id,created_at',q=>q.is('archived_at',null)),
   homeTests:rows(client,ws,'home_visit_tests','id,home_visit_id,test_name,status,quantity'),
   attentions:rows(client,ws,'attentions','id,patient_id,attention_date'),
   attentionTests:rows(client,ws,'attention_tests','id,status'),
   samples:rows(client,ws,'clinical_samples','id,status,workflow_status,processed_at',q=>q.is('deleted_at',null)),
   studies:count(client,ws,'clinical_studies'),
   journeys:rows(client,ws,'journeys','id,journey_date'),
   reports:count(client,ws,'reports'),
   companies:count(client,ws,'companies'),
   invoices:rows(client,ws,'invoices','id,total,issued_at,currency'),
   sharedLegacy:legacyCloudCounts(client,ws)
  };
  const keys=Object.keys(calls);
  inflight=(async()=>{
   const results=await Promise.allSettled(Object.values(calls));
   if(stamp!==seq||ws!==verifiedWorkspace)return false;
   const values={},issues=[];
   for(let i=0;i<results.length;i++){
    if(results[i].status==='fulfilled')values[keys[i]]=results[i].value;
    else {values[keys[i]]=null;issues.push(keys[i]);}
   }
   if(issues.length===keys.length)throw new Error('Ninguna tabla pudo verificarse. Revisa conexión y permisos.');
   data=core.calculate(values);lastFetch=Date.now();paint();
   const time=new Intl.DateTimeFormat('es-PA',{timeZone:'America/Panama',hour:'2-digit',minute:'2-digit'}).format(new Date());
   setStatus(issues.length?
    'Datos parciales de la nube · '+time+'. Sin acceso o lectura a: '+issues.join(', ')+'. «—» significa no verificado; no es cero.'
    :'Datos reales de Supabase · '+time+'. Se reconcilian tablas y estado modular compartido sin duplicar ni modificar registros.');
   return true;
  })().catch(error=>{
   if(stamp===seq){lastError=error?.message||'Error de lectura';paint();setStatus('Error de sincronización del panel: '+lastError+'. No se sustituyeron las cifras por datos locales.');}
   return false;
  }).finally(()=>{if(btn)btn.disabled=false;inflight=null;if(refreshAfterInflight){refreshAfterInflight=false;schedule(true);}});
  return inflight;
 }
 function schedule(force=false){
  if(timer)clearTimeout(timer);
  timer=setTimeout(()=>{timer=0;if(onHome())void refresh(force);},force?900:120);
 }
 function install(){
  if(installed)return;installed=true;
  ensurePanel();
  const old=window.refreshDashboard;
  if(typeof old==='function'){
   window.refreshDashboard=function(){const result=old.apply(this,arguments);if(onHome()){paint();schedule(true);}return result;};
  }
  const kpis=$('operationalKpis');
  if(kpis&&typeof MutationObserver!=='undefined'){
   const observer=new MutationObserver(()=>{if(onHome()&&data)paintKpis();});
   observer.observe(kpis,{childList:true,subtree:true});
  }
  window.addEventListener('flebo:auth-changed',()=>{seq++;data=null;lastFetch=0;paintKpis();schedule(true);});
  window.addEventListener('flebo:home-history-changed',()=>schedule(true));
  window.addEventListener('flebo:cloud-save-confirmed',()=>schedule(true));
  window.addEventListener('flebo:cloud-sync-ready',()=>schedule(true));
  window.addEventListener('flebo:local-state-saved',()=>schedule());
  window.addEventListener('focus',()=>schedule());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule(true);});
  setInterval(()=>{if(onHome()&&!document.hidden)void refresh();},45000);
  schedule(true);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
 window.FleboLiveDashboard={refresh,metrics:()=>data};
})();
