/* FleboReport · Configuración de referencia · seis accesos visuales.
 * Solo reorganiza las secciones existentes; los controladores, permisos,
 * guardado, auditoría y validaciones del sistema permanecen intactos.
 */
(()=>{
 'use strict';
 const $=(selector,root=document)=>root.querySelector(selector);
 const root=$('#view-settings');
 if(!root)return;
 const paths={
  users:{
   title:'Usuarios',subtitle:'Gestión de cuentas y accesos',icon:'users',theme:'violet',
   admin:true,
   links:[['Cuentas y cargos','users']]
  },
  companies:{
   title:'Empresas',subtitle:'Administración de sedes y datos',icon:'building',theme:'cyan',
   admin:true,
   links:[['Datos del laboratorio','company'],['Sedes y asignaciones','sites'],['Datos híbridos','devices'],['Empresas registradas','companies-module']]
  },
  permissions:{
   title:'Permisos',subtitle:'Roles y niveles de acceso',icon:'shield',theme:'violet',
   admin:true,
   links:[['Permisos granulares','permissions'],['Doble autorización','approvals'],['Seguridad del espacio','overview']]
  },
  notifications:{
   title:'Notificaciones',subtitle:'Alertas y preferencias',icon:'bell',theme:'cyan',
   admin:false,
   links:[['Notificaciones y dispositivo','notifications-admin']]
  },
  catalog:{
   title:'Catálogo',subtitle:'Parámetros, pruebas y referencias',icon:'layers',theme:'violet',
   admin:true,
   links:[['Catálogo de pruebas','catalog'],['Estudios y protocolos','clinical-config'],['Plantillas de atención','templates'],['Servicios y cobros','services'],['Diseño del reporte','report']]
  },
  reset:{
   title:'Reiniciar datos',subtitle:'Restablecer información del sistema',icon:'refresh',theme:'cyan',
   admin:true,
   links:[['Restablecimiento protegido','reset-data'],['Respaldo y recuperación local','data']]
  }
 };
 const drawings={
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l-2 2a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5h-2.9a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-2-2a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 5.8 14H4v-3h1.8a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l2-2a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 11.9 5h2.9a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l2 2a1.7 1.7 0 0 0-.3 1.9A1.7 1.7 0 0 0 21 11v3a1.7 1.7 0 0 0-1.6 1Z"/>',
  users:'<circle cx="12" cy="7" r="3"/><path d="M5 21v-2c0-3.1 2.6-5.6 7-5.6s7 2.5 7 5.6v2M4 10a3 3 0 1 1 3-5M3 19H1v-1a5 5 0 0 1 3-4.7M20 10a3 3 0 1 0-3-5M21 19h2v-1a5 5 0 0 0-3-4.7"/>',
  building:'<rect x="4" y="3" width="16" height="18" rx="1.4"/><path d="M8 7h2m4 0h2M8 11h2m4 0h2M8 15h2m4 0h2M10 21v-3h4v3"/>',
  shield:'<path d="M12 2 3.5 5.3v5.8c0 5.1 3.2 8.4 8.5 11 5.3-2.6 8.5-5.9 8.5-11V5.3L12 2Z"/><path d="m8 12 2.8 2.8L16 9.6"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-2 8-3 10h18c-1-2-3-3-3-10M10 21h4"/>',
  layers:'<path d="m12 2 10 6-10 6L2 8l10-6ZM2 13l10 6 10-6M2 18l10 5 10-5"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 9a8 8 0 0 1 14-2l1 1M19 15a8 8 0 0 1-14 2l-1-1"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  back:'<path d="m15 5-7 7 7 7"/>'
 };
 const svg=name=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+drawings[name]+'</svg>';
 function el(tag,cls,content){
  const node=document.createElement(tag);if(cls)node.className=cls;
  if(content!==undefined)node.textContent=content;
  return node;
 }
 const admin=()=>window.FleboAuth?.membership?.role==='admin';
 let selected=null,selectedLink=null,wasActive=root.classList.contains('active');
 const landing=el('section','sr-settings-home');landing.id='srSettingsHome';
 const pageTitle=el('header','sr-settings-heading');
 const titleGroup=el('div','sr-title-group');
 const titleIcon=el('span','sr-title-icon');titleIcon.innerHTML=svg('gear');
 titleGroup.append(titleIcon,el('h1','','Configuración'));
 const dots=el('span','sr-title-dots');dots.setAttribute('aria-hidden','true');
 for(let i=0;i<3;i++)dots.appendChild(el('i',i===0?'selected':''));
 pageTitle.append(titleGroup,dots);
 const cards=el('div','sr-settings-cards');
 cards.setAttribute('aria-label','Secciones de configuración');
 const cardNodes={};
 for(const [key,info] of Object.entries(paths)){
  const b=el('button','sr-setting-card sr-'+info.theme);
  b.type='button';b.dataset.srCategory=key;
  const left=el('span','sr-card-icon');left.innerHTML=svg(info.icon);
  const divider=el('span','sr-card-divider');divider.setAttribute('aria-hidden','true');
  const caption=el('span','sr-card-caption');
  caption.append(el('strong','',info.title),el('small','',info.subtitle));
  const arrow=el('span','sr-card-chevron');arrow.innerHTML=svg('chevron');
  b.append(left,divider,caption,arrow);
  b.setAttribute('aria-label','Abrir '+info.title);
  b.addEventListener('click',()=>openCategory(key));
  cardNodes[key]=b;cards.append(b);
 }
 landing.append(pageTitle,cards);
 const detail=el('section','sr-settings-detail');detail.id='srSettingsDetail';detail.hidden=true;
 const detailHeader=el('header','sr-detail-header');
 const back=el('button','sr-detail-back');back.type='button';
 back.innerHTML=svg('back');back.setAttribute('aria-label','Volver a Configuración');
 back.addEventListener('click',showHome);
 const detailIcon=el('span','sr-detail-icon');
 const detailText=el('div','sr-detail-heading');
 const detailTitle=el('h2','','');detailTitle.id='srDetailTitle';
 const detailSubtitle=el('p','','');
 detailText.append(detailTitle,detailSubtitle);
 detailHeader.append(back,detailIcon,detailText);
 const menu=el('nav','sr-detail-menu');menu.setAttribute('aria-label','Secciones internas');
 const message=el('p','sr-settings-message');message.setAttribute('role','status');message.hidden=true;
 detail.append(detailHeader,menu,message);
 const mainTabs=root.querySelector('.settings-tabs');
 if(!mainTabs)return;
 root.insertBefore(landing,mainTabs);
 root.insertBefore(detail,mainTabs);
 root.classList.add('sr-settings-ready');
 function alertMissing(text){
  message.hidden=false;message.textContent=text||'Esta sección todavía no está disponible en tu sesión.';
 }
 function permitted(key){
  if(!admin()&&paths[key]?.admin)return false;
  if(key==='notifications')return Boolean($('#frNotifyAdminTab')||$('#settings-notifications-admin'));
  return true;
 }
 function syncCards(){
  for(const [key,b] of Object.entries(cardNodes))b.hidden=!permitted(key);
  if(selected&&!permitted(selected))showHome();
 }
 function scrollTop(){
  try{window.scrollTo({top:0,behavior:'instant'})}catch(_){window.scrollTo(0,0)}
 }
 function showHome(){
  selected=null;selectedLink=null;
  root.classList.remove('sr-settings-detail-open');
  root.classList.add('sr-settings-landing');
  landing.hidden=false;detail.hidden=true;message.hidden=true;
  syncCards();scrollTop();
 }
 function nativeTab(key){
  return mainTabs.querySelector('[data-settings="'+key+'"]');
 }
 function runOriginal(route){
  // Cada entrada de Configuración continúa usando el controlador y
  // los permisos originales; nunca se clonan formularios ni se guarda aquí.
  if(route==='companies-module'){
   const source=$('#sidebar [data-nav="companies"]');
   if(!source||source.hidden)return false;
   source.click();return true;
  }
  if(route==='users'){
   const tab=$('#fleboUsersTab');if(!admin()||!tab)return false;
   tab.click();return !$('#fleboUsersSection')?.hidden;
  }
  if(['sites','devices','permissions','approvals','overview'].includes(route)){
   if(!admin()||!$('#settings-security')||!window.FleboConfiguration?.open)return false;
   window.FleboConfiguration.open(route);
   return !$('#settings-security').hidden;
  }
  if(route==='reset-data'){
   if(!admin()||!$('#frResetTab'))return false;
   $('#frResetTab').click();return !$('#settings-reset')?.hidden;
  }
  if(route==='notifications-admin'){
   const tab=$('#frNotifyAdminTab');if(!tab)return false;
   tab.click();return !$('#settings-notifications-admin')?.hidden;
  }
  const tab=nativeTab(route);
  if(!tab)return false;
  tab.click();
  if(route==='clinical-config'&&typeof window.selectClinicalConfig==='function')
   window.selectClinicalConfig('studies');
  return !$('#settings-'+route)?.hidden;
 }
 function openCategory(key,link,opts={}){
  const info=paths[key];
  if(!info||!permitted(key))return;
  selected=key;
  landing.hidden=true;detail.hidden=false;
  root.classList.remove('sr-settings-landing');
  root.classList.add('sr-settings-detail-open');
  detailIcon.innerHTML=svg(info.icon);
  detailIcon.className='sr-detail-icon sr-'+info.theme;
  detailTitle.textContent=info.title;
  detailSubtitle.textContent=info.subtitle;
  menu.replaceChildren();
  info.links.forEach(([label,route])=>{
   const b=el('button','sr-detail-tab',label);
   b.type='button';b.dataset.srRoute=route;
   b.addEventListener('click',()=>selectLink(key,route));
   menu.appendChild(b);
  });
  selectLink(key,link||info.links[0][1],opts);
  if(!opts.keepScroll)scrollTop();
 }
 function selectLink(key,route,{fromRoute=false}={}){
  if(selected!==key)return;
  message.hidden=true;selectedLink=route;
  menu.querySelectorAll('.sr-detail-tab').forEach(b=>{
   const match=b.dataset.srRoute===route;
   b.classList.toggle('is-current',match);
   b.setAttribute('aria-pressed',String(match));
  });
  // La navegación explícita desde otro módulo ya abrió la sección original.
  if(fromRoute&&route!=='companies-module'){
   const required=route==='users'?'fleboUsersSection':
    ['sites','devices','permissions','approvals','overview'].includes(route)?'settings-security':
    route==='reset-data'?'settings-reset':'settings-'+route;
   if(!$('#'+required)?.hidden)return;
  }
  if(!runOriginal(route)){
   if(route==='companies-module')alertMissing('No tienes acceso al módulo de Empresas.');
   else alertMissing('Esta función no está disponible con los permisos o la sesión actuales.');
  }
 }
 function onNavigate(view,tab){
  if(view!=='settings'){wasActive=false;return;}
  wasActive=true;
  if(!tab){showHome();return;}
  const mapping={
   company:['companies','company'],catalog:['catalog','catalog'],
   templates:['catalog','templates'],services:['catalog','services'],
   report:['catalog','report'],'clinical-config':['catalog','clinical-config'],
   data:['reset','data'],security:['permissions','overview'],
   users:['users','users'],'notifications-admin':['notifications','notifications-admin'],
   'reset-data':['reset','reset-data']
  };
  const item=mapping[tab]||null;
  if(item)openCategory(item[0],item[1],{fromRoute:true});
  else showHome();
 }
 // En navegación explícita de Procesamiento -> Configuración de estudios,
 // se abre directamente esa sección, sin obligar a regresar a la portada.
 if(typeof window.navigate==='function'&&!window.navigate.srWrapped){
  const original=window.navigate;
  const wrapped=function(view,settingsTab){
   const result=original.apply(this,arguments);
   onNavigate(view,settingsTab);
   return result;
  };
  wrapped.srWrapped=true;
  window.navigate=wrapped;
 }
 const observer=new MutationObserver(()=>{
  const active=root.classList.contains('active');
  if(active&&!wasActive)showHome();
  wasActive=active;
 });
 observer.observe(root,{attributes:true,attributeFilter:['class']});
 const tabsObserver=new MutationObserver(syncCards);
 tabsObserver.observe(mainTabs,{childList:true});
 window.addEventListener('flebo:auth-changed',syncCards);
 // Gestos de la portada: respuesta táctil. En fichas solo el encabezado
 // ofrece gesto de regreso; nunca se interceptan formularios ni selects.
 for(const b of Object.values(cardNodes)){
  b.addEventListener('pointerdown',()=>b.classList.add('sr-touching'),{passive:true});
  for(const name of ['pointerup','pointercancel','pointerleave'])b.addEventListener(name,()=>b.classList.remove('sr-touching'),{passive:true});
 }
 let startX=null,startY=null;
 detailHeader.addEventListener('touchstart',e=>{
  if(e.touches.length!==1||e.target.closest('button'))return;
  startX=e.touches[0].clientX;startY=e.touches[0].clientY;
 },{passive:true});
 detailHeader.addEventListener('touchend',e=>{
  if(startX===null||!e.changedTouches.length)return;
  const dx=e.changedTouches[0].clientX-startX,dy=e.changedTouches[0].clientY-startY;
  if(dx>95&&Math.abs(dy)<50)showHome();
  startX=null;startY=null;
 },{passive:true});
 syncCards();
 if(root.classList.contains('active'))showHome();
 else {landing.hidden=false;detail.hidden=true;root.classList.add('sr-settings-landing')}
})();
