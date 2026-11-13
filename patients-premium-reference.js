/* FleboReport · Pacientes Premium 3.0
   Presentación sobre expediente y atenciones existentes. No crea identidades,
   resultados, documentos ni cambios de datos automáticamente. */
(function(){
 'use strict';
 let ready=false,directoryMode='all',paintQueued=false;
 const $=id=>document.getElementById(id);
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n};
 const icon=key=>{
  const shapes={
   back:'<path d="m15 18-6-6 6-6"/><path d="M9 12h12"/>',
   user:'<circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/>',
   pen:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L9 17l-4 1 1-4Z"/>',
   calendar:'<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>',
   test:'<path d="M9 3h6M10 3v7l-5.5 9a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 10V3M8 16h8"/>',
   file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
   repeat:'<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/>',
   clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
   chevron:'<path d="m9 6 6 6-6 6"/>',
   printer:'<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 15h12v7H6z"/>',
   share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m9 11 6-5M9 13l6 5"/>',
   search:'<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
   note:'<path d="M4 4h16v16H4zM8 9h8M8 13h8M8 17h5"/>',
   clip:'<path d="M21 11.5 12 20a5 5 0 0 1-7-7L14 4a3 3 0 0 1 4 4L9 17a1 1 0 0 1-2-2l9-9"/>',
   plus:'<path d="M12 5v14M5 12h14"/>',
   info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>'
  };
  return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'+(shapes[key]||shapes.file)+'</svg>';
 };
 const findPatient=()=>{
  // Se llama únicamente desde el expediente que el sistema ya autorizó a abrir.
  return typeof window.indPatient==='function'?window.indPatient():null;
 };
 const localDate=date=>{
  if(!date)return '—';
  const d=new Date(String(date).slice(0,10)+'T00:00:00');
  return Number.isNaN(d.getTime())?String(date):d.toLocaleDateString('es',{day:'2-digit',month:'short',year:'numeric'});
 };
 function button(label,klass,callback,iconKey){
  const b=el('button',klass);b.type='button';
  if(iconKey){const i=el('span','pp-icon');i.innerHTML=icon(iconKey);b.append(i)}
  b.append(document.createTextNode(label));b.addEventListener('click',callback);
  return b;
 }
 function nativeCall(name,...args){
  if(typeof window[name]==='function')return window[name](...args);
 }
 function createHome(){
  const home=$('patientsHome');if(!home)return;
  home.classList.add('pp-home');
  const heading=home.querySelector(':scope > .page-heading');
  if(heading){
   const title=heading.querySelector('h1'),description=heading.querySelector('p');
   if(title)title.textContent='Pacientes';
   if(description)description.textContent='Expedientes y atenciones en un solo lugar.';
   const eyebrow=heading.querySelector('.eyebrow');if(eyebrow)eyebrow.textContent='FLEBOREPORT / ESPACIO CLÍNICO';
   const add=heading.querySelector('button');if(add)add.textContent='＋ Nuevo paciente';
  }
  const grid=home.querySelector(':scope > .stats-grid');
  if(grid)grid.classList.add('pp-home-kpis');
  const directory=home.querySelector('[data-fr5-area="patient-directory"]');
  if(directory&&grid)grid.after(directory);
  if(directory){
   directory.classList.add('pp-directory');
   const head=directory.querySelector(':scope > .panel-head');
   if(head){
    const heading=head.querySelector('h2');if(heading)heading.textContent='Listado de pacientes';
   }
   const body=directory.querySelector(':scope > .panel-body');
   const fields=body?.querySelector('.fields');
   if(fields){
    fields.classList.add('pp-search-fields');
    const search=$('patientSearch');
    if(search)search.placeholder='Buscar por nombre, cédula o teléfono…';
    const chips=el('div','pp-list-chips');
    chips.setAttribute('role','group');chips.setAttribute('aria-label','Filtrar expedientes');
    for(const [mode,label] of [['all','Todos'],['recent','Recientes (30 días)'],['returning','Recurrentes']]){
     const b=button(label,'pp-chip',()=>{directoryMode=mode;renderDirectory()});
     b.dataset.ppListFilter=mode;chips.append(b);
    }
    fields.after(chips);
   }
   const cards=el('div','pp-patient-cards');cards.id='ppPatientCards';
   const table=directory.querySelector('.table-wrap');
   if(table)table.after(cards);
  }
  const finance=home.querySelector('[data-fr5-area="patient-finance"]');
  const revenue=home.querySelector('[data-fr5-area="patient-revenue"]');
  const insights=home.querySelector('[data-fr5-area="patient-insights"]');
  if(finance||revenue||insights){
   const advanced=el('details','pp-advanced');
   const summ=el('summary','','Estadísticas y análisis complementarios');
   advanced.append(summ);
   for(const section of [finance,revenue,insights])if(section)advanced.append(section);
   home.append(advanced);
  }
 }
 function pickRecord(original){
  const buttonEl=original.querySelector('button.link-button');
  const onclick=buttonEl?.getAttribute('onclick')||'';
  const match=onclick.match(/openPatient\('([^']+)'\)/);
  const id=match?.[1];
  const all=window.FleboAppState?.get?.()?.patients;
  const patient=Array.isArray(all)?all.find(x=>String(x.id)===id):null;
  return {patient,openButton:buttonEl};
 }
 function recentPatient(record){
  const dates=(record?.attentions||[]).map(x=>String(x.date||'').slice(0,10)).filter(Boolean).sort().reverse();
  if(!dates.length)return false;
  const d=new Date(dates[0]+'T00:00:00');
  if(Number.isNaN(d.getTime()))return false;
  const age=Date.now()-d.getTime();
  return age>=0&&age<=30*24*60*60*1000;
 }
 function renderDirectory(){
  const host=$('ppPatientCards'),tbody=$('patientList');if(!host||!tbody)return;
  for(const chip of document.querySelectorAll('[data-pp-list-filter]')){
   const active=chip.dataset.ppListFilter===directoryMode;
   chip.classList.toggle('selected',active);chip.setAttribute('aria-pressed',String(active));
  }
  const rows=Array.from(tbody.querySelectorAll('tr')).filter(tr=>tr.querySelector('button.link-button'));
  const fragment=document.createDocumentFragment();let count=0;
  for(const tr of rows){
   const {patient,openButton}=pickRecord(tr),cells=tr.querySelectorAll('td');
   const visits=Number(cells[4]?.textContent)||0;
   if(directoryMode==='returning'&&visits<=1)continue;
   if(directoryMode==='recent'&&!recentPatient(patient))continue;
   count++;
   const card=el('article','pp-directory-card');
   const avatar=el('span','pp-directory-avatar');avatar.innerHTML=icon('user');
   const info=el('div','pp-directory-info');
   info.append(el('strong','',cells[0]?.textContent?.trim()||'Paciente'));
   info.append(el('small','','Cédula: '+(cells[1]?.textContent?.trim()||'—')));
   const meta=el('span','pp-directory-meta',
    (visits+' '+(visits===1?'atención':'atenciones'))+' · Última: '+(cells[3]?.textContent?.trim()||'—'));
   info.append(meta);
   const open=button('Ver expediente','pp-open-patient',()=>openButton?.click(),'chevron');
   open.setAttribute('aria-label','Ver expediente de '+(cells[0]?.textContent?.trim()||'paciente'));
   card.append(avatar,info,open);fragment.append(card);
  }
  if(!count){
   const phrase=directoryMode==='recent'?'No hay atenciones registradas en los últimos 30 días.':
    directoryMode==='returning'?'No hay pacientes con más de una atención en los resultados.':
    'No hay pacientes que coincidan con los filtros.';
   fragment.append(el('p','pp-empty',phrase));
  }
  host.replaceChildren(fragment);
 }
 function createWorkspace(){
  const space=$('patientWorkspace');if(!space)return;
  space.classList.add('pp-workspace');
  const nativeHead=space.querySelector(':scope > .panel-head');
  const hero=el('section','pp-record-hero');
  hero.id='ppRecordHero';
  const titleRow=el('div','pp-record-title');
  titleRow.append(button('Volver','pp-back',()=>nativeCall('closePatientWorkspace'),'back'));
  const text=el('div','pp-title-copy');
  text.append(el('h2','','Expediente del paciente'));
  text.append(el('p','','Consulta, historial de atenciones y resultados'));
  titleRow.append(text);
  const edit=button('Editar','pp-outline-edit',()=>nativeCall('editIndividualPatient'),'pen');
  titleRow.append(edit);
  const card=el('div','pp-profile-card');
  const portrait=el('span','pp-portrait');portrait.innerHTML=icon('user');
  const identity=el('div','pp-profile-info');
  const name=el('h3','');name.id='ppRecordName';
  const doc=el('p','');doc.id='ppRecordDocument';
  const extra=el('div','pp-profile-extra');extra.id='ppProfileExtra';
  identity.append(name,doc,extra);
  card.append(portrait,identity);
  hero.append(titleRow,card);
  space.insertBefore(hero,nativeHead);
  const stats=el('div','pp-record-kpis');
  const definitions=[
   ['Atenciones','calendar','ppKpiVisits','violet'],
   ['Pruebas','test','ppKpiTests','teal'],
   ['Resultados','file','ppKpiResults','blue'],
   ['Recurrente','repeat','ppKpiReturn','pink']
  ];
  for(const [label,glyph,id,variant] of definitions){
   const item=el('div','pp-record-kpi pp-'+variant);
   const pic=el('span','pp-kpi-glyph');pic.innerHTML=icon(glyph);
   const texts=el('div','pp-kpi-copy');
   const value=el('strong','');value.id=id;
   texts.append(value,el('small','',label));item.append(pic,texts);stats.append(item);
  }
  const nativeStats=space.querySelector(':scope > .stats-grid');
  if(nativeStats)nativeStats.before(stats);
  const nativeTabs=space.querySelector('.patient-record-tabs');
  if(nativeTabs){
   const tabs=el('nav','pp-record-tabs');tabs.setAttribute('aria-label','Secciones del expediente');
   for(const [key,label,glyph] of [
    ['history','Historial','calendar'],['tests','Pruebas','test'],
    ['results','Resultados','file'],['evidence','Documentos','clip'],
    ['notes','Notas','note']
   ]){
    const b=button(label,'pp-tab',()=>nativeCall('showPatientTab',key),glyph);
    b.dataset.ppTab=key;b.setAttribute('aria-pressed','false');tabs.append(b);
   }
   nativeTabs.before(tabs);
   const extras=el('details','pp-other-tabs');
   extras.append(el('summary','','Otras secciones del expediente'));
   extras.append(nativeTabs);
   tabs.after(extras);
  }
  const results=el('section','patient-tab pp-data-section');
  results.id='patient-tab-results';results.hidden=true;
  results.append(el('h3','','Resultados disponibles'));
  results.append(el('div','pp-result-list'));results.lastChild.id='ppResultList';
  const notes=el('section','patient-tab pp-data-section');
  notes.id='patient-tab-notes';notes.hidden=true;
  notes.append(el('h3','','Notas del expediente'));
  notes.append(el('div','pp-note-list'));notes.lastChild.id='ppNoteList';
  const nativeReports=$('patient-tab-reports');
  if(nativeReports)nativeReports.before(results,notes);
  const nativeHistory=$('patient-tab-history');
  nativeHistory?.classList.add('pp-history-section');
  const footer=el('div','pp-workspace-actions');
  footer.append(
   button('Nueva atención','pp-primary-action',()=>nativeCall('openAttentionForm'),'plus'),
   button('Imprimir expediente','pp-secondary-action',()=>nativeCall('printPatientHistory'),'printer'),
   button('Compartir','pp-secondary-action',()=>{
    if(!window.confirm('Compartir enviará el nombre y la cédula del paciente a la aplicación seleccionada. ¿Continuar?'))return;
    nativeCall('sharePatientReport');
   },'share')
  );
  const nativeForm=$('attentionForm');
  if(nativeForm)nativeForm.before(footer);
  else space.append(footer);
 }
 function renderWorkspace(){
  const p=findPatient();if(!p||!$('ppRecordHero'))return;
  $('ppRecordName').textContent=p.name||p.fullName||'Paciente';
  $('ppRecordDocument').textContent='Cédula: '+(p.document||p.cedula||'—');
  const extra=$('ppProfileExtra');extra.replaceChildren();
  for(const [glyph,label] of [
   ['calendar','Nacimiento: '+localDate(p.birthDate)],
   ['user','Sexo: '+(p.sex||'—')],
   ['file','Teléfono: '+(p.phone||'—')]
  ]){
   const tag=el('span','pp-profile-field');const i=el('span','');i.innerHTML=icon(glyph);
   tag.append(i,document.createTextNode(label));extra.append(tag);
  }
  const photo=p.photo;
  const portrait=$('ppRecordHero').querySelector('.pp-portrait');
  if(portrait){
   portrait.replaceChildren();
   if(typeof photo==='string'&&(/^data:image\/(png|jpeg|webp);base64,/i.test(photo)||/^https:\/\//i.test(photo))){
    const im=el('img');im.src=photo;im.alt='Foto del paciente';portrait.append(im);
   }else portrait.innerHTML=icon('user');
  }
  const attentions=Array.isArray(p.attentions)?p.attentions:[];
  const tests=attentions.flatMap(a=>Array.isArray(a.tests)?a.tests:[]);
  const resultTests=tests.filter(t=>t&&typeof t==='object'&&String(t.result||'').trim().length);
  $('ppKpiVisits').textContent=attentions.length;
  $('ppKpiTests').textContent=tests.length;
  $('ppKpiResults').textContent=resultTests.length;
  $('ppKpiReturn').textContent=attentions.length>1?'Sí':'No';
  const results=$('ppResultList');
  if(results){
   results.replaceChildren();
   if(!resultTests.length)results.append(el('p','pp-empty','Este expediente no tiene resultados registrados.'));
   for(const a of attentions){
    for(const t of (a.tests||[])){
     if(!t||typeof t!=='object'||!String(t.result||'').trim())continue;
     const item=el('article','pp-result-item');
     item.append(el('strong','',t.name||'Prueba'));
     item.append(el('span','',String(t.result)));
     item.append(el('small','','Atención: '+localDate(a.date)));
     results.append(item);
    }
   }
  }
  const notes=$('ppNoteList');
  if(notes){
   notes.replaceChildren();
   if(p.generalNotes)notes.append(noteItem('Observaciones generales',p.generalNotes));
   for(const a of attentions){
    if(a.notes)notes.append(noteItem('Atención del '+localDate(a.date),a.notes));
    if(a.conclusions)notes.append(noteItem('Conclusiones del '+localDate(a.date),a.conclusions));
   }
   if(!notes.children.length)notes.append(el('p','pp-empty','Todavía no hay notas registradas.'));
  }
  // La línea temporal usa exclusivamente atenciones verdaderamente guardadas.
  const timeline=$('patientHistoryTimeline');
  if(timeline){
   const arr=[...attentions].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
   timeline.replaceChildren();
   if(!arr.length)timeline.append(el('p','pp-empty','Este paciente todavía no tiene atenciones.'));
   for(const a of arr){
    const card=el('article','pp-timeline-row');
    const date=el('div','pp-timeline-date');
    date.append(el('strong','',localDate(a.date)));
    if(a.time)date.append(el('span','',String(a.time)));
    const content=el('div','pp-timeline-main');
    content.append(el('strong','',a.type||'Atención'));
    if(a.reason)content.append(el('small','',a.reason));
    const names=(a.tests||[]).map(t=>typeof t==='string'?t:(t.name||'')).filter(Boolean).join(', ');
    if(names)content.append(el('small','','Pruebas: '+names));
    if(a.professional)content.append(el('small','','Responsable: '+a.professional));
    const actions=el('div','pp-timeline-actions');
    const see=button('Ver','pp-timeline-view',()=>nativeCall('showAttentionDetail',a.id),'chevron');
    see.setAttribute('aria-label','Ver atención de '+localDate(a.date));
    actions.append(see);
    card.append(date,content,actions);timeline.append(card);
   }
  }
 }
 function noteItem(label,value){
  const node=el('article','pp-note-item');
  node.append(el('strong','',label),el('p','',value));return node;
 }
 function activateTab(name){
  for(const b of document.querySelectorAll('[data-pp-tab]')){
   const active=b.dataset.ppTab===name;
   b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));
  }
 }
 function refresh(){
  if(!ready)return;
  renderDirectory();
  if(!$('patientWorkspace')?.hidden)renderWorkspace();
 }
 function scheduleRefresh(){
  if(paintQueued)return;
  paintQueued=true;
  requestAnimationFrame(()=>{paintQueued=false;refresh()});
 }
 function wrap(fn,after){
  const original=window[fn];if(typeof original!=='function')return;
  window[fn]=function(...args){
   const result=original.apply(this,args);
   after(...args);
   return result;
  };
 }
 function mount(){
  if(ready)return;
  const home=$('patientsHome'),space=$('patientWorkspace');
  if(!home||!space||typeof window.renderPatients!=='function'||typeof window.renderPatientWorkspace!=='function')return;
  ready=true;
  const v=$('view-patients');v?.classList.add('pp-premium');
  createHome();createWorkspace();
  wrap('renderPatients',scheduleRefresh);
  wrap('renderPatientWorkspace',renderWorkspace);
  wrap('showPatientTab',activateTab);
  wrap('openPatient',()=>{
   // Ver expediente abre el historial como en la referencia.
   window.showPatientTab?.('history');
   window.scrollTo?.({top:0,behavior:'auto'});
  });
  const tbody=$('patientList');
  if(tbody)new MutationObserver(scheduleRefresh).observe(tbody,{childList:true});
  window.addEventListener('flebo:cloud-state-applied',scheduleRefresh);
  refresh();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
 else mount();
 window.FleboPatientsPremium={refresh:()=>{if(!ready)mount();refresh()},getDirectoryMode:()=>directoryMode};
})();