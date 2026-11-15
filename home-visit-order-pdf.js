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
 let pending=null, pdfLib=null, running=false,mounted=false,observer=null,selectionVersion=0;
 const getCatalog=()=>typeof window.hvOrderCatalog==='function'?window.hvOrderCatalog():[];
 function status(message,kind='info'){
  const node=$('hvOrderStatus');if(!node)return;
  node.textContent=message;node.dataset.kind=kind;node.setAttribute('role',kind==='error'?'alert':'status');
 }
 function reset(){
  selectionVersion++;pending=null;running=false;const input=$('hvOrderPdfFile');if(input)input.value='';
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
 async function extractText(file){
  const lib=await pdfApi();
  const documentTask=lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,
   useSystemFonts:true,disableFontFace:true});
  let pdf;
  try{
   pdf=await documentTask.promise;
   if(pdf.numPages>MAX_PAGES)throw new Error('La orden tiene más de 15 páginas. Adjunta el PDF y selecciona sus pruebas manualmente.');
   const all=[];
   for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
    const page=await pdf.getPage(pageNumber);
    const content=await page.getTextContent({includeMarkedContent:false});
    const items=content.items||[],rows=[],byY=new Map();
    for(const item of items){
     if(!item||typeof item.str!=='string'||!item.str.trim())continue;
     const x=Number(item.transform?.[4]||0),y=Math.round(Number(item.transform?.[5]||0)/3)*3;
     const key=Number.isFinite(y)?y:0;
     if(!byY.has(key))byY.set(key,[]);
     byY.get(key).push({x,str:item.str});
    }
    // Las órdenes suelen tener dos columnas; ordenar por altura y
    // coordenada evita unir pruebas de filas distintas.
    for(const [y,line] of [...byY.entries()].sort((a,b)=>b[0]-a[0])){
     const str=line.sort((a,b)=>a.x-b.x).map(item=>item.str).join(' ').trim();
     if(str)rows.push(str);
     if(rows.length>1800)break;
    }
    all.push(...rows);
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
   ' coincidencia(s) con el catálogo · '+added+' prueba(s) añadidas automáticamente');
  const caption=el('p','hv-order-note','Revisa las pruebas seleccionadas antes de Guardar domicilio. Puedes quitar cualquier prueba desde la lista de Pruebas solicitadas.');
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
   group.append(el('summary','',result.ambiguous.length+' resultado(s) ambiguos: revisar manualmente'));
   const ul=el('ul');
   result.ambiguous.forEach(x=>ul.append(el('li','',x.line)));
   group.append(ul);section.append(group);
  }
  if(result.unmatched.length){
   const group=el('details','hv-order-unmatched');
   group.append(el('summary','',result.unmatched.length+' texto(s) sin coincidencia exacta'));
   const ul=el('ul');result.unmatched.slice(0,18).forEach(x=>ul.append(el('li','',x)));
   group.append(ul);section.append(group);
  }
  container.append(section);
 }
 async function handleFile(){
  const input=$('hvOrderPdfFile'),file=input?.files?.[0];
  if(!file)return;
  const request=++selectionVersion;
  pending=null;const results=$('hvOrderResults');if(results){results.hidden=true;results.replaceChildren();}
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
   const info=$('hvOrderPdfInfo');
   if(info)info.textContent=file.name+' · '+(file.size/1024/1024).toFixed(1)+' MB · seleccionado como adjunto de la visita.';
   if(file.size>STORAGE_BYTES){
    status('PDF seleccionado. Supera los 50 MB que admite actualmente el almacenamiento gratuito. Para guardarlo, reduce su tamaño; no se descartará hasta que lo reemplaces.','error');
    return;
   }
   if(file.size>RECOGNITION_BYTES){
    status('PDF seleccionado y listo para adjuntar. Por su tamaño no se leerán las pruebas automáticamente; selecciónalas en el buscador.','info');
    return;
   }
   status('Leyendo las pruebas de la orden PDF…');
   let text;
   try{text=await extractText(file)}
   catch(error){if(request===selectionVersion)status(error?.message||'No se pudo leer el texto del PDF. Selecciona las pruebas manualmente.','error');return}
   if(request!==selectionVersion)return;
   if(!text.trim()||text.trim().length<12){
    status('El PDF no contiene texto reconocible (posible escaneo). Se adjuntará al domicilio; selecciona las pruebas manualmente.','error');return;
   }
   const catalog=getCatalog();
   if(!catalog.length){
    status('El catálogo aún no está disponible. El PDF se adjuntará, pero las pruebas deben seleccionarse manualmente.','error');return;
   }
   const matches=core.matchText(text,catalog);
   let added=0;
   if(matches.matches.length&&typeof window.hvOrderApplyTests==='function'){
    added=window.hvOrderApplyTests(matches.matches.map(x=>x.id));
   }
   renderReview(matches,added);
   status(matches.matches.length
    ?'Se identificaron '+matches.matches.length+' prueba(s) del catálogo. Revisa la selección antes de guardar.'
    :'No se encontraron coincidencias exactas. El PDF quedará adjunto; selecciona las pruebas manualmente.',
    matches.matches.length?'success':'info');
  }catch(error){
   if(request===selectionVersion){pending=null;if(input)input.value='';status(error?.message||'No se pudo abrir el documento.','error');}
  }finally{if(request===selectionVersion)running=false;}
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
  const input=el('input');input.type='file';input.id='hvOrderPdfFile';
  input.accept='.pdf,application/pdf';input.setAttribute('aria-label','Adjuntar PDF con pruebas solicitadas');
  input.addEventListener('change',handleFile);
  const info=el('p','hv-order-help','Selecciona el PDF de la orden (sin límite para elegirlo). Los archivos de hasta 50 MB pueden guardarse; los muy grandes no se analizan automáticamente.');
  info.id='hvOrderPdfInfo';
  const message=el('p','hv-order-status','No se ha seleccionado ninguna orden.');message.id='hvOrderStatus';message.setAttribute('role','status');
  const results=el('div','hv-order-results');results.id='hvOrderResults';results.hidden=true;
  section.append(heading,input,info,message,results);
  tests.insertAdjacentElement('afterend',section);
  mounted=true;return true;
 }
 function start(){
  if(mount())return;
  observer=new MutationObserver(()=>{if(mount())observer.disconnect()});
  observer.observe(document.body,{childList:true,subtree:true});
 }
 window.FleboHomeVisitPDF={pendingFile:()=>pending,reset,mount,STORAGE_BYTES,RECOGNITION_BYTES};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
 window.addEventListener('flebo:auth-changed',()=>{
  if(!$('hvOrderPdfPanel')){mounted=false;start();}
 });
})();
