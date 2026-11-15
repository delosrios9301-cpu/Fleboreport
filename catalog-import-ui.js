/* FleboReport · Cargar listado de pruebas · Catálogo central.
   No crea catálogos paralelos. Vista previa obligatoria; escritura agrupada
   con validación de permisos y sincronización existente de FleboCloudSync. */
(function(){
 'use strict';
 const core=window.FleboCatalogImportCore;
 if(!core)return;
 const id=x=>document.getElementById(x);
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
 let chooser=null,modal=null,trigger=null,preview=null,currentMatrix=null,fileName='',loading=false,lastFocus=null;
 const membership=()=>window.FleboAuth?.membership;
 const authorized=()=>{
  const member=membership();
  if(!member||member.active!==true||!window.FleboAuth?.user)return false;
  return member.role==='admin'||(typeof window.fleboCan==='function'&&window.fleboCan('catalog','create'));
 };
 const notice=text=>{const status=id('catalogImportStatus');if(status)status.textContent=text||'';};
 const toast=text=>{if(typeof window.toast==='function')window.toast(text);else notice(text);};
 function refreshPermission(){
  if(!trigger)return;
  const allowed=authorized();
  trigger.hidden=!allowed;trigger.disabled=!allowed;
  trigger.setAttribute('aria-hidden',String(!allowed));
  if(!allowed&&modal&&!modal.hidden)close();
 }
 function build(){
  const settings=id('settings-catalog'),actions=id('catalogHeaderActions');
  if(!settings||!actions||trigger)return;
  trigger=el('button','btn catalog-import-trigger');
  trigger.type='button';trigger.id='catalogImportOpen';
  trigger.dataset.permissionModule='catalog';trigger.dataset.permissionAction='create';
  trigger.textContent='Importar pruebas';
  trigger.addEventListener('click',()=>{
   if(!authorized()){toast('No tienes permiso para importar pruebas al catálogo.');return;}
   open();
  });
  // Solo en Configuración → Catálogo. La biblioteca pública queda para consultar.
  actions.append(trigger);
  chooser=el('input');chooser.type='file';chooser.id='catalogImportFile';chooser.hidden=true;
  chooser.accept='.csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  chooser.setAttribute('aria-label','Seleccionar listado de pruebas CSV o Excel');
  chooser.addEventListener('change',onFile);
  settings.append(chooser);
  modal=el('div','catalog-import-overlay');modal.id='catalogImportDialog';modal.hidden=true;
  modal.innerHTML=
   '<section class="catalog-import-panel" role="dialog" aria-modal="true" aria-labelledby="catalogImportTitle" aria-describedby="catalogImportHelp">'+
   '<header class="catalog-import-heading"><div><small>CATÁLOGO CENTRAL</small><h2 id="catalogImportTitle">Importar listado de pruebas</h2><p id="catalogImportHelp">Carga Excel (.xlsx) o CSV. Se revisarán los registros antes de agregarlos.</p></div>'+
   '<button class="catalog-import-close" type="button" aria-label="Cerrar importación">×</button></header>'+
   '<div class="catalog-import-tools">'+
    '<button class="catalog-import-select" type="button">Seleccionar archivo</button>'+
    '<button class="catalog-import-template" type="button">Descargar plantilla CSV</button>'+
   '</div>'+
   '<p class="catalog-import-hint">Columnas: Nombre (obligatoria), Código, Muestra, Recipiente, Volumen, Método, Ayuno, Condiciones, Indicaciones. La primera hoja del Excel será importada. Las pruebas nuevas quedarán pendientes de validación.</p>'+
   '<p id="catalogImportStatus" class="catalog-import-status" role="status" aria-live="polite">Selecciona un archivo para visualizar las pruebas.</p>'+
   '<div class="catalog-import-summary" id="catalogImportSummary" hidden></div>'+
   '<div class="catalog-import-preview" id="catalogImportPreview" hidden><table><thead><tr><th>Fila</th><th>Prueba</th><th>Código</th><th>Resultado</th></tr></thead><tbody id="catalogImportRows"></tbody></table></div>'+
   '<footer class="catalog-import-footer"><button class="catalog-import-cancel" type="button">Cancelar</button>'+
   '<button class="catalog-import-confirm" type="button" disabled>Confirmar importación</button></footer>'+
   '</section>';
  document.body.appendChild(modal);
  modal.querySelector('.catalog-import-close').addEventListener('click',close);
  modal.querySelector('.catalog-import-cancel').addEventListener('click',close);
  modal.querySelector('.catalog-import-select').addEventListener('click',()=>{if(authorized()&&!loading)chooser.click();});
  modal.querySelector('.catalog-import-template').addEventListener('click',downloadTemplate);
  modal.querySelector('.catalog-import-confirm').addEventListener('click',commit);
  modal.addEventListener('keydown',event=>{
   if(event.key==='Escape'){event.preventDefault();if(!loading)close();return;}
   if(event.key!=='Tab')return;
   const controls=[...modal.querySelectorAll('button:not(:disabled):not([hidden])')];
   if(!controls.length)return;
   const first=controls[0],last=controls[controls.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  refreshPermission();
 }
 function open(){
  if(!modal||!authorized())return;
  lastFocus=document.activeElement;modal.hidden=false;
  document.body.classList.add('catalog-import-open');
  modal.querySelector('.catalog-import-select').focus();
 }
 function close(){
  if(loading)return;
  if(!modal)return;
  modal.hidden=true;document.body.classList.remove('catalog-import-open');
  currentMatrix=null;preview=null;fileName='';
  if(chooser)chooser.value='';
  id('catalogImportSummary').hidden=true;id('catalogImportPreview').hidden=true;
  id('catalogImportRows').replaceChildren();
  modal.querySelector('.catalog-import-confirm').disabled=true;
  notice('Selecciona un archivo para visualizar las pruebas.');
  if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});
  lastFocus=null;
 }
 function downloadTemplate(){
  const header='Nombre;Código;Muestra;Recipiente;Volumen;Método;Ayuno;Condiciones;Indicaciones\r\n';
  const blob=new Blob(['\uFEFF'+header],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=el('a');
  a.href=url;a.download='plantilla_catalogo_pruebas_fleboreport.csv';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
 }
 function counts(rows){
  return {new:rows.filter(x=>x.status==='new').length,
   duplicate:rows.filter(x=>x.status==='duplicate').length,
   invalid:rows.filter(x=>x.status==='invalid').length};
 }
 function currentCatalog(){
  const state=window.FleboAppState?.get?.();
  return state&&Array.isArray(state.catalog)?state.catalog:[];
 }
 function renderPreview(){
  const summary=id('catalogImportSummary'),previewBox=id('catalogImportPreview');
  const body=id('catalogImportRows'),confirm=modal.querySelector('.catalog-import-confirm');
  body.replaceChildren();confirm.disabled=true;
  if(!Array.isArray(preview)||!preview.length){summary.hidden=true;previewBox.hidden=true;return;}
  const c=counts(preview);summary.hidden=false;previewBox.hidden=false;
  summary.replaceChildren(
   el('span','catalog-import-new',c.new+' nuevas'),
   el('span','catalog-import-duplicate',c.duplicate+' duplicadas'),
   el('span','catalog-import-invalid',c.invalid+' incompletas')
  );
  const fragment=document.createDocumentFragment();
  for(const r of preview.slice(0,120)){
   const tr=el('tr','catalog-import-'+r.status);
   const text=r.status==='new'?'Lista para agregar':r.reason;
   for(const value of [r.line,r.item.name||'—',r.item.code||'—',text])tr.appendChild(el('td','',String(value)));
   fragment.append(tr);
  }
  body.appendChild(fragment);
  notice(fileName+' · '+preview.length+' fila(s) revisadas. '+(preview.length>120?'Vista previa de las primeras 120. ':'')+
    'Solo se agregarán las '+c.new+' pruebas nuevas. Las duplicadas no se modificarán.');
  confirm.disabled=!c.new||!authorized();
 }
 async function onFile(){
  const file=chooser.files?.[0];if(!file)return;
  currentMatrix=null;preview=null;fileName=file.name;
  id('catalogImportSummary').hidden=true;id('catalogImportPreview').hidden=true;
  modal.querySelector('.catalog-import-confirm').disabled=true;
  if(!authorized()){notice('No tienes permiso para importar.');return;}
  if(file.size>core.MAX_FILE){notice('El archivo es demasiado grande. Máximo: 3 MB.');return;}
  const ext=file.name.split('.').pop()?.toLowerCase();
  if(!['csv','tsv','txt','xlsx'].includes(ext)){notice('Formato no compatible. Usa CSV UTF-8 o Excel .xlsx.');return;}
  notice('Analizando listado…');
  loading=true;
  try{
   const matrix=ext==='xlsx'?await core.parseXlsx(await file.arrayBuffer()):core.parseDelimited(await file.text());
   const rows=core.prepare(matrix,currentCatalog());
   currentMatrix=matrix;preview=rows;
   renderPreview();
  }catch(error){
   notice((error?.message||'No se pudo leer el archivo')+' No se ha modificado el catálogo.');
  }finally{loading=false;chooser.value='';}
 }
 async function commit(){
  if(loading||!authorized()||!currentMatrix)return;
  const api=window.FleboAppState,state=api?.get?.();
  if(!state||!Array.isArray(state.catalog)){notice('El catálogo aún no está disponible.');return;}
  // Volver a comprobar el catálogo actual protege ante ediciones simultáneas.
  const valid=core.prepare(currentMatrix,state.catalog).filter(x=>x.status==='new');
  if(!valid.length){notice('No hay pruebas nuevas: el catálogo ya contiene esos nombres o códigos.');return;}
  if(!window.confirm('¿Agregar '+valid.length+' pruebas al catálogo central? No se modificarán las pruebas existentes.'))return;
  loading=true;const confirmButton=modal.querySelector('.catalog-import-confirm');
  confirmButton.disabled=true;modal.querySelector('.catalog-import-cancel').disabled=true;
  notice('Guardando '+valid.length+' pruebas en el catálogo…');
  const before=state.catalog.slice(),now=new Date().toISOString();
  try{
   const imported=valid.map((r,i)=>core.makeCatalogRecord(r.item,
     't-import-'+Date.now().toString(36)+'-'+i.toString(36)+'-'+Math.random().toString(36).slice(2,8),now));
   state.catalog.push(...imported);
   if(!api.save()){state.catalog=before;throw Error('No se pudo guardar localmente. No se agregaron las pruebas.');}
   api.refresh();
   if(typeof window.auditAdd==='function')window.auditAdd('Catálogo de pruebas','Importó '+imported.length+' pruebas desde '+fileName);
   const saved=imported.length;
   let cloudConfirmed=false;
   try{
    cloudConfirmed=!!(window.FleboCloudSync&&typeof window.FleboCloudSync.syncNow==='function'&&
      await window.FleboCloudSync.syncNow({verify:true}));
   }catch(error){console.warn('[FleboReport] Importación local pendiente de nube',error);}
   loading=false;modal.querySelector('.catalog-import-cancel').disabled=false;
   close();
   toast(cloudConfirmed
    ?saved+' pruebas importadas y sincronizadas. Disponibles en Catálogo y Jornada.'
    :saved+' pruebas guardadas en este dispositivo. Sincronización con la nube sin confirmar; revisa tu conexión.');
   // Domicilios usa servicios con UUID (no IDs locales). Refrescar su lista
   // después del guardado en nube y solo con un administrador conectado.
   // No bloquear la interfaz mientras se actualizan los servicios.
   if(cloudConfirmed&&membership()?.role==='admin'&&typeof window.FleboHomeCatalogRefresh==='function'){
    Promise.resolve().then(()=>window.FleboHomeCatalogRefresh()).then(ok=>{
     if(ok)toast('Catálogo de Domicilios actualizado con las pruebas importadas.');
     else toast('El catálogo se guardó; Domicilios necesita reintentar la sincronización de sus servicios.');
    }).catch(error=>{
     console.warn('[FleboReport] Servicio de Domicilios pendiente',error);
     toast('Las pruebas se guardaron. Domicilios todavía no confirmó su actualización.');
    });
   }
  }catch(error){
   loading=false;modal.querySelector('.catalog-import-cancel').disabled=false;
   confirmButton.disabled=false;
   notice(error?.message||'No se pudo completar la importación.');
  }
 }
 function mount(){build();refreshPermission();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
 else mount();
 window.addEventListener('flebo:auth-changed',mount);
 window.FleboCatalogImportUI={mount,open:()=>{mount();if(authorized())open();}};
})();
