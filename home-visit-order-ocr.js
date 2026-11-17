/* FleboReport: OCR local optativo para órdenes PDF escaneadas.
   El PDF se dibuja y se lee en el dispositivo: no se envía a un OCR externo.
   Tesseract.js y su modelo de idioma se descargan bajo demanda desde CDN. */
(function(){
 'use strict';
 if(typeof window==='undefined')return;
 const SRC='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js';
 const MAX_OCR_PAGES=500; // Procesar todas las páginas habituales; mostrar cobertura cuando se supera.
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
 async function recognizeImage(file,options={}){
  const create=await getTesseract();
  let worker=null,bmp=null,canvas=null;
  try{
   worker=await create('spa+eng');
   let source=file;
   // Reducir fotografías de alta resolución para no agotar memoria en Android.
   if(typeof createImageBitmap==='function'){
    bmp=await createImageBitmap(file);
    const scale=Math.min(1,Math.sqrt(MAX_CANVAS_PIXELS/Math.max(1,bmp.width*bmp.height)));
    canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bmp.width*scale));
    canvas.height=Math.max(1,Math.round(bmp.height*scale));
    const ctx=canvas.getContext('2d',{alpha:false});
    if(!ctx)throw new Error('No se pudo preparar la fotografía.');
    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(bmp,0,0,canvas.width,canvas.height);
    source=canvas;
   }
   if(options.cancelled?.())return{text:'',cancelled:true};
   const result=await worker.recognize(source);
   return {text:options.cancelled?.()?'':result?.data?.text||'',cancelled:!!options.cancelled?.()};
  }finally{
   if(bmp?.close)bmp.close();
   if(canvas){canvas.width=0;canvas.height=0;}
   if(worker)try{await worker.terminate()}catch(_){}
  }
 }

 // Lectura por regiones de la cara frontal de la cédula: un solo worker OCR,
 // recortes ampliados y procesamiento exclusivamente en memoria.
 async function recognizeIdImage(file){
  const create=await getTesseract();
  let worker=null,bmp=null;
  const results={full:'',names:'',details:'',document:''};
  try{
   bmp=await createImageBitmap(file);
   worker=await create('spa+eng');
   const regions=[
    ['full',0,0,1,1,1800],
    ['names',.20,.29,.46,.24,1700],
    ['details',.20,.45,.65,.27,1700],
    ['document',.67,.40,.28,.23,1100]
   ];
   for(const [key,x,y,w,h,targetWidth] of regions){
    const sx=Math.floor(bmp.width*x),sy=Math.floor(bmp.height*y);
    const sw=Math.max(1,Math.min(bmp.width-sx,Math.round(bmp.width*w)));
    const sh=Math.max(1,Math.min(bmp.height-sy,Math.round(bmp.height*h)));
    const canvas=document.createElement('canvas');
    canvas.width=Math.min(2200,Math.max(sw, targetWidth));
    canvas.height=Math.max(1,Math.round(canvas.width*sh/sw));
    const ctx=canvas.getContext('2d',{alpha:false});
    if(!ctx)throw Error('No se pudo preparar la imagen.');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(bmp,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
    try{results[key]=(await worker.recognize(canvas))?.data?.text||'';}
    finally{canvas.width=0;canvas.height=0;}
   }
   return results;
  }finally{
   if(bmp?.close)bmp.close();
   if(worker)try{await worker.terminate()}catch(_){}
  }
 }
 window.FleboHomeOrderOCR={recognizePages,recognizeImage,recognizeIdImage,MAX_OCR_PAGES};
})();