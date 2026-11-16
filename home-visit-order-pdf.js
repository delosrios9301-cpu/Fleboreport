/* FleboReport · Orden de pruebas PDF al crear Domicilio.
   PDF.js se descarga bajo demanda; el archivo se analiza en el navegador,
   nunca se envía a un servicio OCR externo. Se sube SOLO al guardar
   el domicilio, mediante el bucket privado home-visit-documents. */
(function(){
 'use strict';
 const core=window.FleboHomeOrderMatch;
 if(!core)return;
 const PDF_API='https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/legacy/build/pdf.mjs';
 const PDF_WORKER='https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/legacy/build/pdf.worker.mjs';
 const RECOGNITION_BYTES=16*1024*1024,STORAGE_BYTES=50*1024*1024,MAX_PAGES=15;
 const el=(tag,cls,content)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(content!=null)x.textContent=content;return x;};
 const $=id=>document.getElementById(id);
 let pending=null, pdfLib=null, running=false,mounted=false,observer=null,selectionVersion=0,recognizedText='',ocrNote='',previewUrl=null;
 const getCatalog=async()=>typeof window.hvOrderEnsureCatalog==='function'
  ?await window.hvOrderEnsureCatalog()
  :typeof window.hvOrderCatalog==='function'?window.hvOrderCatalog():[];
 function status(message,kind='info'){
  const node=$('hvOrderStatus');if(!node)return;
  node.textContent=message;node.dataset.kind=kind;node.setAttribute('role',kind==='error'?'alert':'status');
 }
 function reset(){
  selectionVersion++;pending=null;running=false;recognizedText='';ocrNote='';if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}const input=$('hvOrderPdfFile');if(input)input.value='';
  const preview=$('hvOrderPreviewPdf');if(preview)preview.hidden=true;
  const skip=$('hvOrderCancelRead');if(skip)skip.hidden=true;
  const retry=$('hvOrderRetryCatalog');if(retry)retry.hidden=true;
  const box=$('hvOrderResults');if(box){box.replaceChildren();box.hidden=true;}
  const f=$('hvOrderPdfInfo');if(f)f.textContent='Puedes seleccionar una orden PDF con texto; sus pruebas se añadirán al selector para que las revises.';
  status('No se ha seleccionado ninguna orden.');
 }
 async function pdfApi(){
  if(pdfLib)return pdfLib;
  try{
   const mod=await import(PDF_API);
   mod.GlobalWorkerOptions.workerSrc=PDF_WORKER;
   pdfLib=mod;return mod;
  }catch(_){
   throw new Error('No se pudo iniciar el lector PDF en este dispositivo o sin conexión. Puedes adjuntar el PDF y elegir las pruebas manualmente.');
  }
 }
 async function extractText(file,request){
  const lib=await pdfApi();
  const documentTask=lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,
   useSystemFonts:true,disableFontFace:true});
  let pdf;
  try{
   pdf=await documentTask.promise;
   const limit=Math.min(pdf.numPages,MAX_PAGES),all=[],scannedPages=[];
   if(pdf.numPages>MAX_PAGES)ocrNote='Se analizarán las primeras '+MAX_PAGES+' páginas de '+pdf.numPages+'. Revisa el PDF original por las restantes.';
   for(let pageNumber=1;pageNumber<=limit;pageNumber++){
    if(request!==selectionVersion)return '';
    const page=await pdf.getPage(pageNumber);
    const content=await page.getTextContent({includeMarkedContent:false});
    const items=content.items||[],rows=[],byY=new Map();
    const pageWidth=page.getViewport({scale:1}).width;
    for(const item of items){
     if(!item||typeof item.str!=='string'||!item.str.trim())continue;
     const x=Number(item.transform?.[4]||0),y=Math.round(Number(item.transform?.[5]||0)/3)*3;
     const key=Number.isFinite(y)?y:0;
     if(!byY.has(key))byY.set(key,[]);
     byY.get(key).push({x,str:item.str,width:Number(item.width)||item.str.length*5.5});
    }
    // Diferenciar órdenes de dos columnas: un renglón visual puede contener
    // dos exámenes independientes separados por una distancia grande.
    for(const [,line] of [...byY.entries()].sort((a,b)=>b[0]-a[0])){
     const segments=[],gap=Math.max(34,pageWidth*0.075);
     let current='',right=-Infinity;
     for(const word of line.sort((a,b)=>a.x-b.x)){
      if(current&&word.x-right>gap){segments.push(current.trim());current='';}
      current+=(current?' ':'')+word.str;
      right=Math.max(right,word.x+word.width);
     }
     if(current.trim())segments.push(current.trim());
     for(const seg of segments)if(seg)rows.push(seg);
     if(rows.length>1800)break;
    }
    if(rows.length<=2||rows.join(' ').trim().length<22)scannedPages.push(page);
    all.push(...rows);
   }
   if(request===selectionVersion&&scannedPages.length){
    const ocr=window.FleboHomeOrderOCR;
    if(!ocr?.recognizePages){
     ocrNote=(ocrNote+' No se pudo iniciar OCR para las páginas escaneadas.').trim();
    }else{
     status('Se detectaron '+scannedPages.length+' página(s) con poco texto; intentando lectura de imágenes en este dispositivo…');
     try{
      const result=await ocr.recognizePages(scannedPages,{
       cancelled:()=>request!==selectionVersion,
       onProgress:(i,total)=>status('Reconociendo texto escaneado '+i+'/'+total+' (el PDF no sale del dispositivo)…')
      });
      if(request!==selectionVersion)return '';
      if(result.text)all.push(result.text);
      if(result.remaining>0)ocrNote=(ocrNote+' Faltan '+result.remaining+' página(s) escaneadas por revisar; abre el PDF original.').trim();
      if(result.failed)ocrNote=(ocrNote+' Algunas páginas no pudieron leerse; comprueba la orden.').trim();
     }catch(error){
      ocrNote=(ocrNote+' Lectura de escaneos no disponible: '+(error?.message||'Error de OCR')+'.').trim();
     }
    }
   }
   return all.join('\n');
  }finally{
   try{await pdf?.destroy()}catch(_){}
   try{await documentTask.destroy()}catch(_){}
  }
 }
 function renderReview(result,added){
  const container=$('hvOrderResults');if(!container)return;
  container.replaceChildren();container.hidden=false;
  const section=el('div','hv-order-review');
  const title=el('strong','hv-order-title',result.matches.length+
   ' coincidencia(s) con el catálogo · '+added+' prueba(s) incorporadas antes de guardar');
  const caption=el('p','hv-order-note','Las coincidencias seguras ya aparecen en Pruebas solicitadas. Revisa los exámenes, completa los que falten y luego guarda el domicilio; el responsable recibirá la lista desde el primer momento.');
  section.append(title,caption);
  if(result.matches.length){
   const list=el('div','hv-order-matches');
   for(const match of result.matches){
    const item=el('div','hv-order-match');
    item.append(el('span','',match.name),el('span','hv-order-verified','Coincide'));
    list.append(item);
   }
   section.append(list);
  }
  if(result.ambiguous.length){
   const group=el('details','hv-order-unmatched');
   group.append(el('summary','',result.ambiguous.length+' resultado(s) ambiguos (no se agregaron automáticamente)'));
   const ul=el('ul');
   result.ambiguous.forEach(x=>ul.append(el('li','',x.line)));
   group.append(ul);section.append(group);
  }
  if(result.unmatched.length){
   const group=el('details','hv-order-unmatched');
   group.append(el('summary','',result.unmatched.length+' línea(s) no identificadas: comprobar contra PDF original'));
   const ul=el('ul');result.unmatched.slice(0,18).forEach(x=>ul.append(el('li','',x)));
   group.append(ul);section.append(group);
  }
  if(result.suggestions?.length){
   const group=el('details','hv-order-unmatched');
   group.append(el('summary','',result.suggestions.length+' posible(s) coincidencia(s) para revisión'));
   const ul=el('ul');
   for(const hint of result.suggestions)ul.append(el('li','',hint.line+' → '+hint.name+' (no agregada)'));
   group.append(ul);section.append(group);
  }
  if(ocrNote)section.append(el('p','hv-order-note',ocrNote));
  container.append(section);
 }
 /* La lectura del PDF no depende de la sincronización del Catálogo.
    Consultar la nube en modo lectura, distinguir errores y permitir reintento
    sin pedir al usuario que vuelva a adjuntar la orden. */
 async function matchAndApply(text,request){
  const retry=$('hvOrderRetryCatalog');
  if(retry){retry.hidden=true;retry.disabled=true;}
  status('Consultando las pruebas activas del Catálogo de FleboReport…');
  try{
   const catalog=await getCatalog();
   if(request!==selectionVersion)return;
   if(!catalog.length){
    status('La nube no devolvió pruebas disponibles para esta sesión. No se borró ninguna prueba. Pulsa Reintentar búsqueda en catálogo o comprueba tu acceso.','error');
    if(retry)retry.hidden=false;
    return;
   }
   const matches=core.matchText(text,catalog);
   let added=0;
   if(matches.matches.length&&typeof window.hvOrderApplyTests==='function'){
    added=window.hvOrderApplyTests(matches.matches.map(x=>x.id));
   }
   renderReview(matches,added);
   status(matches.matches.length
    ?'Catálogo recuperado ('+catalog.length+' pruebas activas). '+matches.matches.length+' prueba(s) reconocida(s), '+added+' nueva(s) ya agregada(s) antes de crear el domicilio. Revisa y completa lo pendiente.'
    :'Catálogo recuperado ('+catalog.length+' pruebas activas). No hubo coincidencias únicas; revisa el PDF original y añade las pruebas manualmente.',
    matches.matches.length?'success':'info');
  }catch(error){
   if(request!==selectionVersion)return;
   status('No se pudo consultar el catálogo desde la nube: '+(error?.message||'Error de conexión o permisos')+'. El PDF permanece adjunto para guardar. Pulsa Reintentar búsqueda en catálogo.','error');
   if(retry)retry.hidden=false;
  }finally{
   if(retry)retry.disabled=false;
  }
 }
 async function handleFile(){
  const input=$('hvOrderPdfFile'),file=input?.files?.[0];
  if(!file)return;
  const request=++selectionVersion;
  pending=null;recognizedText='';ocrNote='';if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}const preview=$('hvOrderPreviewPdf');if(preview)preview.hidden=true;
  const skip=$('hvOrderCancelRead');if(skip)skip.hidden=false;
  const retry=$('hvOrderRetryCatalog');if(retry)retry.hidden=true;
  const results=$('hvOrderResults');if(results){results.hidden=true;results.replaceChildren();}
  const extension=file.name.toLowerCase().endsWith('.pdf'),
   validMime=!file.type||['application/pdf','application/x-pdf','application/octet-stream'].includes(file.type);
  if(!extension||!validMime||file.size===0){
   input.value='';status('El archivo debe ser un PDF válido y no estar vacío.','error');return;
  }
  running=true;
  // Nunca deshabilitar el selector: leer un PDF escaneado puede demorar.
  // Permitir reemplazar la orden en cualquier momento sin bloquear el panel.
  try{
   const signature=new TextDecoder().decode(await file.slice(0,5).arrayBuffer());
   if(signature!=='%PDF-')throw new Error('El archivo no parece ser un PDF válido.');
   if(request!==selectionVersion)return;
   pending=file; // conserva el archivo aunque el lector PDF falle
   if(preview)preview.hidden=false;
   const info=$('hvOrderPdfInfo');
   if(info)info.textContent=file.name+' · '+(file.size/1024/1024).toFixed(1)+' MB · seleccionado como adjunto de la visita.';
   if(file.size>STORAGE_BYTES){
    status('PDF seleccionado, pero supera los 50 MB del almacenamiento. Puedes guardar el domicilio sin adjuntarlo y agregar después una versión más pequeña.','error');
    return;
   }
   if(file.size>RECOGNITION_BYTES){
    status('PDF seleccionado y listo para adjuntar. Por su tamaño no se leerán las pruebas automáticamente; selecciónalas en el buscador.','info');
    return;
   }
   status('Leyendo las pruebas de la orden PDF…');
   let text;
   try{text=await extractText(file,request)}
   catch(error){if(request===selectionVersion)status(error?.message||'No se pudo leer el texto del PDF. Selecciona las pruebas manualmente.','error');return}
   if(request!==selectionVersion)return;
   if(!text.trim()){
    status('No se detectaron pruebas legibles en texto ni en las páginas escaneadas. El PDF sigue listo para adjuntarse; abre la orden y agrega las pruebas manualmente. '+ocrNote,'error');return;
   }
   recognizedText=text;
   await matchAndApply(text,request);
  }catch(error){
   if(request===selectionVersion){pending=null;if(input)input.value='';status(error?.message||'No se pudo abrir el documento.','error');}
  }finally{if(request===selectionVersion){running=false;const cancel=$('hvOrderCancelRead');if(cancel)cancel.hidden=true;}}
 }
 function mount(){
  if($('hvOrderPdfPanel'))return true;
  const panel=$('hvCreatePanel');
  const tests=$('hvTestsSearch')?.closest('.field.full');
  if(!panel||!tests)return false;
  const section=el('section','field full hv-order-pdf-panel');section.id='hvOrderPdfPanel';
  const heading=el('div','hv-order-heading');
  heading.append(el('strong','', 'Orden médica en PDF'),
   el('small','', 'Opcional · se conservará como documento privado del domicilio'));
  const input=el('input');input.type='file';input.id='hvOrderPdfFile';input.required=false;
  input.accept='.pdf,application/pdf';input.setAttribute('aria-label','Adjuntar PDF con pruebas solicitadas');
  input.addEventListener('change',handleFile);
  const info=el('p','hv-order-help','Puedes guardar el domicilio sin adjuntar una orden. Agrega un PDF opcional: sus pruebas se reconocerán y seleccionarán antes de crear o asignar el domicilio. También puedes elegirlas manualmente. Los archivos de hasta 50 MB pueden almacenarse.');
  info.id='hvOrderPdfInfo';
  const message=el('p','hv-order-status','No se ha seleccionado ninguna orden.');message.id='hvOrderStatus';message.setAttribute('role','status');
  const retry=el('button','hv-order-catalog-retry','Reintentar búsqueda en catálogo');
  retry.type='button';retry.id='hvOrderRetryCatalog';retry.hidden=true;
  retry.addEventListener('click',()=>{if(recognizedText)void matchAndApply(recognizedText,selectionVersion);});
  const preview=el('button','hv-order-catalog-retry','Ver PDF original');
  preview.id='hvOrderPreviewPdf';preview.type='button';preview.hidden=true;
  preview.addEventListener('click',()=>{
   if(!pending)return;
   if(!previewUrl)previewUrl=URL.createObjectURL(pending);
   const opened=window.open(previewUrl,'_blank');
   if(!opened)status('El navegador bloqueó la vista previa. Permite ventanas emergentes para consultar el PDF.','error');
  });
  const cancel=el('button','hv-order-catalog-retry','Detener lectura y agregar pruebas manualmente');
  cancel.type='button';cancel.id='hvOrderCancelRead';cancel.hidden=true;
  cancel.addEventListener('click',()=>{
   selectionVersion++;running=false;recognizedText='';
   cancel.hidden=true;retry.hidden=true;
   status('Lectura detenida. El PDF permanece seleccionado; puedes agregar las pruebas manualmente y guardar.');
  });
  const tools=el('div','hv-order-tools');tools.append(preview,cancel,retry);
  const results=el('div','hv-order-results');results.id='hvOrderResults';results.hidden=true;
  section.append(heading,input,info,message,tools,results);
  tests.insertAdjacentElement('afterend',section);
  mounted=true;return true;
 }
 function start(){
  if(mount())return;
  observer=new MutationObserver(()=>{if(mount())observer.disconnect()});
  observer.observe(document.body,{childList:true,subtree:true});
 }
 window.FleboHomeVisitPDF={pendingFile:()=>pending,isAnalyzing:()=>running,cancelAnalysis:()=>{selectionVersion++;running=false;},reset,mount,STORAGE_BYTES,RECOGNITION_BYTES};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
 window.addEventListener('flebo:auth-changed',()=>{
  if(!$('hvOrderPdfPanel')){mounted=false;start();}
 });
})();
