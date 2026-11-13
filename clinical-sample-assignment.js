/* FleboReport · Selector clínico de tipos de muestra v308.
   Provee selección múltiple táctil real y mantiene el SELECT original como
   fuente de verdad para saveClinicalStudy(), specs y la sincronización. */
(function(){
 'use strict';
 const native=document.getElementById('clinicalStudySamples');
 const editId=document.getElementById('clinicalStudyEditId');
 const specs=document.getElementById('clinicalStudySampleSpecs');
 if(!native||!editId||!specs||native.dataset.touchPickerReady==='true')return;
 native.dataset.touchPickerReady='true';
 const parent=native.parentElement;
 const app=()=>window.FleboAppState?.get?.()||{};
 const isAdmin=()=>window.FleboAuth?.membership?.role==='admin';
 const studyKey=()=>String(editId.value||'__new_study__');
 const keys=['tube','volume','processing','coag-enabled','coag-min','coag-max','coag-lead'];
 const last={key:studyKey(),dirty:false,ids:[],specs:{}};
 let drawing=false,query='';
 function selectedIds(){return Array.from(native.selectedOptions).map(option=>String(option.value));}
 function captureSpecs(){
  for(const row of specs.querySelectorAll('[data-clinical-spec]')){
   const val={};
   for(const field of keys){
    const el=row.querySelector('[data-spec-'+field+']');
    if(el)val[field]=el.value;
   }
   last.specs[String(row.dataset.clinicalSpec)]=val;
  }
 }
 function restoreSpecs(){
  for(const row of specs.querySelectorAll('[data-clinical-spec]')){
   const data=last.specs[String(row.dataset.clinicalSpec)];
   if(!data)continue;
   for(const field of keys){
    const el=row.querySelector('[data-spec-'+field+']');
    if(el&&Object.prototype.hasOwnProperty.call(data,field))el.value=data[field];
   }
  }
 }
 function clearDraft(){
  last.key=studyKey();last.dirty=false;last.ids=[];last.specs={};
 }
 function applySelection(values){
  const ids=new Set(values.map(String));
  for(const option of native.options)option.selected=ids.has(String(option.value));
 }
 function syncDraft(){
  if(!last.dirty||last.key!==studyKey())return;
  applySelection(last.ids);
  // El editor de especificaciones se regenera solo cuando corresponde.
  const visible=Array.from(specs.querySelectorAll('[data-clinical-spec]')).map(row=>String(row.dataset.clinicalSpec));
  if(visible.join('|')!==selectedIds().join('|')){
   if(typeof window.renderClinicalStudySampleSpecs==='function')window.renderClinicalStudySampleSpecs();
  }
  restoreSpecs();
 }
 function matches(term){return String(term||'').trim().toLocaleLowerCase('es');}
 function groupedCatalog(){
  const state=app();
  const items=Array.isArray(state.clinicalSampleTypes)?state.clinicalSampleTypes:[];
  const byId=new Map(items.map(item=>[String(item.id),item]));
  const groups=new Map();
  for(const option of native.options){
   const id=String(option.value),item=byId.get(id)||{};
   const label=String(item.name||option.textContent||'Tipo de muestra').trim();
   const key=matches(item.code)?'code:'+matches(item.code):'name:'+matches(label);
   if(!groups.has(key))groups.set(key,{name:label,code:item.code||'',tube:item.tube||'',ids:[],activeIds:[]});
   const group=groups.get(key);group.ids.push(id);
   if(item.active!==false)group.activeIds.push(id);
   if(!group.tube&&item.tube)group.tube=item.tube;
  }
  return Array.from(groups.values()).sort((a,b)=>
   a.name.localeCompare(b.name,'es',{sensitivity:'base'}));
 }
 function make(tag,klass,text){
  const el=document.createElement(tag);
  if(klass)el.className=klass;
  if(text!==undefined)el.textContent=String(text);
  return el;
 }
 const picker=make('section','crx-type-picker');
 picker.id='clinicalStudyTouchPicker';
 picker.setAttribute('aria-label','Asignar tipos de muestra al estudio');
 const header=make('div','crx-type-header');
 const headerLabel=make('strong','','');
 headerLabel.textContent='Asignar tipos de muestra';
 const count=make('span','crx-type-count','0 seleccionados');
 header.append(headerLabel,count);
 const controls=make('div','crx-type-controls');
 const search=make('input','crx-type-search');
 search.type='search';search.placeholder='Buscar tipo de muestra…';
 search.setAttribute('aria-label','Buscar tipos de muestra disponibles');
 search.autocomplete='off';
 const add=make('button','crx-type-add','+ Crear tipo de muestra');
 add.type='button';
 add.addEventListener('click',()=>{
  if(!isAdmin())return;
  if(typeof window.selectClinicalConfig!=='function')return;
  // Conserva los datos que el usuario ya ingresó en el formulario del estudio.
  captureSpecs();
  last.ids=selectedIds();
  last.dirty=true;last.key=studyKey();
  window.selectClinicalConfig('sampleTypes');
  document.getElementById('clinicalGenericEditor')?.scrollIntoView({block:'start',behavior:'smooth'});
 });
 controls.append(search,add);
 const hint=make('p','crx-type-help',
  'Marca uno o varios tipos. La asignación se guarda con «Guardar protocolo».');
 const list=make('div','crx-type-grid');
 list.setAttribute('role','group');
 list.setAttribute('aria-label','Tipos de muestra disponibles');
 const empty=make('p','crx-type-empty');
 empty.hidden=true;
 picker.append(header,controls,hint,list,empty);
 native.insertAdjacentElement('afterend',picker);
 native.classList.add('crx-native-type-select');
 // El select sigue conectado: las funciones originales leen selectedOptions.
 native.setAttribute('aria-hidden','true');
 native.tabIndex=-1;
 function render(){
  if(drawing)return;
  drawing=true;
  try{
   if(last.key!==studyKey())clearDraft();
   if(last.dirty)syncDraft();
   const chosen=new Set(selectedIds()),catalog=groupedCatalog(),needle=matches(query);
   const filtered=catalog.filter(group=>[group.name,group.code,group.tube].some(v=>matches(v).includes(needle)));
   list.replaceChildren();
   const editable=isAdmin();
   const frag=document.createDocumentFragment();
   for(const group of filtered){
    const selected=group.ids.some(id=>chosen.has(id));
    const active=group.activeIds.length>0;
    const label=make('label','crx-type-option'+(selected?' is-selected':'')+(!active?' is-inactive':''));
    const input=make('input','crx-type-checkbox');input.type='checkbox';
    input.checked=selected;input.disabled=!editable||(!active&&!selected);
    input.setAttribute('aria-label',(selected?'Quitar':'Asignar')+' '+group.name);
    const visual=make('span','crx-type-check','✓');visual.setAttribute('aria-hidden','true');
    const desc=make('span','crx-type-description');
    desc.append(make('strong','',group.name));
    const detail=[group.code,group.tube?('Tubo: '+group.tube):''].filter(Boolean).join(' · ');
    if(detail)desc.append(make('small','',detail));
    if(!active)desc.append(make('small','crx-type-warning','Inactivo en catálogo'));
    label.append(input,visual,desc);
    input.addEventListener('change',()=>{
     captureSpecs();
     const ids=new Set(selectedIds());
     if(input.checked){
      // Elegir una sola referencia por código evita duplicados del mismo
      // tipo generados al asociarlo a distintos estudios de Supabase.
      for(const id of group.ids)ids.delete(id);
      ids.add(group.activeIds[0]||group.ids[0]);
     }else{
      for(const id of group.ids)ids.delete(id);
     }
     last.key=studyKey();last.dirty=true;
     last.ids=Array.from(native.options).map(o=>String(o.value)).filter(id=>ids.has(id));
     applySelection(last.ids);
     if(typeof window.renderClinicalStudySampleSpecs==='function')window.renderClinicalStudySampleSpecs();
     // Ya se actualizó el formulario de especificaciones. No disparamos
     // el onchange heredado porque regeneraría las casillas y borraría
     // los parámetros que el usuario acaba de escribir.
     restoreSpecs();
     render();
    });
    frag.append(label);
   }
   list.append(frag);
   empty.hidden=filtered.length>0;
   empty.textContent=catalog.length===0
    ?'No hay tipos disponibles. Usa «Crear tipo de muestra» para registrarlos antes de asignarlos.'
    :'No hay coincidencias con la búsqueda.';
   const selectedCount=catalog.filter(g=>g.ids.some(id=>chosen.has(id))).length;
   count.textContent=selectedCount+' tipo'+(selectedCount===1?'':'s')+' seleccionado'+(selectedCount===1?'':'s');
   add.hidden=!editable;
  }finally{drawing=false;}
 }
 search.addEventListener('input',()=>{query=search.value;render();});
 const baseRender=window.renderClinicalStudies;
 if(typeof baseRender==='function'){
  window.renderClinicalStudies=function(...args){
   if(last.key===studyKey()&&last.dirty)captureSpecs();
   const result=baseRender.apply(this,args);
   render();
   return result;
  };
 }
 const baseEdit=window.editClinicalStudy;
 if(typeof baseEdit==='function'){
  window.editClinicalStudy=function(...args){
   last.dirty=false;last.specs={};
   const result=baseEdit.apply(this,args);
   clearDraft();render();
   return result;
  };
 }
 const baseReset=window.resetClinicalStudyForm;
 if(typeof baseReset==='function'){
  window.resetClinicalStudyForm=function(...args){
   last.dirty=false;last.specs={};
   const result=baseReset.apply(this,args);
   clearDraft();render();
   return result;
  };
 }
 const baseTab=window.selectClinicalConfig;
 if(typeof baseTab==='function'){
  window.selectClinicalConfig=function(...args){
   const result=baseTab.apply(this,args);
   if(args[0]==='studies')render();
   return result;
  };
 }
 native.addEventListener('change',()=>{
  if(drawing)return;
  last.key=studyKey();last.dirty=true;last.ids=selectedIds();
  render();
 });
 window.addEventListener('flebo:auth-changed',render);
 // Render al cargar y cuando Supabase refresca opciones/estudios.
 new MutationObserver(()=>render()).observe(native,{childList:true});
 render();
})();
