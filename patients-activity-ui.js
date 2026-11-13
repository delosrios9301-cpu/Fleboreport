/* FleboReport · Pacientes integrados con las jornadas reales.
 * Capa de interfaz, no modifica los pacientes ni sus muestras.
 * La agrupación longitudinal se calcula en patients-activity-model.js. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const state=()=>window.FleboAppState?.get?.()||{};
 const model=()=>window.FleboPatientActivity?.build?.(state());
 const mk=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=String(text);return x};
 const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const calendarIcon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v5M16 2v5M3 10h18"/></svg>';
 const userIcon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/></svg>';
 const fileIcon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h6"/></svg>';
 const searchIcon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>';
 const testIcon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2h6M10 2v8l-6 9a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-6-9V2M7 16h10"/></svg>';
 const icon=(key)=>({calendar:calendarIcon,user:userIcon,file:fileIcon,test:testIcon,search:searchIcon})[key]||fileIcon;
 const localDate=value=>{
  const d=String(value||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return '—';
  const obj=new Date(d+'T00:00:00');
  return Number.isNaN(obj.getTime())?'—':obj.toLocaleDateString('es-PA',{day:'2-digit',month:'short',year:'numeric'});
 };
 const elementIcon=(name,cls)=>{const item=mk('span',cls);item.innerHTML=icon(name);return item};
 function control(title,cls,handler){
  const b=mk('button',cls,title);b.type='button';b.addEventListener('click',handler);return b;
 }
 function sourceModel(id){
  const m=model();return m?.byId?.(id)||null;
 }
 let listMode='all',configured=false,rendering=false;
 function configure(){
  if(configured||!$('patientsHome'))return;
  configured=true;
  const root=$('view-patients');root?.classList.add('pp-integrated');
  const heading=$('patientsHome')?.querySelector(':scope > .page-heading');
  if(heading&&!heading.querySelector('.pp-heading-icon')){
   const mark=elementIcon('user','pp-heading-icon');heading.prepend(mark);
   const header=heading.querySelector(':scope > div');
   if(header)header.querySelector('.eyebrow')?.remove();
   const subtitle=heading.querySelector('p');if(subtitle)subtitle.textContent='Expedientes y atenciones';
  }
  const panel=$('patientsHome')?.querySelector('[data-fr5-area="patient-directory"]');
  const fields=panel?.querySelector('.pp-search-fields');
  const search=$('patientSearch');
  if(search){
   search.placeholder='Buscar paciente por nombre o cédula…';
   search.setAttribute('aria-label','Buscar pacientes por nombre, cédula, teléfono o prueba');
  }
  if(fields&&!fields.classList.contains('pp-compact-search')){
   fields.classList.add('pp-compact-search');
   const first=fields.querySelector('.field');
   if(first&&!first.querySelector('.pp-search-icon'))first.prepend(elementIcon('search','pp-search-icon'));
  }
  const date=$('patientDateFilter')?.closest('.field');
  const chips=panel?.querySelector('.pp-list-chips');
  if(date&&chips&&!panel.querySelector('.pp-date-filter')){
   const details=mk('details','pp-date-filter');
   details.append(mk('summary','','Filtrar por fecha'));
   date.before(details);details.append(date);
   chips.after(details);
  }
  if(panel&&fields&&!$('ppPatientSearchPanel')){
   const searchPanel=mk('section','pp-search-panel');
   searchPanel.id='ppPatientSearchPanel';
   panel.before(searchPanel);
   searchPanel.append(fields);
   const filters=mk('div','pp-filter-row');
   searchPanel.append(filters);
   if(chips)filters.append(chips);
   const dateDetails=panel.querySelector('.pp-date-filter');
   if(dateDetails){
    const summary=dateDetails.querySelector('summary');
    if(summary){
     summary.textContent='Fecha';
     summary.setAttribute('aria-label','Filtrar atenciones por fecha');
    }
    filters.append(dateDetails);
   }
  }
  if(panel&&!panel.querySelector('.pp-directory-head-icon')){
   const header=panel.querySelector(':scope > .panel-head');
   const title=header?.querySelector('h2');
   if(title){title.before(elementIcon('file','pp-directory-head-icon'))}
  }
  if(panel&&chips&&!chips.dataset.integrated){
   chips.dataset.integrated='1';
   for(const button of chips.querySelectorAll('[data-pp-list-filter]')){
    button.addEventListener('click',()=>{
     listMode=button.dataset.ppListFilter||'all';
     renderDirectory();
    });
   }
  }
 }
 function renderDirectory(){
  if(rendering)return;
  const host=$('ppPatientCards'),m=model();if(!host||!m)return;
  configure();rendering=true;
  try{
   const search=norm($('patientSearch')?.value),date=String($('patientDateFilter')?.value||'').slice(0,10);
   const chips=$('patientsHome')?.querySelectorAll('[data-pp-list-filter]')||[];
   chips.forEach(b=>{
    const on=(b.dataset.ppListFilter||'all')===listMode;
    b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));
   });
   const rows=m.patients.filter(person=>{
    if(date&&!person.records.some(r=>r.date===date))return false;
    if(listMode==='returning'&&!person.recurrent)return false;
    if(listMode==='recent'&&!person.visitsRecent)return false;
    const hay=[person.name,person.document,person.phone,...person.records.flatMap(r=>[
     r.type,r.company,...r.tests.map(t=>t.name)])].join(' ');
    return !search||norm(hay).includes(search);
   });
   const frag=document.createDocumentFragment();
   for(const person of rows){
    const card=mk('article','pp-directory-card pp-integrated-card');
    card.dataset.patientId=person.id;
    const avatar=elementIcon('user','pp-directory-avatar');
    const info=mk('div','pp-directory-info');
    info.append(mk('strong','',person.name||'Paciente'));
    const doc=mk('span','pp-patient-meta');
    doc.append(elementIcon('file','pp-inline-icon'),document.createTextNode('Cédula: '+(person.document||'—')));
    info.append(doc);
    const last=mk('span','pp-patient-meta');
    last.append(elementIcon('calendar','pp-inline-icon'),document.createTextNode('Última atención: '+localDate(person.lastDate)));
    info.append(last);
    const visits=mk('div','pp-patient-visits');
    visits.append(mk('span','','Atenciones'),mk('strong','',person.visits));
    const open=control('Ver expediente ›','pp-open-patient',()=>{
     const successful=window.FleboPatientsPremium?.openPatientRecord?.(person.id);
     if(!successful)window.toast?.('No fue posible abrir el expediente de este paciente.');
    });
    open.setAttribute('aria-label','Ver expediente de '+person.name);
    card.append(avatar,info,visits,open);
    frag.append(card);
   }
   if(!rows.length)frag.append(mk('p','pp-empty','No hay pacientes que coincidan con los filtros.'));
   host.replaceChildren(frag);
   const count=$('patientCount');if(count)count.textContent=rows.length+' registros';
   const values={
    individualPatientsTotal:m.summary.totalPatients,
    individualMonthlyVisits:m.summary.monthlyVisits,
    individualTestsTotal:m.summary.testsPerformed,
    individualReturning:m.summary.returning
   };
   for(const [id,value] of Object.entries(values)){const node=$(id);if(node)node.textContent=String(value)}
  }finally{rendering=false}
 }
 function row(record){
  const article=mk('article','pp-event-card');
  const date=mk('div','pp-event-date');
  date.append(mk('strong','',localDate(record.date)));
  if(record.time)date.append(mk('small','',record.time));
  const text=mk('div','pp-event-info');
  text.append(mk('strong','',record.type));
  if(record.tests.length)text.append(mk('span','','Pruebas: '+record.tests.map(t=>t.name).join(', ')));
  if(record.company)text.append(mk('span','','Empresa: '+record.company));
  if(record.professional)text.append(mk('span','','Responsable: '+record.professional));
  const status=mk('span','pp-event-status',record.status);
  if(record.source==='journey'&&record.status==='Muestras tomadas')status.classList.add('is-complete');
  const action=mk('div','pp-event-action');
  if(record.source==='individual'&&record.id){
   action.append(control('Ver ›','pp-event-open',()=>window.showAttentionDetail?.(record.id)));
   action.append(control('Editar','pp-event-edit',()=>window.editAttention?.(record.id)));
  }else{
   const details=mk('details','pp-event-details');
   details.append(mk('summary','','Ver pruebas ›'));
   const list=mk('div','pp-event-tests');
   for(const t of record.tests){
    const entry=mk('div','pp-event-test');
    entry.append(mk('strong','',t.name),mk('span','',t.performed?'Muestra tomada':'Pendiente por tomar'));
    list.append(entry);
   }
   details.append(list);action.append(details);
  }
  article.append(date,text,status,action);
  return article;
 }
 function renderWorkspace(){
  const native=window.indPatient?.(),p=native&&sourceModel(native.id);
  if(!native||!p||!$('ppRecordHero'))return;
  const name=$('ppRecordName'),doc=$('ppRecordDocument');
  if(name)name.textContent=p.name;
  if(doc)doc.textContent='Cédula: '+(p.document||'—');
  const extra=$('ppProfileExtra');
  if(extra){
   extra.replaceChildren();
   for(const [k,label] of [['calendar','Nacimiento: '+localDate(p.birthDate)],
    ['user','Sexo: '+(p.sex||'—')],['file','Teléfono: '+(p.phone||'—')]]){
    const item=mk('span','pp-profile-field');
    item.append(elementIcon(k,''),document.createTextNode(label));extra.append(item);
   }
  }
  const portrait=$('ppRecordHero')?.querySelector('.pp-portrait');
  if(portrait){
   portrait.replaceChildren();
   if(typeof p.photo==='string'&&(/^data:image\/(png|jpeg|webp);base64,/i.test(p.photo)||/^https:\/\//i.test(p.photo))){
    const img=mk('img');img.src=p.photo;img.alt='Fotografía del paciente';portrait.append(img);
   }else portrait.append(elementIcon('user',''));
  }
  const nativeEdit=$('patient-tab-personal')?.querySelector('button[onclick*="editIndividualPatient"]');
  const edit=$('ppRecordHero')?.querySelector('.pp-outline-edit');
  if(edit){
   const denied=!nativeEdit||nativeEdit.hidden||nativeEdit.disabled||
    window.getComputedStyle(nativeEdit).display==='none';
   edit.hidden=denied;
  }
  const stats={ppKpiVisits:p.visits,ppKpiTests:p.testsPerformed,ppKpiResults:p.results,
   ppKpiReturn:p.recurrent?'Sí':'No',patientVisitTotal:p.visits,
   patientTestTotal:p.testsPerformed,patientLastVisit:localDate(p.lastDate)};
  Object.entries(stats).forEach(([id,value])=>{const n=$(id);if(n)n.textContent=String(value)});
  const timeline=$('patientHistoryTimeline');
  if(timeline){
   timeline.classList.add('pp-activity-timeline');
   const frag=document.createDocumentFragment();
   for(const record of p.records)frag.append(row(record));
   if(!p.records.length)frag.append(mk('p','pp-empty','Aún no hay atenciones o jornadas asociadas a este expediente.'));
   timeline.replaceChildren(frag);
  }
  const histCount=$('ppTimelineCount');if(histCount)histCount.textContent=p.records.length+' registros';
  const tests=$('patientTestsList');
  if(tests){
   const frag=document.createDocumentFragment();
   for(const record of p.records){
    for(const test of record.tests){
     const item=mk('article','pp-activity-test');
     item.append(elementIcon('test','pp-activity-test-icon'));
     const content=mk('div','pp-activity-test-info');
     content.append(mk('strong','',test.name));
     content.append(mk('small','','Fecha: '+localDate(record.date)+' · '+record.type));
     item.append(content,mk('span','pp-activity-test-status',test.performed?
       (record.source==='journey'?'Muestra tomada':'Registrada'):
       (test.status||'Pendiente')));
     frag.append(item);
    }
   }
   if(!frag.childNodes.length)frag.append(mk('p','pp-empty','Sin pruebas registradas.'));
   tests.replaceChildren(frag);
  }
  const results=$('ppResultList');
  if(results){
   const frag=document.createDocumentFragment();
   for(const record of p.records)for(const test of record.tests){
    if(!String(test.result||'').trim())continue;
    const item=mk('article','pp-result-item');
    item.append(mk('strong','',test.name),mk('span','',test.result),
     mk('small','','Atención del '+localDate(record.date)));
    frag.append(item);
   }
   if(!frag.childNodes.length)frag.append(mk('p','pp-empty','No hay resultados informados en este expediente.'));
   results.replaceChildren(frag);
  }
  const notes=$('ppNoteList');
  if(notes){
   const frag=document.createDocumentFragment();
   for(const record of p.records){
    for(const [label,value] of [['Observaciones',record.notes],['Conclusiones',record.conclusions]]){
     if(!value)continue;
     const item=mk('article','pp-note-item');
     item.append(mk('strong','',label+' · '+localDate(record.date)),mk('p','',value));frag.append(item);
    }
   }
   const key=window.FleboPatientActivity?.normalizeDocument?.(p.document);
   for(const candidate of (state().patients||[])){
    if(window.FleboPatientActivity?.normalizeDocument?.(candidate.document||candidate.cedula)!==key)continue;
    if(!candidate.generalNotes)continue;
    const item=mk('article','pp-note-item');
    item.append(mk('strong','','Observaciones generales'),mk('p','',candidate.generalNotes));frag.append(item);
   }
   if(!frag.childNodes.length)frag.append(mk('p','pp-empty','No hay notas registradas.'));
   notes.replaceChildren(frag);
  }
  const modal=$('ppExpedientDialog');
  if(modal)modal.setAttribute('aria-label','Expediente de '+p.name);
 }
 function refresh(){configure();renderDirectory();if(!$('patientWorkspace')?.hidden)renderWorkspace()}
 function init(){
  if(configured)return;
  configure();
  refresh();
  window.addEventListener('flebo:cloud-state-applied',refresh);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
 else init();
 window.FleboPatientActivityUI={renderDirectory,renderWorkspace,refresh};
})();
