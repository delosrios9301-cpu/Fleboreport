/* FleboReport: OCR local optativo para órdenes PDF escaneadas.
   El PDF se dibuja y se lee en el dispositivo: no se envía a un OCR externo.
   Tesseract.js y su modelo de idioma se descargan bajo demanda desde CDN. */
(function(){
 'use strict';
 if(typeof window==='undefined')return;
 const SRC='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js';
 const MAX_OCR_PAGES=8;
 const MAX_CANVAS_PIXELS=2100000;
 let loadPromise=null;
 async function getTesseract(){
  if(!loadPromise){
   loadPromise=import(SRC).then(mod=>{
    const create=mod.createWorker||mod.default?.createWorker;
    if(typeof create!=='function')throw new Error('El módulo OCR no está disponible.');
    return create;
   }).catch(error=>{loadPromise=null;throw error;});
  }
  return loadPromise;
 }
 function pageDimensions(page){
  const initial=page.getViewport({scale:1});
  const longest=Math.max(initial.width,initial.height)||1;
  let scale=Math.min(2,1600/longest);
  const area=initial.width*initial.height*scale*scale;
  if(area>MAX_CANVAS_PIXELS)scale*=Math.sqrt(MAX_CANVAS_PIXELS/area);
  return page.getViewport({scale:Math.max(.35,scale)});
 }
 async function recognizePages(pages,options={}){
  if(!Array.isArray(pages)||!pages.length)return {text:'',processed:0,remaining:0,failed:false};
  if(!document.createElement('canvas').getContext)
   throw new Error('El navegador no permite analizar imágenes de este documento.');
  const chosen=pages.slice(0,options.limit||MAX_OCR_PAGES);
  const create=await getTesseract();
  let worker=null,processed=0,lines=[],failed=false;
  try{
   // Descarga los modelos español e inglés una sola vez por orden, sin pago.
   worker=await create('spa+eng');
   for(let i=0;i<chosen.length;i++){
    if(options.cancelled?.())break;
    options.onProgress?.(i+1,chosen.length);
    const page=chosen[i],viewport=pageDimensions(page);
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.ceil(viewport.width));
    canvas.height=Math.max(1,Math.ceil(viewport.height));
    const ctx=canvas.getContext('2d',{alpha:false});
    if(!ctx)throw new Error('No se pudo preparar la lectura de las páginas escaneadas.');
    try{
     const task=page.render({canvasContext:ctx,viewport});
     await task.promise;
     if(options.cancelled?.())break;
     const result=await worker.recognize(canvas);
     if(options.cancelled?.())break;
     if(result?.data?.text?.trim())lines.push(result.data.text.trim());
     processed++;
    }finally{
     canvas.width=0;canvas.height=0;
    }
   }
  }catch(error){
   failed=true;
   if(!lines.length)throw new Error('No se pudo reconocer la imagen escaneada: '+(error?.message||'Error del lector OCR.'));
  }finally{
   if(worker)try{await worker.terminate()}catch(_){}
  }
  return {text:lines.join('\n'),processed,
   remaining:Math.max(0,pages.length-processed),failed};
 }
 window.FleboHomeOrderOCR={recognizePages,MAX_OCR_PAGES};
})();