/* FleboReport · Reportes e Historial 2026-11-13.
   Vista premium no destructiva: los registros, controles, filtros y
   funciones originales siguen siendo la única fuente de verdad. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const state=()=>window.FleboAppState?.get?.()||{};
 const has=(module,action='view')=>typeof window.fleboCan==='function'
   ?window.fleboCan(module,action):false;
 const icons={
  report:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  stats:'<path d="M3 20v-5h4v5M10 20V9h4v11M17 20V4h4v16"/>',
  patients:'<circle cx="9" cy="8" r="3"/><path d="M2 21v-2a7 7 0 0 1 14 0v2"/><circle cx="19" cy="9" r="2"/><path d="M18 17c3 0 4 1.5 4 4"/>',
  layers:'<path d="m12 2 10 6-10 6L2 8l10-6ZM2 13l10 6 10-6M2 18l10 5 10-5"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 15l2 2 5-5"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10H3V7Z"/>',
  clipboard:'<rect x="4" y="5" width="16" height="17" rx="2"/><path d="M9 5V3h6v2M8 12l2 2 5-5"/>',
  tube:'<path d="M8 3h8M10 3v11l-5 5a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-5V3M8 16h8"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 9a8 8 0 0 1 14-2l1 1M19 15a8 8 0 0 1-14 2l-1-1"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m5 18 5-5 3 3 3-4 4 6"/>',
  file:'<path d="M6 2h8l5 5v14H6V2ZM14 2v6h5M9 12h7M9 16h5"/>',
  filter:'<path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z"/>',
  print:'<path d="M6 9V3h12v6M6 18H4V10h16v8h-2M6 15h12v7H6v-7Z"/>'
 };
 function el(tag,klass,text){
  const n=document.createElement(tag);
  if(klass)n.className=klass;
  if(text!==undefined)n.textContent=String(text);
  return n;
 }
 function icon(name,klass='rhr-icon'){
  const node=el('span',klass);
  node.setAttribute('aria-hidden','true');
  node.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'+(icons[name]||icons.report)+'</svg>';
  return node;
 }
 function button(label,klass,fn,shape){
  const b=el('button',klass);b.type='button';
  if(shape)b.append(icon(shape));
  if(label)b.append(el('span','',label));
  if(fn)b.addEventListener('click',fn);
  return b;
 }
 function openView(view){
  if(typeof window.navigate==='function')window.navigate(view);
 }
 function title(name,shape){
  const root=el('header','rhr-title');
  const left=el('div','rhr-title-inner');
  left.append(icon(shape,'rhr-main-symbol'),el('h1','',name));
  const dots=el('span','rhr-dots');
  dots.setAttribute('aria-hidden','true');
  for(let i=0;i<3;i++)dots.append(el('i',i===0?'active':''));
  root.append(left,dots);
  return root;
 }
 function allowReportExport(){
  return has('reports','export')||has('reports','print');
 }
 function archived(){
  return (Array.isArray(state().reportHistory)?state().reportHistory:[]).slice()
   .filter(x=>x&&x.id&&x.snapshot)
   .sort((a,b)=>new Date(b.savedAt||0)-new Date(a.savedAt||0));
 }
 function prettyDate(raw){
  const d=new Date(raw||'');
  return Number.isFinite(d.getTime())?d.toLocaleDateString('es-PA',{day:'numeric',month:'short',year:'numeric'}):'—';
 }
 function prettyTime(raw){
  const d=new Date(raw||'');
  return Number.isFinite(d.getTime())?d.toLocaleTimeString('es-PA',{hour:'2-digit',minute:'2-digit'}):'—';
 }
 function openArchive(id,format){
  if(!has('audit','view')){window.toast?.('No tienes acceso al archivo de auditoría.');return;}
  openView('audit');
  if(typeof window.renderReportHistory==='function')window.renderReportHistory();
  if(typeof window.openArchivedReport!=='function')return;
  window.openArchivedReport(id);
  if(format&&allowReportExport()&&typeof window.downloadArchivedReport==='function'){
   window.downloadArchivedReport(format);
  }
 }
 let reportsReady=false;
 function makeReportKpis(root){
  const kpis=el('div','rhr-kpis');kpis.id='rhrReportKpis';
  const defs=[
   ['report','Reportes totales','blue'],
   ['calendar','Este mes','cyan'],
   ['patients','Pacientes incluidos','violet'],
   ['layers','Tipos de reportes','purple']
  ];
  for(const [shape,label,color] of defs){
   const card=el('article','rhr-kpi '+color);
   card.append(icon(shape,'rhr-kpi-symbol'));
   const number=el('strong','rhr-kpi-number','0');
   number.dataset.metric=shape==='report'?'total':shape==='calendar'?'month':shape==='patients'?'patients':'kinds';
   card.append(number,el('small','',label));
   kpis.append(card);
  }
  root.append(kpis);
 }
 function buildReports(){
  const view=$('view-reports');
  if(!view||reportsReady)return;
  const preview=$('reportCard');
  if(!preview)return;
  const header=view.querySelector(':scope > .page-heading');
  const outer=el('div','rhr-reports');
  outer.append(title('Reportes','stats'));
  makeReportKpis(outer);
  const banner=el('section','rhr-banner');
  const art=el('div','rhr-report-art');
  art.setAttribute('aria-hidden','true');
  art.append(icon('report','rhr-paper-paper'),icon('stats','rhr-paper-chart'));
  const content=el('div','rhr-banner-content');
  content.append(el('h2','','Generar reporte'),el('p','','Crea, personaliza y exporta tu reporte de jornada.'));
  const exports=el('div','rhr-export-actions');
  const png=button('PNG','rhr-export rhr-png',()=>{const source=header?.querySelector('button[onclick="downloadPNG()"]');if(source&&!source.hidden)source.click();},'image');
  const pdf=button('PDF','rhr-export rhr-pdf',()=>{const source=header?.querySelector('button[onclick="generateReportPDF()"]');if(source&&!source.hidden){const preview=$('rhrReportPreview');if(preview)preview.open=true;source.click();}},'file');
  exports.append(png,pdf);content.append(exports);
  const openPreview=button('','rhr-banner-more',()=>{
   const details=$('rhrReportPreview');
   if(details){details.open=true;details.scrollIntoView({behavior:'smooth',block:'start'});}
  },'chevron');
  openPreview.setAttribute('aria-label','Mostrar vista previa del reporte de Jornada');
  banner.append(art,content,openPreview);
  outer.append(banner);
  const tiles=el('section','rhr-report-tiles');tiles.setAttribute('aria-label','Accesos a reportes');
  const tileDefinitions=[
   ['stats','Reporte clínico','Resultados y análisis','cyan',()=>{
    openView('clinical-studies');
    document.querySelector('#view-clinical-studies .crx-study-tab[data-tab="revision"]')?.click();
   }],
   ['patients','Por paciente','Historia y tomas','violet',()=>openView('patients')],
   ['calendar','Por período','Consulta de actividad','cyan',()=>openView(has('audit','view')?'audit':'reports')]
  ];
  for(const [shape,label,description,color,fn] of tileDefinitions){
   if(label==='Por período'&&!has('audit','view'))continue;
   const tile=button('','rhr-report-tile '+color,fn,shape);
   tile.append(el('strong','',label),el('small','',description),icon('chevron','rhr-tile-arrow'));
   tile.setAttribute('aria-label',label+': '+description);
   tiles.append(tile);
  }
  outer.append(tiles);
  const recents=el('section','rhr-reports-recent');
  const rhead=el('div','rhr-section-heading');rhead.append(icon('clock'),el('h2','','Historial de reportes'));
  const more=button('Ver todos','rhr-link',()=>openView('audit'),'chevron');
  more.id='rhrReportShowAll';
  rhead.append(more);recents.append(rhead);
  const list=el('div','rhr-archive-list');list.id='rhrArchiveCards';
  recents.append(list);outer.append(recents);
  const original=el('details','rhr-native-preview');
  original.id='rhrReportPreview';
  const summary=el('summary','','Vista previa y opciones del reporte de Jornada');
  original.append(summary,preview);
  view.insertBefore(outer,header||view.firstChild);
  view.appendChild(original);
  view.classList.add('rhr-ready');
  reportsReady=true;
  updateReports();
 }
 function updateReports(){
  if(!reportsReady)return;
  const records=archived();
  const now=new Date();
  const month=records.filter(r=>{
   const d=new Date(r.savedAt||'');return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
  }).length;
  const included=records.reduce((sum,r)=>sum+(Number(r.snapshot?.totalPatients)||0),0);
  // Los archivos presentes en este sistema corresponden a la jornada.
  const totals={total:records.length,month,patients:included,kinds:records.length?1:0};
  for(const key of Object.keys(totals)){
   const n=document.querySelector('#rhrReportKpis [data-metric="'+key+'"]');
   if(n)n.textContent=totals[key].toLocaleString('es-PA');
  }
  const more=$('rhrReportShowAll');
  if(more)more.hidden=!has('audit','view');
  for(const b of document.querySelectorAll('.rhr-export')){
   b.hidden=!allowReportExport();
  }
  const list=$('rhrArchiveCards');
  if(!list)return;
  const frag=document.createDocumentFragment();
  if(!records.length)frag.append(el('p','rhr-empty','Todavía no hay reportes archivados. Los informes guardados al exportar una jornada aparecerán aquí.'));
  records.slice(0,3).forEach((r,index)=>{
   const card=el('article','rhr-archive-card '+(index%2?'violet':'cyan'));
   const logo=el('span','rhr-archive-icon');logo.append(icon(index%2?'patients':index===2?'calendar':'stats'));
   const info=el('div','rhr-archive-info');
   const s=r.snapshot||{};
   info.append(el('strong','','Reporte de jornada'),el('small','',prettyDate(r.savedAt)+' · '+prettyTime(r.savedAt)),
    el('small','',String(Number(s.totalPatients)||0)+' pacientes · '+String(Number(s.totalTests)||0)+' pruebas'));
   card.append(logo,info);
   if(has('audit','view')){
    const actions=el('div','rhr-archive-actions');
    if(allowReportExport()){
     actions.append(button('PNG','rhr-small-export',()=>openArchive(r.id,'png'),'image'),
      button('PDF','rhr-small-export',()=>openArchive(r.id,'pdf'),'file'));
    }
    actions.append(button('Ver reporte','rhr-archive-open',()=>openArchive(r.id),'chevron'));
    card.append(actions);
   }
   frag.append(card);
  });
  list.replaceChildren(frag);
 }
 // Auditoría: tarjeta premium de lectura; la tabla segura sigue en el DOM.
 let auditReady=false,auditAll=false,queryTimer=null;
 function buildAudit(){
  const view=$('view-audit');
  if(!view||auditReady)return;
  if(!has('audit','view'))return;
  const rootPanel=$('auditGeneralRows')?.closest('section.panel');
  const header=view.querySelector(':scope > .page-heading');
  const table=rootPanel?.querySelector('.audit-table-wrap');
  const filters=rootPanel?.querySelector('.audit-filters');
  const queryField=$('auditQuery')?.closest('.field');
  if(!rootPanel||!header||!table||!filters||!queryField)return;
  const shell=el('div','rhr-audit-shell');
  shell.append(title('Historial','folder'));
  const search=el('div','rhr-history-search');
  search.append(icon('search'));
  search.append(queryField);
  const searchInput=$('auditQuery');
  if(searchInput){
   searchInput.type='search';
   searchInput.placeholder='Buscar en el historial...';
   searchInput.setAttribute('aria-label','Buscar en todo el historial');
   searchInput.addEventListener('input',()=>{
    clearTimeout(queryTimer);
    queryTimer=setTimeout(()=>window.FleboAuditHistory?.apply?.(),460);
   });
  }
  shell.append(search);
  const chips=el('div','rhr-history-chips');
  chips.setAttribute('role','group');chips.setAttribute('aria-label','Filtrar historial por tipo');
  for(const [value,label,shape] of [['','Todos','layers'],['patients','Pacientes','patients'],
   ['clinical','Muestras','tube'],['journey','Reportes','report']]){
   const b=button(label,'rhr-history-chip',()=>{
    const select=$('auditModule');
    if(!select)return;
    select.value=value;
    setChip(value);
    window.FleboAuditHistory?.apply?.();
   },shape);
   b.dataset.module=value;chips.append(b);
  }
  function setChip(value){
   chips.querySelectorAll('.rhr-history-chip').forEach(b=>{
    const selected=b.dataset.module===value;
    b.classList.toggle('selected',selected);
    b.setAttribute('aria-pressed',String(selected));
   });
  }
  const currentModule=$('auditModule');
  currentModule?.addEventListener('change',()=>setChip(currentModule.value));
  setChip(currentModule?.value||'');
  shell.append(chips);
  const section=el('section','rhr-audit-recent');
  const head=el('div','rhr-section-heading');
  head.append(icon('clock'),el('h2','','Registros recientes'));
  const more=button('Ver todos','rhr-link',()=>{
   auditAll=!auditAll;
   more.querySelector('span:not(.rhr-icon)').textContent=auditAll?'Ver recientes':'Ver todos';
   rootPanel.classList.toggle('rhr-all-records',auditAll);
   renderAuditCards();
   if(auditAll)advanced.open=true;
  },'chevron');
  head.append(more);section.append(head);
  const cards=el('div','rhr-history-cards');cards.id='rhrAuditCards';section.append(cards);
  const pagination=rootPanel.querySelector('.audit-pagination');
  if(pagination)section.append(pagination);
  shell.append(section);
  const advanced=el('details','rhr-history-advanced');
  const summary=el('summary','','Filtros avanzados y exportación');
  advanced.append(summary);
  advanced.append(header);
  const stats=view.querySelector(':scope > .audit-stats');
  if(stats)advanced.append(stats);
  advanced.append(filters);
  if(rootPanel.querySelector('.form-actions'))advanced.append(rootPanel.querySelector('.form-actions'));
  const error=$('auditGeneralError'),empty=$('auditGeneralEmpty');
  if(error)advanced.append(error);
  if(empty)advanced.append(empty);
  shell.append(advanced);
  rootPanel.insertBefore(shell,rootPanel.firstChild);
  const archive=$('auditArchivedReports');
  const preview=$('reportHistoryPreview');
  if(archive&&!archive.closest('.rhr-archive-disclosure')){
   const disclosure=el('details','rhr-archive-disclosure');
   disclosure.append(el('summary','','Reportes de jornada archivados'),archive);
   view.insertBefore(disclosure,preview||null);
  }
  view.classList.add('rhr-ready');
  auditReady=true;
  const observer=new MutationObserver(renderAuditCards);
  observer.observe($('auditGeneralRows'),{childList:true});
  renderAuditCards();
 }
 function renderAuditCards(){
  if(!auditReady)return;
  const node=$('rhrAuditCards'),source=$('auditGeneralRows');
  if(!node||!source)return;
  const rows=Array.from(source.querySelectorAll('tr')).filter(row=>row.querySelectorAll('td').length===6);
  const frag=document.createDocumentFragment();
  if(!rows.length){
   const nativeError=$('auditGeneralError')?.textContent?.trim();
   frag.append(el('p','rhr-empty',nativeError||'No hay registros para los filtros seleccionados.'));
  }
  for(const [index,row] of rows.entries()){
   if(!auditAll&&index>=4)break;
   const columns=Array.from(row.querySelectorAll('td'));
   const text=columns.map(c=>(c.textContent||'').trim());
   const kind=(text[2]||'').toLocaleLowerCase('es');
   const action=(text[3]||'').toLocaleLowerCase('es');
   const isSample=/estudios|muestra|clínic/.test(kind);
   const isPatient=/pacient/.test(kind);
   const isReport=/jornada|report/.test(kind);
   const shape=isSample?'tube':isPatient?'patients':isReport?'stats':'clipboard';
   const theme=index%2?'violet':'cyan';
   const card=el('button','rhr-history-card '+theme);
   card.type='button';
   card.setAttribute('aria-label','Ver detalle de '+(text[3]||'actividad')+' del '+(text[0]||'registro'));
   const symbol=el('span','rhr-history-symbol');symbol.append(icon(shape));
   const info=el('span','rhr-history-info');
   const label=text[3]||'Actividad registrada';
   info.append(el('strong','',label),
    el('span','',text[2]||'Actividad del sistema'),
    el('small','',(text[0]||'—')+' · '+(text[1]||'Usuario registrado')));
   const status=el('span','rhr-history-status '+(/elimin/.test(action)?'danger':/actual|modific|cambio/.test(action)?'updated':'done'),
    /elimin/.test(action)?'Eliminado':/actual|modific|cambio/.test(action)?'Actualizado':'Registrado');
   const arrow=icon('chevron','rhr-history-arrow');
   card.append(symbol,info,status,arrow);
   card.addEventListener('click',()=>row.click());
   frag.append(card);
  }
  node.replaceChildren(frag);
 }
 function boot(){
  buildReports();
  buildAudit();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
 else boot();
 window.addEventListener('flebo:auth-changed',()=>{
  boot();updateReports();
 });
 window.addEventListener('flebo:local-state-saved',updateReports);
 window.addEventListener('flebo:cloud-state-applied',updateReports);
 // Garantiza que la hoja original esté expandida durante una impresión PDF.
 // La tabla oficial de auditoría se mantiene disponible en modo impresión.
 let beforePrintOpen=null;
 window.addEventListener('beforeprint',()=>{
  const preview=$('rhrReportPreview');
  if(preview){beforePrintOpen=preview.open;preview.open=true;}
  const advanced=document.querySelector('#view-audit.rhr-ready .rhr-history-advanced');
  if(advanced)advanced.open=true;
 });
 window.addEventListener('afterprint',()=>{
  const preview=$('rhrReportPreview');
  if(preview&&beforePrintOpen!==null)preview.open=beforePrintOpen;
  beforePrintOpen=null;
 });
 // El archivo se actualiza al guardar un reporte, conservando el render nativo.
 const nativeRender=window.renderReportHistory;
 if(typeof nativeRender==='function'){
  window.renderReportHistory=function(...args){
   const result=nativeRender.apply(this,args);
   updateReports();return result;
  };
 }
 window.FleboReportHistoryReference={renderReports:updateReports,renderAudit:renderAuditCards};
})();
