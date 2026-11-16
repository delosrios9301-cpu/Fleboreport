/* FleboReport · Acciones en ventanas flotantes.
   Mueve formularios ORIGINALES, sin clonarlos: no altera datos, permisos ni guardado.
   Ya existentes: modales de Jornada, Pacientes, Revisión y Procesamiento. */
(function(){
 'use strict';
 if(typeof window==='undefined'||typeof document==='undefined')return;
 const $=id=>document.getElementById(id);
 const active={current:null},pending=new Set();
 let installed=false;
 function eligible(node){
  return !!node&&node.isConnected&&typeof node.matches==='function';
 }
 function restore(item){
  if(!item)return;
  const {node,anchor,dialog,wasHidden,restoreFocus,closeCb}=item;
  if(item.observer)item.observer.disconnect();
  if(anchor.parentNode)anchor.parentNode.replaceChild(node,anchor);
  else if(item.originalParent?.isConnected)item.originalParent.appendChild(node);
  // Si el flujo cerró/ocultó el formulario (p. ej. al guardar domicilio), conservar ese estado.
  node.hidden=wasHidden||node.hidden;
  node.classList.remove('fra-teleported-form');
  try{if(dialog.open)dialog.close()}catch(_){}
  dialog.remove();
  active.current=null;
  document.body.classList.remove('fra-modal-open');
  if(typeof closeCb==='function'){try{closeCb()}catch(err){console.warn('[FleboReport] Al cerrar ficha:',err)}}
  if(restoreFocus&&restoreFocus.isConnected&&typeof restoreFocus.focus==='function'){
   try{restoreFocus.focus({preventScroll:true})}catch(_){}
  }
 }
 function close(){
  const current=active.current;
  if(!current)return;
  restore(current);
 }
 function open(selector,title,options={}){
  const node=typeof selector==='string'?document.querySelector(selector):selector;
  if(!eligible(node))return false;
  if(active.current?.node===node){
   active.current.dialog.querySelector('.fra-modal-scroll')?.scrollTo(0,0);
   active.current.dialog.querySelector('.fra-modal-close')?.focus({preventScroll:true});
   return true;
  }
  close();
  const anchor=document.createComment('FleboReport: posición original del formulario');
  const parent=node.parentNode;
  if(!parent)return false;
  parent.insertBefore(anchor,node);
  const wasHidden=node.hidden,restoreFocus=document.activeElement;
  const dialog=document.createElement('dialog');
  dialog.className='fra-action-dialog';
  dialog.setAttribute('aria-modal','true');
  dialog.setAttribute('aria-label',title||'Ficha de trabajo');
  dialog.dataset.frActionDialog='true';
  const header=document.createElement('header');header.className='fra-modal-header';
  const heading=document.createElement('h2');heading.className='fra-modal-title';
  heading.textContent=title||'Ficha de trabajo';
  const exit=document.createElement('button');exit.type='button';exit.className='fra-modal-close';
  exit.setAttribute('aria-label','Cerrar ventana y volver al módulo');
  exit.textContent='×';
  header.append(heading,exit);
  const scroller=document.createElement('div');scroller.className='fra-modal-scroll';
  node.hidden=false;
  node.classList.add('fra-teleported-form');
  scroller.append(node);
  dialog.append(header,scroller);
  // Mantener el modal dentro de la vista original conserva las clases y
  // selectores de módulo, pero showModal lo eleva al top layer del navegador.
  const owner=options.owner?$(options.owner):node.closest?.('.view');
  const destination=owner&&owner.isConnected?owner:document.body;
  destination.append(dialog);
  const item={node,dialog,anchor,originalParent:parent,wasHidden,restoreFocus,
   closeCb:options.onClose,observer:null};
  active.current=item;
  const done=()=>{if(active.current===item)restore(item)};
  exit.addEventListener('click',done);
  dialog.addEventListener('cancel',event=>{event.preventDefault();done()});
  dialog.addEventListener('click',event=>{if(event.target===dialog)done()});
  try{if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','')}
  catch(error){console.warn('[FleboReport] No se pudo mostrar ventana:',error);dialog.setAttribute('open','')}
  document.body.classList.add('fra-modal-open');
  const viewport=window.visualViewport;
  const syncKeyboard=()=>{
   if(active.current!==item)return;
   const available=viewport?.height||window.innerHeight;
   dialog.style.setProperty('--fra-viewport-height',Math.max(220,available-20)+'px');
  };
  if(viewport){
   viewport.addEventListener('resize',syncKeyboard);
   viewport.addEventListener('scroll',syncKeyboard);
   const previous=item.closeCb;
   item.closeCb=()=>{
    viewport.removeEventListener('resize',syncKeyboard);
    viewport.removeEventListener('scroll',syncKeyboard);
    if(previous)previous();
   };
  }
  syncKeyboard();
  if(options.closeWhenHidden&&typeof MutationObserver!=='undefined'){
   const watcher=new MutationObserver(()=>{if(active.current===item&&node.hidden)done()});
   watcher.observe(node,{attributes:true,attributeFilter:['hidden']});
   item.observer=watcher;
  }
  scroller.scrollTop=0;
  exit.focus({preventScroll:true});
  return true;
 }
 function wrap(name,after){
  const original=window[name];
  if(typeof original!=='function'||original.__fraWrapped)return false;
  const wrapper=function(...args){
   const result=original.apply(this,args);
   if(result&&typeof result.then==='function'){
    return result.then(value=>{after(args,value);return value});
   }
   after(args,result);
   return result;
  };
  wrapper.__fraWrapped=true;
  window[name]=wrapper;
  return true;
 }
 function formIsSaved(id,field){
  const input=$(id),main=$(field);
  return !!input&&input.value===''&&!!main&&main.value==='';
 }
 function modalForCatalog(){
  return $('#catalogFormTitle')?.closest('.panel.form-panel');
 }
 function clinicalStudyForm(){
  return $('#clinicalStudyFormTitle')?.closest('.panel.form-panel');
 }
 function makeEntry(section,panel,title,openAction){
  if(!section||!panel)return;
  const id=panel.dataset.fraEntry||'fra-'+(section.id||'config')+'-entry';
  panel.dataset.fraEntry=id;
  if(!$(id)){
   const button=document.createElement('button');
   button.type='button';button.id=id;button.className='btn fra-create-entry';
   button.textContent=title;
   button.addEventListener('click',openAction);
   panel.insertAdjacentElement('beforebegin',button);
  }
  // Colocar el formulario en una ventana solo al solicitar nueva edición.
  if(active.current?.node!==panel)panel.hidden=true;
 }
 function genericConfigPanel(){
  const host=$('clinicalGenericEditor');
  if(!host)return null;
  let panel=$('fraClinicalGenericForm');
  if(!panel){
   panel=document.createElement('section');
   panel.id='fraClinicalGenericForm';
   panel.className='panel form-panel fra-clinical-generic-form';
   const heading=$('clinicalConfigHeading'),desc=$('clinicalConfigDescription'),fields=$('clinicalConfigFields'),
    actions=host.querySelector('.form-actions'),edit=$('clinicalConfigEditId');
   for(const node of [heading,desc,fields,actions,edit])if(node)panel.append(node);
   host.insertBefore(panel,host.firstChild);
  }
  return panel;
 }
 function installCatalog(){
  const panel=modalForCatalog(),section=$('settings-catalog');
  if(!panel||!section)return false;
  panel.hidden=true;
  const list=$('settingsCatalogList');
  if(list)list.classList.add('fra-catalog-scroll-list');
  wrap('startNewCatalogTest',()=>{
   open(panel,'Nueva prueba',{owner:'view-settings'});
  });
  wrap('editTest',()=>open(panel,'Editar prueba',{owner:'view-settings'}));
  wrap('saveTest',()=>{
   if(active.current?.node===panel&&formIsSaved('catalogEditId','testName'))close();
  });
  return true;
 }
 function installStudies(){
  const section=$('settings-clinical-config'),study=clinicalStudyForm();
  if(!section||!study)return false;
  makeEntry(section,study,'+ Nuevo protocolo de estudio',()=>{
   if(typeof window.resetClinicalStudyForm==='function')window.resetClinicalStudyForm();
   open(study,'Configurar estudio clínico',{owner:'view-settings'});
  });
  wrap('editClinicalStudy',()=>open(study,'Editar estudio clínico',{owner:'view-settings'}));
  wrap('saveClinicalStudy',()=>{
   if(active.current?.node===study&&formIsSaved('clinicalStudyEditId','clinicalStudyName'))close();
  });
  const host=$('clinicalGenericEditor'),generic=genericConfigPanel();
  if(host&&generic){
   makeEntry(host,generic,'+ Nuevo elemento del protocolo',()=>{
    if(typeof window.resetClinicalCatalogForm==='function')window.resetClinicalCatalogForm();
    open(generic,'Configuración de estudio',{owner:'view-settings'});
   });
   wrap('editClinicalCatalogItem',()=>open(generic,'Editar configuración clínica',{owner:'view-settings'}));
   wrap('saveClinicalCatalogItem',()=>{
    const field=generic.querySelector('#ccf-name')||generic.querySelector('input[id^="ccf-"]');
    if(active.current?.node===generic&&$('clinicalConfigEditId')?.value===''&&
       (!field||!String(field.value||'').trim()))close();
   });
   wrap('selectClinicalConfig',()=>{
    if(active.current?.node===generic)close();
    const button=generic.previousElementSibling;
    if(button?.classList.contains('fra-create-entry'))button.hidden=host.hidden;
    generic.hidden=true;
   });
  }
  return true;
 }
 function installHomeVisits(){
  wrap('hvSetTab',args=>{
   const tab=args[0],panel=$('hvCreatePanel');
   if(tab==='create'&&panel&&!panel.hidden){
    open(panel,'Nuevo domicilio',{owner:'view-domicilios',
     closeWhenHidden:true,onClose:()=>{
      const agenda=$('hvWorkspace')?.querySelector('[data-hv-tab="agenda"]');
      // Usar el botón original para volver al seguimiento sin mutar las visitas.
      if(agenda&&agenda.getAttribute('aria-selected')!=='true')agenda.click();
     }});
   }else if(tab!=='create'&&active.current?.node===panel)close();
  });
  return true;
 }
 function installPatientActions(){
  // Pacientes ya dispone de sus propios modales para expediente y datos personales.
  // La atención dentro del expediente era la excepción: mostraba su formulario al final.
  wrap('openAttentionForm',()=>{
   const node=$('attentionForm');
   if(node&&!node.hidden)open(node,'Nueva atención al paciente',{owner:'view-patients',closeWhenHidden:true});
  });
  wrap('editAttention',()=>{
   const node=$('attentionForm');
   if(node&&!node.hidden)open(node,'Editar atención al paciente',{owner:'view-patients',closeWhenHidden:true});
  });
  wrap('closeAttentionForm',()=>{if(active.current?.node===$('attentionForm'))close()});
  return true;
 }
 function installStaticConfiguration(){
  // Formularios administrativos que antes quedaban al final de la sección.
  // El panel original se reutiliza sin cambiar sus guardados ni validaciones.
  for(const id of ['settings-templates','settings-services','settings-report']){
   const section=$(id);
   if(!section)continue;
   const panels=Array.from(section.querySelectorAll('.panel.form-panel'));
   for(const panel of panels){
    if(panel.dataset.fraEntry||!panel.querySelector('input,select,textarea'))continue;
    const heading=panel.querySelector('h2,h3')?.textContent?.trim()||'Configuración';
    makeEntry(section,panel,'Modificar '+heading,()=>open(panel,heading,{owner:'view-settings'}));
   }
  }
 }
 function enhanceSecurityForms(){
  // Se crean dinámicamente tras obtener datos y permisos de Supabase.
  const targets=[
   ['frCreateSite','+ Registrar sede','Registrar sede'],
   ['frAssignSiteBtn','Asignar sede a usuario','Asignación de sede'],
   ['frSaveSecurity','Editar seguridad','Seguridad del laboratorio']
  ];
  for(const [id,title,modalTitle] of targets){
   const control=$(id);
   const card=control?.closest('.fr-config-card');
   if(!card||card.dataset.fraEntry)continue;
   makeEntry(card.parentNode,card,title,()=>open(card,modalTitle,{owner:'view-settings'}));
  }
  const pane=$('fr-pane-permissions'),layout=pane?.querySelector(':scope > .fr-config-grid');
  if(layout&&!pane.querySelector('.fra-permissions-content')){
   const group=document.createElement('section');
   group.className='fra-permissions-content';
   pane.insertBefore(group,layout);
   group.append(layout);
   const table=pane.querySelector(':scope > .fr-config-card');
   if(table)group.append(table);
   makeEntry(pane,group,'Administrar permisos y cargos',()=>{
    open(group,'Permisos y autorizaciones',{owner:'view-settings'});
   });
  }
 }
 function hookNewEntries(){
  // Un botón explícito para editar la identidad del laboratorio.
  const company=$('settings-company'),form=company?.querySelector('.panel.form-panel');
  if(company&&form&&!form.dataset.fraPrepared){
   form.dataset.fraPrepared='true';
   makeEntry(company,form,'Editar datos del laboratorio',()=>{
    open(form,'Identidad del laboratorio',{owner:'view-settings'});
   });
  }
 }
 function install(){
  if(installed)return;
  if(!$('view-settings'))return;
  installed=true;
  installCatalog();installStudies();installHomeVisits();installPatientActions();hookNewEntries();installStaticConfiguration();enhanceSecurityForms();
  wrap('showSettings',args=>{
   if(active.current&&active.current.node.closest?.('#view-settings')&&args[0]!=='catalog'&&args[0]!=='clinical-config')close();
  });
  let checking=false;
  const observer=typeof MutationObserver==='function'?new MutationObserver(()=>{
   if(checking)return;
   checking=true;
   try{
    // Si el módulo reconstruyó un editor después de guardar, conservar la vista nueva.
    if(active.current?.anchor&&!active.current.anchor.isConnected)close();
    const source=active.current?.anchor?.parentNode;
    if(source?.closest?.('.settings-section[hidden],.fr-config-pane[hidden]'))close();
    if(active.current?.node?.id==='hvCreatePanel'&&active.current.node.hidden)close();
    enhanceSecurityForms();
   }finally{checking=false;}
  }):null;
  if(observer)observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});
  window.addEventListener('beforeunload',close);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
 else install();
 window.FleboFloatingActions={open,close,get activeTitle(){return active.current?.dialog?.getAttribute('aria-label')||'';}};
})();
