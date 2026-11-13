/* FleboReport · Catálogo de pruebas — referencia visual premium.
   Capa de presentación: conserva renderCatalog, editTest, permisos y Supabase. */
(function(){
 'use strict';
 let filter='all',mounted=false,renderQueued=false,observer=null;
 const view=()=>document.getElementById('view-catalog');
 const icon=(type)=>{
  const glyph={
   stack:'<path d="m12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5M3 18l9 4 9-4"/>',
   filter:'<path d="M3 6h18M6 12h12M9 18h6"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="12" cy="18" r="2"/>',
   arrow:'<path d="m9 5 7 7-7 7"/>',
   star:'<path d="m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6L12 2Z"/>'
  };
  return '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'+glyph[type]+'</svg>';
 };
 function make(tag,klass,text){
  const n=document.createElement(tag); if(klass)n.className=klass;
  if(text!==undefined)n.textContent=text;return n;
 }
 function setFilter(next){
  filter=['all','active','pending','vessel'].includes(next)?next:'all';
  for(const b of document.querySelectorAll('#view-catalog [data-cpr-filter]')){
   const active=b.dataset.cprFilter===filter;
   b.classList.toggle('selected',active);
   b.setAttribute('aria-pressed',active?'true':'false');
  }
  updateList();
 }
 function recordFor(row,records){
  // La tarjeta actual tiene ID en onclick="editTest('id')"; no se cambia ese handler.
  const b=row.querySelector('.list-actions button[onclick]');
  const raw=b?.getAttribute('onclick')||'';
  const match=raw.match(/editTest\('((?:\\'|[^'])*)'\)/);
  if(!match)return null;
  const id=match[1].replace(/\\'/g,"'");
  return records.find(x=>String(x.id)===id)||null;
 }
 function enhanceRow(row,record){
  if(!row.classList.contains('cpr-row'))row.classList.add('cpr-row');
  const copy=row.querySelector('.fr2-catalog-item-copy');
  const tagBox=row.querySelector('.fr2-catalog-item-tags');
  const action=row.querySelector('.list-actions button');
  const sample=String(record?.sample||copy?.querySelector('small')?.textContent||'').toLocaleLowerCase('es');
  row.classList.toggle('cpr-blood',/sangre|suero|plasma|edta/.test(sample));
  row.classList.toggle('cpr-urine',/orina/.test(sample));
  const active=record?record.active!==false:true;
  const vesselDefined=record?!!String(record.vessel||'').trim():!/recipiente pendiente/i.test(copy?.querySelector('small')?.textContent||'');
  const pending=record?!record.validated:!!tagBox?.querySelector('.badge.pending');
  row.dataset.cprActive=active?'true':'false';
  row.dataset.cprPending=pending?'true':'false';
  row.dataset.cprVessel=vesselDefined?'true':'false';
  if(tagBox){
   if(!tagBox.querySelector('.cpr-active-tag')){
    const chip=make('span','cpr-status cpr-active-tag','✓ Activa');
    tagBox.append(chip);
   }
   if(vesselDefined&&!tagBox.querySelector('.cpr-vessel-tag')){
    // Mostrar una condición real, nunca atribuir categorías clínicas ficticias.
    tagBox.append(make('span','cpr-status cpr-vessel-tag','Con recipiente'));
   }
   if(!vesselDefined)tagBox.querySelector('.cpr-vessel-tag')?.remove();
  }
  if(action){
   action.classList.add('cpr-edit-action');
   if(!action.querySelector('.cpr-action-chevron')){
    action.textContent='Ver / Editar';
    const span=make('span','cpr-action-chevron');span.innerHTML=icon('arrow');
    action.append(span);
   }
   action.setAttribute('aria-label','Ver o editar '+(record?.name||copy?.querySelector('strong')?.textContent||'prueba'));
  }
 }
 function updateList(){
  const v=view(),list=v?.querySelector('#catalogList');if(!list)return;
  const catalog=window.FleboAppState?.get?.()?.catalog||[];
  const records=Array.isArray(catalog)?catalog:[];
  const rows=Array.from(list.children).filter(x=>x.classList.contains('fr2-catalog-item'));
  let shown=0;
  for(const row of rows){
   enhanceRow(row,recordFor(row,records));
   const display=(filter==='all')||
    (filter==='active'&&row.dataset.cprActive==='true')||
    (filter==='pending'&&row.dataset.cprPending==='true')||
    (filter==='vessel'&&row.dataset.cprVessel==='true');
   row.hidden=!display;if(display)shown++;
  }
  const empty=v.querySelector('#cprFilterEmpty');
  if(empty)empty.remove();
  if(rows.length&&!shown){
   const message=make('p','cpr-filter-empty','No hay pruebas que coincidan con este filtro.');
   message.id='cprFilterEmpty';list.append(message);
  }
  const count=v.querySelector('.cpr-count-label');
  const native=v.querySelector('#catalogCount');
  if(count)count.textContent=(native?.textContent||rows.length)+' pruebas en el catálogo';
 }
 function queued(){
  if(renderQueued)return;renderQueued=true;
  requestAnimationFrame(()=>{renderQueued=false;updateList();});
 }
 function mount(){
  const v=view();if(!v||mounted)return;
  const hero=v.querySelector('.fr2-catalog-hero');
  const intro=hero?.querySelector('.fr2-catalog-intro');
  const toolbar=v.querySelector('.fr2-catalog-toolbar');
  const search=toolbar?.querySelector('.fr2-catalog-search');
  const panel=v.querySelector('.fr2-catalog-list-panel');
  const head=panel?.querySelector(':scope > .panel-head');
  const list=v.querySelector('#catalogList');
  if(!hero||!intro||!toolbar||!search||!head||!list)return;
  mounted=true;v.classList.add('cpr-premium');
  const glyph=make('span','cpr-hero-glyph');glyph.innerHTML=icon('star');hero.insertBefore(glyph,intro);
  const eyebrow=intro.querySelector('.eyebrow');
  if(eyebrow)eyebrow.textContent='FLEBOREPORT / ESPACIO CLÍNICO';
  const description=intro.querySelector('p');
  if(description)description.textContent='Administra y consulta el catálogo de estudios, muestras y requisitos de preparación.';
  const row=make('div','cpr-search-row');
  search.parentNode.insertBefore(row,search);row.append(search);
  const filterToggle=make('button','cpr-filter-toggle');
  filterToggle.type='button';filterToggle.setAttribute('aria-expanded','true');
  filterToggle.setAttribute('aria-controls','cprFilterChips');
  filterToggle.innerHTML=icon('filter')+'<span>Filtros</span><i aria-hidden="true"></i>';
  row.append(filterToggle);
  const chips=make('div','cpr-filter-chips');chips.id='cprFilterChips';
  chips.setAttribute('role','group');chips.setAttribute('aria-label','Filtrar pruebas del catálogo');
  for(const [value,label] of [['all','Todas'],['active','Activas'],['pending','Pendientes'],['vessel','Con recipiente']]){
   const b=make('button','cpr-filter-chip',label);
   b.type='button';b.dataset.cprFilter=value;
   b.setAttribute('aria-pressed',String(value==='all'));
   b.classList.toggle('selected',value==='all');
   b.addEventListener('click',()=>setFilter(value));
   chips.append(b);
  }
  row.after(chips);
  filterToggle.addEventListener('click',()=>{
   const hidden=!chips.hidden;chips.hidden=hidden;
   filterToggle.setAttribute('aria-expanded',String(!hidden));
  });
  const title=head.querySelector('h2');
  if(title){
   const titleRow=make('div','cpr-library-title');
   const symbol=make('span','cpr-library-glyph');symbol.innerHTML=icon('stack');
   title.parentNode.insertBefore(titleRow,title);
   titleRow.append(symbol,title);
   const p=head.querySelector('p');
   if(p){
    p.classList.add('cpr-count-label');p.textContent='0 pruebas en el catálogo';
    titleRow.append(p);
   }
  }
  const nativeCount=v.querySelector('#catalogCount');
  if(nativeCount)nativeCount.setAttribute('aria-label','Cantidad total de pruebas activas');
  observer=new MutationObserver(queued);
  observer.observe(list,{childList:true});
  if(nativeCount)observer.observe(nativeCount,{childList:true,characterData:true});
  const searchInput=v.querySelector('#catalogSearch');
  searchInput?.addEventListener('input',queued,{passive:true});
  updateList();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
 else mount();
 window.addEventListener('flebo:auth-changed',mount);
 window.FleboCatalogReference={getFilter:()=>filter,refresh:updateList,setFilter};
})();