/* FleboReport · Expediente longitudinal, lectura solamente.
 * Consolida atenciones individuales y jornadas por ID/cédula.
 * No modifica ni replica registros guardados. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.FleboPatientActivity=api;
})(typeof window==='undefined'?null:window,function(){
 'use strict';
 const arr=v=>Array.isArray(v)?v:[];
 const str=v=>String(v==null?'':v).trim();
 const norm=v=>str(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const documentOf=p=>str(p?.document||p?.cedula||p?.document_number);
 const dateOf=v=>str(v).slice(0,10);
 const isoDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(dateOf(v))?dateOf(v):'';
 const statusTaken=v=>['tomada','completada','procesada','realizada'].includes(norm(v));
 const currentMonth=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')};
 const keyOf=p=>{const d=norm(documentOf(p));return d?'doc:'+d:'id:'+str(p?.id)};
 const score=p=>(arr(p.attentions).length*4)+(documentOf(p)?10:0)+
  (!p.journeyId?15:0)+['birthDate','sex','phone','email','address','photo'].filter(k=>!!p[k]).length;
 const compareRecent=(a,b)=>str(b.lastDate).localeCompare(str(a.lastDate))||
  str(b.primary.updatedAt||b.primary.createdAt).localeCompare(str(a.primary.updatedAt||a.primary.createdAt))||
  str(a.name).localeCompare(str(b.name),'es');
 function build(state){
  state=state&&typeof state==='object'?state:{};
  const patients=arr(state.patients),groups=new Map(),idToKey=new Map(),byId=new Map();
  for(const p of patients){
   if(!p||typeof p!=='object')continue;
   const key=keyOf(p);if(key==='id:')continue;
   const group=groups.get(key)||{key,people:[],ids:new Set(),document:documentOf(p)};
   group.people.push(p);if(p.id!=null){group.ids.add(str(p.id));idToKey.set(str(p.id),key);byId.set(str(p.id),p)}
   if(!group.document)group.document=documentOf(p);
   groups.set(key,group);
  }
  const catalog=new Map();
  for(const t of arr(state.catalog))if(t&&typeof t==='object'&&t.id!=null){
   catalog.set(str(t.id),str(t.name||t.testName)||'Prueba sin nombre');
  }
  const reports=new Map();
  for(const r of arr(state.reportHistory)){
   const snap=r&&r.snapshot;if(!snap)continue;
   const jid=str(snap.journeyId);if(jid&&!reports.has(jid))reports.set(jid,snap);
   for(const t of arr(snap.tests))if(t?.id!=null&&!catalog.has(str(t.id))&&t.name){
    catalog.set(str(t.id),str(t.name));
   }
  }
  const candidateRows=[];
  for(const entry of arr(state.journeyEntries)){
   if(entry&&typeof entry==='object')candidateRows.push({entry,owner:null,rank:2});
  }
  for(const p of patients){
   for(const entry of arr(p?.journeyHistory)){
    if(entry&&typeof entry==='object')candidateRows.push({entry,owner:p,rank:1});
   }
   // Legacy journey record: only if no newer entry exists for this journey.
   if(p&&p.journeyId&&arr(p.testIds).length){
    candidateRows.push({entry:{
     id:p.journeyParticipantId||'legacy:'+str(p.id),journeyId:p.journeyId,
     patientId:p.id,journeyDate:p.journeyDate||'',
     testIds:p.testIds,testStatuses:p.testStatuses||{},
     createdAt:p.createdAt,updatedAt:p.updatedAt,removedAt:p.removedAt
    },owner:p,rank:0});
   }
  }
  const byJourney=new Map();
  for(const row of candidateRows){
   const e=row.entry,owner=row.owner||byId.get(str(e.patientId||e.patientRecordId));
   const resolvedKey=idToKey.get(str(e.patientId||e.patientRecordId))||
    (owner&&keyOf(owner))||(norm(documentOf(e))?'doc:'+norm(documentOf(e)):'');
   if(!resolvedKey||!groups.has(resolvedKey))continue;
   const jid=str(e.journeyId);
   const stamp=isoDate(e.journeyDate||e.date);
   const key=jid?jid+'|'+resolvedKey:
    str(e.id)?'entry:'+str(e.id)+'|'+resolvedKey:
    'fallback:'+resolvedKey+'|'+stamp;
   const existing=byJourney.get(key),t=Date.parse(e.updatedAt||e.removedAt||e.createdAt||0)||0;
   if(!existing||t>existing.time||(t===existing.time&&row.rank>existing.rank))
    byJourney.set(key,{...row,key:resolvedKey,time:t});
  }
  const journeyByGroup=new Map();
  for(const row of byJourney.values()){
   const e=row.entry;
   if(e.removedAt)continue;
   const jid=str(e.journeyId),snap=reports.get(jid),active=jid&&jid===str(state.journey?.id);
   const sourceDate=isoDate(e.journeyDate||e.date||snap?.journeyDate||(active?state.journey?.date:''));
   const ids=[...new Set(arr(e.testIds).map(str).filter(Boolean))];
   if(!ids.length)continue;
   const tests=ids.map(id=>{
    const status=str(e.testStatuses?.[id]||'pendiente');
    return {id,name:catalog.get(id)||'Prueba sin nombre en el catálogo',status,
      performed:statusTaken(status),result:'',source:'journey'};
   });
   const done=tests.filter(t=>t.performed).length;
   const status=done===tests.length?'Muestras tomadas':done?'Toma parcial':'Pendiente de toma';
   const company=str(e.companyName||snap?.clientName||
     (active?arr(state.companies).find(c=>str(c?.id)===str(state.journey?.companyId))?.name:''));
   const visit={key:'journey:'+row.key+'|'+jid+'|'+str(e.id),id:str(e.id),
    type:'Jornada / Laboratorio',source:'journey',date:sourceDate,
    time:'',status,performed:done>0,tests,company,
    professional:str(e.professional||snap?.responsible||(active?state.journey?.responsible:'')),
    createdAt:str(e.createdAt),notes:'',original:e};
   if(!journeyByGroup.has(row.key))journeyByGroup.set(row.key,[]);
   journeyByGroup.get(row.key).push(visit);
  }
  const result=[];
  for(const group of groups.values()){
   const primary=group.people.slice().sort((a,b)=>score(b)-score(a))[0];
   const unique=new Map();
   for(const p of group.people){
    for(const attention of arr(p.attentions)){
     if(!attention||typeof attention!=='object')continue;
     const identity=str(attention.id)||[isoDate(attention.date),str(attention.type),str(attention.createdAt)].join('|');
     if(!unique.has(identity))unique.set(identity,attention);
    }
   }
   const individual=[...unique.values()].map(a=>{
    const tests=arr(a.tests).filter(Boolean).map(t=>{
     const obj=typeof t==='object'?t:{name:str(t)};
     const status=str(obj.status||'Registrada');
     return {id:str(obj.id||''),name:str(obj.name||obj.testName)||'Prueba',
      status,performed:!['pendiente','cancelada','anulada'].includes(norm(status)),
      result:str(obj.result),source:'individual'};
    });
    return {key:'individual:'+str(a.id||a.createdAt||a.date),id:str(a.id),
     type:str(a.type||'Atención individual'),source:'individual',
     date:isoDate(a.date),time:str(a.time||''),status:'Atención registrada',
     performed:true,tests,company:str(a.company||primary.company),
     professional:str(a.professional),createdAt:str(a.createdAt),
     notes:str(a.notes),conclusions:str(a.conclusions),original:a};
   });
   const records=individual.concat(journeyByGroup.get(group.key)||[])
    .sort((a,b)=>str(b.date).localeCompare(str(a.date))||
      str(b.createdAt).localeCompare(str(a.createdAt)));
   const visits=records.filter(x=>x.performed);
   const allTests=records.flatMap(x=>x.tests);
   const testsPerformed=allTests.filter(x=>x.performed).length;
   const results=allTests.filter(x=>x.result).length;
   const lastDate=visits.find(x=>x.date)?.date||'';
   const anyNonEmpty=group.people.find(p=>p.name||p.fullName)||primary;
   const detail=k=>group.people.find(p=>p[k])?.[k]||primary[k]||'';
   result.push({
    key:group.key,primary,id:str(primary.id),
    name:str(anyNonEmpty.name||anyNonEmpty.fullName||'Paciente'),
    document:group.document,
    birthDate:str(detail('birthDate')),sex:str(detail('sex')),
    phone:str(detail('phone')),photo:detail('photo'),
    records,visits:visits.length,lastDate,testsPerformed,results,
    recurrent:visits.length>1,
    monthlyVisits:visits.filter(x=>x.date.startsWith(currentMonth())).length,
    visitsRecent:!!lastDate&&(() => {const d=new Date(lastDate+'T00:00:00');const age=Date.now()-d.getTime();return !Number.isNaN(age)&&age>=0&&age<=30*86400000})(),
    allTests,hasJourneyRecords:records.some(x=>x.source==='journey')
   });
  }
  result.sort(compareRecent);
  const summary={
   totalPatients:result.length,monthlyVisits:result.reduce((n,p)=>n+p.monthlyVisits,0),
   testsPerformed:result.reduce((n,p)=>n+p.testsPerformed,0),
   returning:result.filter(p=>p.recurrent).length
  };
  return {patients:result,summary,byId:id=>result.find(p=>p.id===str(id)||p.key==='doc:'+norm(id)||p.document&&norm(p.document)===norm(id))||null};
 }
 return {build,normalizeDocument:norm,statusTaken};
});
