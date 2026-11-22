/* TALCSYS Lab | Archivo HD y compartir reporte de jornada.
   No limpia la jornada, no altera muestras ni envía archivos sin acción humana. */
(function(){
 'use strict';

 function notify(message){if(typeof window.toast==='function')window.toast(message);else console.info('[Jornada]',message);}
 function canShareReports(){const can=window.fleboCan;return typeof can==='function'&&(can('reports','export')||can('reports','print'));}
 function bytesToBase64(blob){
  return new Promise(function(resolve,reject){
   const reader=new FileReader();
   reader.onload=function(){
    const value=String(reader.result||'');
    const comma=value.indexOf(',');
    comma>=0?resolve(value.slice(comma+1)):reject(new Error('Archivo no codificable'));
   };
   reader.onerror=function(){reject(reader.error||new Error('No se pudo preparar el archivo'))};
   reader.readAsDataURL(blob);
  });
 }
 function pdfSafeText(string){return String(string).replace(/[^\x20-\x7e]/g,'');}
 async function letterPdfFromCanvas(canvas){
  // Carta 612x792 pt; imagen de cada página a ~320 DPI, no una hoja gigantesca.
  const pw=612,ph=792,margin=36,usableW=pw-2*margin,usableH=ph-2*margin;
  const rasterW=Math.min(canvas.width,2400);
  const sourceSliceH=Math.floor(canvas.width*usableH/usableW);
  const images=[];
  for(let y=0;y<canvas.height;y+=sourceSliceH){
   const take=Math.min(sourceSliceH,canvas.height-y);
   const rasterH=Math.max(1,Math.round(take*rasterW/canvas.width));
   const part=document.createElement('canvas');
   part.width=rasterW;part.height=rasterH;
   const ctx=part.getContext('2d',{alpha:false});
   if(!ctx)throw new Error('No se pudo preparar la página PDF');
   ctx.fillStyle='#fff';ctx.fillRect(0,0,rasterW,rasterH);
   ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
   ctx.drawImage(canvas,0,y,canvas.width,take,0,0,rasterW,rasterH);
   const url=part.toDataURL('image/jpeg',.98);
   images.push({raw:atob(url.split(',')[1]),width:rasterW,height:rasterH});
   part.width=0;part.height=0;
  }
  if(!images.length)throw new Error('Reporte vacío');
  const n=images.length;
  const ids=images.map((_,i)=>3+i*3);
  const objects=[];
  objects[1]='1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n';
  objects[2]='2 0 obj << /Type /Pages /Kids ['+ids.map(i=>i+' 0 R').join(' ')+'] /Count '+n+' >> endobj\n';
  images.forEach(function(image,i){
   const page=ids[i],im=page+1,content=page+2;
   const drawnH=usableW*image.height/image.width;
   const y=ph-margin-drawnH;
   const command='q '+usableW+' 0 0 '+drawnH.toFixed(3)+' '+margin+' '+y.toFixed(3)+' cm /Im0 Do Q';
   objects[page]=page+' 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 '+pw+' '+ph+'] /Resources << /XObject << /Im0 '+im+' 0 R >> >> /Contents '+content+' 0 R >> endobj\n';
   objects[im]=im+' 0 obj << /Type /XObject /Subtype /Image /Width '+image.width+' /Height '+image.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+image.raw.length+' >>\nstream\n'+image.raw+'\nendstream\nendobj\n';
   objects[content]=content+' 0 obj << /Length '+command.length+' >>\nstream\n'+command+'\nendstream\nendobj\n';
  });
  let pdf='%PDF-1.4\n',offsets=[0];
  for(let i=1;i<objects.length;i++){
   if(typeof objects[i]!=='string')throw new Error('Estructura PDF incompleta');
   offsets[i]=pdf.length;pdf+=objects[i];
  }
  const xref=pdf.length;
  pdf+='xref\n0 '+objects.length+'\n0000000000 65535 f \n';
  for(let i=1;i<objects.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  pdf+='trailer << /Size '+objects.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
  const arr=new Uint8Array(pdf.length);
  for(let i=0;i<pdf.length;i++)arr[i]=pdf.charCodeAt(i)&255;
  return new Blob([arr],{type:'application/pdf'});
 }

 // Se aplica tanto a Descargas como a Compartir desde el historial.
 window.archivePdfBlob=letterPdfFromCanvas;

 async function shareRecord(record,format){
  if(!record||!record.snapshot){notify('No hay un reporte seleccionado.');return;}
  if(format!=='png'&&format!=='pdf')throw new Error('Formato no disponible');
  // Utilizar exactamente el mismo generador Carta del panel Descargar/Compartir.
  // Evita dos archivos distintos y da prioridad al plugin nativo de Android.
  if(typeof window.talcsysShareReport==='function'){
   const check=document.getElementById('talcsysArchivePatients');
   const snapshot=check&&!check.closest('[hidden]')?
     Object.assign({},record.snapshot,{includePatientList:!!check.checked}):record.snapshot;
   return await window.talcsysShareReport(snapshot,format);
  }
  const canvas=await window.makeArchivedCanvas(record.snapshot);
  const blob=format==='pdf'
   ?await letterPdfFromCanvas(canvas)
   :await window.canvasBlob(canvas,'image/png');
  // El nombre solo utiliza letras ASCII, números, guiones, puntos y subrayados.
  const date=String(record.snapshot.journeyDate||'jornada').replace(/[^0-9A-Za-z_-]/g,'_');
  const filename='Reporte-de-jornada-'+date+'.'+format;
  const mime=format==='pdf'?'application/pdf':'image/png';
  const capacitor=window.Capacitor;
  const native=!!capacitor?.isNativePlatform?.();
  const saver=capacitor?.Plugins?.TalcsysDownloads;

  if(native&&typeof saver?.share==='function'){
   await saver.share({filename:filename,mime:mime,base64:await bytesToBase64(blob)});
   return;
  }
  if(typeof navigator.share==='function'&&typeof File==='function'){
   const file=new File([blob],filename,{type:mime});
   let allowed=true;
   try{if(typeof navigator.canShare==='function')allowed=navigator.canShare({files:[file]})}
   catch(e){allowed=false}
   if(allowed){
    try{
     await navigator.share({title:'Reporte de jornada',files:[file]});
     return;
    }catch(e){if(e?.name==='AbortError')return}
   }
  }
  // Android 2.8 puede no disponer del puente nativo Compartir. No simular envío.
  if(native&&typeof saver?.save==='function'){
   await saver.save({filename:filename,mime:mime,base64:await bytesToBase64(blob)});
   notify('El archivo se guardó en Descargas/TALCSYS Lab. Actualiza el APK para compartir directamente.');
   return;
  }
  window.downloadBlobFile(blob,filename);
  notify('El archivo se descargó. Este dispositivo no admite compartirlo directamente.');
 }

 window.shareCurrentJourneyReport=async function(format){
  if(!canShareReports()){notify('No tienes permiso para compartir reportes.');return;}
  if(typeof window.totalTests!=='function'||window.totalTests()<=0){
   notify('Agrega pruebas a la jornada antes de compartir el reporte.');return;
  }
  // Generar una copia del reporte sin borrar ni finalizar la jornada.
  try{
   const record=window.archiveCurrentReport(format);
   if(!record)return;
   await shareRecord(record,format);
  }catch(error){
   console.error('[TALCSYS][Jornada] No se pudo compartir el archivo:',error);
   notify('No se pudo compartir el archivo: '+(error?.message||'Error del dispositivo'));
  }
 };
 window.shareArchivedReport=async function(format,recordId){
  if(!canShareReports()){notify('No tienes permiso para compartir reportes.');return;}
  const records=window.FleboAppState?.get?.()?.reportHistory||[];
  const record=recordId?records.find(x=>String(x.id)===String(recordId)):
   (typeof window.archivedRecord==='function'?window.archivedRecord():null);
  try{await shareRecord(record,format)}
  catch(error){
   console.error('[TALCSYS][Jornada] No se pudo compartir el archivo:',error);
   notify('No se pudo compartir el archivo: '+(error?.message||'Error del dispositivo'));
  }
 };

 // Delegación para botones en los reportes guardados, sin inyectar datos en onclick.
 document.addEventListener('click',function(event){
  const b=event.target instanceof Element?event.target.closest('[data-archive-share-id]'):null;
  if(!b)return;
  event.preventDefault();
  window.shareArchivedReport(b.dataset.archiveShareFormat,b.dataset.archiveShareId);
 });

})();
