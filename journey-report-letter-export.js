/* TALCSYS Lab · Reportes de jornada carta v2.
   Solo presentación/exportación; nunca altera pacientes ni borra jornadas.
   Los reportes archivados se reconstruyen desde su snapshot guardado. */
(function(){
'use strict';
const W=816,H=1056,EXPORT_SCALE=2,M=44,BOTTOM=1010,COLGAP=16;
function canvas(){const c=document.createElement('canvas');c.width=W*EXPORT_SCALE;c.height=H*EXPORT_SCALE;const x=c.getContext('2d');if(!x)throw Error('Canvas no disponible');x.scale(EXPORT_SCALE,EXPORT_SCALE);x.fillStyle='#fff';x.fillRect(0,0,W,H);return c}
function t(ctx,str,x,y,max){ctx.fillText(String(str==null?'':str),x,y,max)}
function rect(ctx,x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(x,y,w,h)}
function line(ctx,str,x,y,max,fill='#193b51',font='12px Arial'){ctx.fillStyle=fill;ctx.font=font;t(ctx,str,x,y,max)}
function split(ctx,value,maxWidth){const words=String(value||'—').split(/\s+/),out=[];let current='';for(const word of words){const next=current?current+' '+word:word;if(ctx.measureText(next).width>maxWidth&&current){out.push(current);current=word}else current=next}if(current)out.push(current);return out.length?out:['—']}
function pagesFor(snapshot){
 const s=snapshot||{},tests=Array.isArray(s.tests)?s.tests:[],patients=s.includePatientList&&Array.isArray(s.patientList)?s.patientList:[],pages=[];
 let p=canvas(),c=p.getContext('2d'),y=0;
 function next(){pages.push(p);p=canvas();c=p.getContext('2d');y=56;line(c,'TALCSYS Lab · REPORTE DE JORNADA',M,33,600,'#0a898b','bold 12px Arial');rect(c,M,43,W-M*2,1,'#dce8ed')}
 function ensure(height){if(y+height>BOTTOM)next()}
 function header(){
 line(c,s.clientName||s.companyName||'Reporte de jornada',M,75,420,'#0b3552','bold 22px Arial');
 c.textAlign='right';line(c,'REPORTE DE JORNADA',W-M,65,285,'#0c8b83','bold 14px Arial');c.textAlign='left';
 line(c,'Fecha: '+(s.journeyDate||'—')+'  |  Horario: '+(s.start||'—')+' a '+(s.end||'—'),M,102,720,'#526c7d','11px Arial');
 line(c,'Responsable: '+(s.responsible||'Sin especificar'),M,121,720,'#526c7d','11px Arial');
 if(s.clientName&&s.companyName)line(c,'Laboratorio: '+s.companyName,M,139,720,'#526c7d','10px Arial');
 rect(c,M,152,W-M*2,1,'#dce8ed');
 const counts=[['PACIENTES',s.totalPatients||0],['PRUEBAS',s.totalTests||0],['TIPOS',tests.length],['RECIPIENTES',tests.reduce((n,g)=>n+(Number(g.count)||0),0)]];
 const gap=8,bw=(W-2*M-gap*3)/4;counts.forEach((b,i)=>{let x=M+i*(bw+gap);rect(c,x,165,bw,62,['#e8f6f4','#edf4f9','#f4eff9','#eaf1fa'][i]);line(c,b[0],x+9,183,bw-16,'#597482','bold 9px Arial');line(c,b[1],x+9,214,bw-16,'#123b52','bold 24px Arial')});
 y=254;
 }
 header();
 line(c,'DETALLE POR PRUEBA',M,y,600,'#123b52','bold 14px Arial');y+=12;
 for(const g of tests){ensure(39);rect(c,M,y,W-2*M,34,'#f0f6f8');line(c,g.name||'Prueba',M+12,y+21,W-2*M-90,'#163b52','bold 12px Arial');line(c,g.count||0,W-M-50,y+21,40,'#0b8886','bold 14px Arial');y+=40}
 ensure(50);rect(c,M,y+4,W-2*M,38,'#e4f6f2');line(c,'TOTAL GENERAL DE PRUEBAS',M+12,y+29,420,'#126f68','bold 12px Arial');line(c,tests.reduce((n,g)=>n+(Number(g.count)||0),0)+' pruebas',W-M-115,y+29,110,'#126f68','bold 12px Arial');y+=65;
 if(patients.length){
  ensure(56);line(c,'PACIENTES ATENDIDOS',M,y,550,'#123b52','bold 14px Arial');y+=20;
  const colW=(W-M*2-COLGAP)/2,rowH=44;
  // Las filas se leen de arriba hacia abajo en la primera columna y luego en la segunda.
  let idx=0;
  while(idx<patients.length){
   const capacity=Math.max(0,Math.floor((BOTTOM-y)/rowH));
   if(!capacity){next();continue}
   const count=Math.min(patients.length-idx,capacity*2);
   const leftCount=Math.min(capacity,Math.ceil(count/2)),rightCount=count-leftCount;
   const draw=(item,column,row)=>{
    const x=M+column*(colW+COLGAP),top=y+row*rowH;
    rect(c,x,top,colW,rowH-4,row%2?'#f3f7f9':'#eaf2f5');
    line(c,item.name||'Paciente',x+8,top+16,colW-16,'#15394f','bold 10px Arial');
    const testLine=(item.tests||[]).join(', ')||'—';
    line(c,testLine,x+8,top+31,colW-16,'#5d7585','9px Arial');
   };
   for(let i=0;i<leftCount;i++)draw(patients[idx+i],0,i);
   for(let i=0;i<rightCount;i++)draw(patients[idx+leftCount+i],1,i);
   idx+=count;y+=Math.max(leftCount,rightCount)*rowH;
   if(idx<patients.length)next();
  }
 }
 pages.push(p);
 pages.forEach((page,i)=>{const ctx=page.getContext('2d');line(ctx,'TALCSYS Lab · '+(s.journeyDate||''),M,H-23,500,'#8a9ca6','9px Arial');ctx.textAlign='right';line(ctx,'Página '+(i+1)+' de '+pages.length,W-M,H-23,160,'#8a9ca6','9px Arial');ctx.textAlign='left'});
 return pages;
}
function pdfFromPages(pages){
 // PDF A4 no: tamaño carta exacto 612 × 792 pt.
 const binaries=pages.map(p=>atob(p.toDataURL('image/jpeg',.96).split(',')[1]));
 const objects=[],add=o=>{objects.push(o);return objects.length};
 const catalog=add(''),root=add('');
 const kids=[];
 for(let i=0;i<pages.length;i++){
  const pageId=objects.length+1,imageId=pageId+1,streamId=pageId+2;kids.push(pageId+' 0 R');
  objects.push(pageId+' 0 obj << /Type /Page /Parent '+root+' 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 '+imageId+' 0 R >> >> /Contents '+streamId+' 0 R >> endobj\n');
  const binary=binaries[i];
  objects.push(imageId+' 0 obj << /Type /XObject /Subtype /Image /Width '+pages[i].width+' /Height '+pages[i].height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+binary.length+' >> stream\n'+binary+'\nendstream endobj\n');
  const commands='q 612 0 0 792 0 0 cm /Im0 Do Q';
  objects.push(streamId+' 0 obj << /Length '+commands.length+' >> stream\n'+commands+'\nendstream endobj\n');
 }
 objects[catalog-1]=catalog+' 0 obj << /Type /Catalog /Pages '+root+' 0 R >> endobj\n';
 objects[root-1]=root+' 0 obj << /Type /Pages /Kids ['+kids.join(' ')+'] /Count '+kids.length+' >> endobj\n';
 let pdf='%PDF-1.4\n%TALCSYS-LAB\n',offsets=[0];
 for(const obj of objects){offsets.push(pdf.length);pdf+=obj}
 const start=pdf.length;pdf+='xref\n0 '+offsets.length+'\n0000000000 65535 f \n';
 for(let i=1;i<offsets.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
 pdf+='trailer << /Size '+offsets.length+' /Root '+catalog+' 0 R >>\nstartxref\n'+start+'\n%%EOF';
 return new Blob([Uint8Array.from(pdf,ch=>ch.charCodeAt(0)&255)],{type:'application/pdf'});
}
function name(s,format){return'TALCSYS-Lab-jornada-'+(s.journeyDate||'reporte')+'.'+format}
let lastDownloadUrl=null;
async function nativeFilePayload(blob,filename){
 const bytes=new Uint8Array(await blob.arrayBuffer());
 let binary='';
 for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode.apply(null,bytes.subarray(i,i+8192));
 return {filename:filename,mime:blob.type,base64:btoa(binary)};
}
async function nativeSave(blob,filename){
 const capacitor=window.Capacitor;
 const native=capacitor&&typeof capacitor.isNativePlatform==='function'&&capacitor.isNativePlatform();
 const plugin=capacitor&&capacitor.Plugins&&capacitor.Plugins.TalcsysDownloads;
 if(!native||!plugin||typeof plugin.save!=='function')return null;
 return plugin.save(await nativeFilePayload(blob,filename));
}
async function shareRealReport(blob,filename){
 const capacitor=window.Capacitor;
 const native=capacitor&&typeof capacitor.isNativePlatform==='function'&&capacitor.isNativePlatform();
 const plugin=capacitor&&capacitor.Plugins&&capacitor.Plugins.TalcsysDownloads;
 if(native){
  if(!plugin||typeof plugin.share!=='function')throw Error('Este APK no admite compartir archivos. Actualiza TALCSYS Lab.');
  await plugin.share(await nativeFilePayload(blob,filename));
  return;
 }
 if(typeof navigator.share==='function'&&typeof File==='function'){
  const file=new File([blob],filename,{type:blob.type});
  if(typeof navigator.canShare==='function'&&navigator.canShare({files:[file]})){
   await navigator.share({files:[file],title:'Reporte de jornada TALCSYS Lab'});
   return;
  }
 }
 throw Error('El navegador no admite compartir archivos directamente. Descarga el reporte.');
}
window.talcsysShareReport=async function(snapshot,format){
 if(format!=='pdf'&&format!=='png')throw Error('Formato de reporte no admitido');
 const pages=pagesFor(snapshot);
 let blob;
 if(format==='pdf')blob=pdfFromPages(pages);
 else{
  if(pages.length>12)throw Error('Reporte demasiado largo para PNG; utiliza PDF.');
  const image=document.createElement('canvas');
  image.width=W*EXPORT_SCALE;image.height=H*EXPORT_SCALE*pages.length;
  if(image.height>32767||image.width*image.height>40000000)throw Error('Reporte demasiado grande para PNG HD. Utiliza PDF.');
  const ctx=image.getContext('2d');if(!ctx)throw Error('No se pudo preparar la imagen');
  pages.forEach((p,i)=>ctx.drawImage(p,0,i*H*EXPORT_SCALE));
  blob=await canvasBlob(image,'image/png');
 }
 await shareRealReport(blob,name(snapshot,format));
};
function presentFile(blob,filename){
 if(!blob||blob.size<100)throw Error('El archivo generado está vacío.');
 const url=URL.createObjectURL(blob);
 if(lastDownloadUrl)URL.revokeObjectURL(lastDownloadUrl);
 lastDownloadUrl=url;
 let panel=document.getElementById('talcsysDownloadPanel');
 if(!panel){
  panel=document.createElement('div');panel.id='talcsysDownloadPanel';
  panel.style.cssText='position:fixed;bottom:12px;left:12px;right:12px;z-index:2147483640;max-width:560px;margin:auto;padding:14px;background:#fff;color:#14384d;border:2px solid #0b8988;border-radius:12px;box-shadow:0 6px 25px #1235;font:14px Arial';
  document.body.appendChild(panel);
 }
 panel.replaceChildren();
 const title=document.createElement('strong');title.textContent='Archivo preparado: '+filename;title.style.display='block';title.style.marginBottom='9px';
 const desc=document.createElement('div');desc.textContent='Selecciona Guardar. La confirmación aparecerá únicamente si Android informa que el archivo fue escrito.';desc.style.marginBottom='10px';
 const save=document.createElement('button');save.type='button';save.textContent='Guardar en Descargas ('+Math.ceil(blob.size/1024)+' KB)';
 save.style.cssText='display:inline-block;padding:10px 14px;background:#0b8988;color:white;border:0;border-radius:8px;font-weight:bold;margin:0 8px 8px 0';
 save.onclick=async function(){
  save.disabled=true;
  try{
   const result=await nativeSave(blob,filename);
   if(result&&result.saved){desc.textContent='Guardado: '+result.location+'/'+result.filename;toast('Archivo guardado en Descargas/TALCSYS Lab');return}
   // Navegador convencional: la descarga requiere la acción explícita del usuario.
   desc.textContent='Este navegador no confirmó el guardado. Usa el enlace Descargar en navegador.';
  }catch(e){desc.textContent='No se pudo guardar: '+(e.message||String(e));toast('Error al guardar el archivo')}
  finally{save.disabled=false}
 };
 const link=document.createElement('a');link.href=url;link.download=filename;link.textContent='Descargar en navegador';
 link.style.cssText='display:inline-block;padding:10px;border:1px solid #0b8988;color:#0b8988;border-radius:8px;text-decoration:none;margin:0 8px 8px 0';
 const share=document.createElement('button');share.type='button';share.textContent='Compartir';
 share.style.cssText='padding:10px;border:1px solid #0b8988;border-radius:8px;background:white;color:#0b8988;font-weight:bold';
 share.onclick=async function(){
  share.disabled=true;
  try{
   await shareRealReport(blob,filename);
   // Selector abierto: no afirmar que WhatsApp o el destinatario recibió el archivo.
   panel.remove();
  }catch(e){
   if(e&&e.name!=='AbortError')desc.textContent='No se pudo compartir: '+(e.message||String(e));
  }finally{share.disabled=false}
 };
 const close=document.createElement('button');close.type='button';close.textContent='Cerrar';close.style.cssText='margin-left:8px;padding:10px;border:0;background:transparent;color:#345';close.onclick=function(){panel.remove()};
 panel.append(title,desc,save,link,share,close);
 const native=window.Capacitor&&typeof window.Capacitor.isNativePlatform==='function'&&window.Capacitor.isNativePlatform();
 const plugin=window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.TalcsysDownloads;
 if(native&&(!plugin||typeof plugin.save!=='function'))desc.textContent='El APK instalado todavía no incluye el guardado nativo. Es necesario instalar una versión actualizada del APK.';
 return {filename,bytes:blob.size};
}
function exportSnapshot(s,format){
 const pages=pagesFor(s);
 if(format==='pdf')return Promise.resolve(presentFile(pdfFromPages(pages),name(s,'pdf')));
 if(pages.length>12)throw Error('El reporte tiene demasiadas páginas para una sola imagen. Descárgalo en PDF.');
 const image=document.createElement('canvas');image.width=W*EXPORT_SCALE;image.height=H*EXPORT_SCALE*pages.length;
 if(image.height>32767||image.width*image.height>40000000)throw Error('El reporte es demasiado grande para PNG HD. Utiliza PDF.');
 const ctx=image.getContext('2d');if(!ctx)throw Error('No se pudo preparar la imagen');
 pages.forEach((p,i)=>ctx.drawImage(p,0,i*H*EXPORT_SCALE));
 return canvasBlob(image,'image/png').then(blob=>presentFile(blob,name(s,'png')));
}
function selection(s){
 const check=document.getElementById('talcsysArchivePatients');
 return check?Object.assign({},s,{includePatientList:check.checked}):s;
}
function addChoice(){
 const preview=document.getElementById('reportHistoryPreview');
 if(!preview||document.getElementById('talcsysArchivePatients'))return;
 const box=document.createElement('label');box.style.cssText='display:flex;align-items:center;gap:8px;padding:10px 0;font-size:12px';
 box.innerHTML='<input id="talcsysArchivePatients" type="checkbox"> Incluir pacientes al descargar (PDF o imagen)';
 const target=document.getElementById('reportHistoryPreviewBody');if(target)target.before(box);
}
const oldOpen=window.openArchivedReport;
if(typeof oldOpen==='function')window.openArchivedReport=function(id){oldOpen(id);addChoice();const r=archivedRecord(),check=document.getElementById('talcsysArchivePatients');if(check&&r)check.checked=!!r.snapshot.includePatientList};
window.downloadArchivedReport=async function(format){const r=archivedRecord();if(!r)return;try{await exportSnapshot(selection(r.snapshot),format);toast('Archivo listo: pulsa Guardar archivo o Compartir / Guardar en Archivos.')}catch(e){toast(e.message||'No se pudo generar el reporte')}};
window.shareArchivedReport=async function(format){const r=archivedRecord();if(!r)return;try{await exportSnapshot(selection(r.snapshot),format);toast('Archivo listo: pulsa Compartir / Guardar en Archivos.')}catch(e){toast(e.message||'No se pudo generar el reporte')}};
window.generateReportPDF=async function(){if(!totalTests()){toast('Agrega pruebas antes de generar el reporte.');return}try{const r=archiveCurrentReport('pdf');if(!r)return;await exportSnapshot(r.snapshot,'pdf');toast('PDF preparado. Pulsa Guardar archivo; la jornada permanece intacta.')}catch(e){toast(e.message||'No se pudo generar el PDF')}};
window.downloadPNG=async function(){if(!totalTests()){toast('Agrega pruebas antes de generar el reporte.');return}try{const r=archiveCurrentReport('png');if(!r)return;await exportSnapshot(r.snapshot,'png');toast('Imagen preparada. Pulsa Guardar archivo.')}catch(e){toast(e.message||'No se pudo generar la imagen')}};
})();
