/* TALCSYS Lab · Reportes de jornada carta v2.
   Solo presentación/exportación; nunca altera pacientes ni borra jornadas.
   Los reportes archivados se reconstruyen desde su snapshot guardado. */
(function(){
'use strict';
const W=816,H=1056,M=44,BOTTOM=1010,COLGAP=16;
function canvas(){const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');if(!x)throw Error('Canvas no disponible');x.fillStyle='#fff';x.fillRect(0,0,W,H);return c}
function t(ctx,str,x,y,max){ctx.fillText(String(str==null?'':str),x,y,max)}
function rect(ctx,x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(x,y,w,h)}
function line(ctx,str,x,y,max,fill='#193b51',font='12px Arial'){ctx.fillStyle=fill;ctx.font=font;t(ctx,str,x,y,max)}
function split(ctx,value,maxWidth){const words=String(value||'—').split(/\\s+/),out=[];let current='';for(const word of words){const next=current?current+' '+word:word;if(ctx.measureText(next).width>maxWidth&&current){out.push(current);current=word}else current=next}if(current)out.push(current);return out.length?out:['—']}
function pagesFor(snapshot){
 const s=snapshot||{},tests=Array.isArray(s.tests)?s.tests:[],patients=s.includePatientList&&Array.isArray(s.patientList)?s.patientList:[],pages=[];
 let p=canvas(),c=p.getContext('2d'),y=0;
 function next(){pages.push(p);p=canvas();c=p.getContext('2d');y=56;line(c,'TALCSYS Lab · REPORTE DE JORNADA',M,33,600,'#0a898b','bold 12px Arial');rect(c,M,43,W-M*2,1,'#dce8ed')}
 function ensure(height){if(y+height>BOTTOM)next()}
 function header(){
 line(c,s.clientName||s.companyName||'Reporte de jornada',M,75,510,'#0b3552','bold 22px Arial');
 line(c,'REPORTE DE JORNADA',W-M,65,250,'#0c8b83','bold 14px Arial'); // right-aligned below
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
 const binaries=pages.map(p=>atob(p.toDataURL('image/jpeg',.87).split(',')[1]));
 const objects=[],add=o=>{objects.push(o);return objects.length};
 const catalog=add(''),root=add('');
 const kids=[];
 for(let i=0;i<pages.length;i++){
  const pageId=objects.length+1,imageId=pageId+1,streamId=pageId+2;kids.push(pageId+' 0 R');
  objects.push(pageId+' 0 obj << /Type /Page /Parent '+root+' 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 '+imageId+' 0 R >> >> /Contents '+streamId+' 0 R >> endobj\\n');
  const binary=binaries[i];
  objects.push(imageId+' 0 obj << /Type /XObject /Subtype /Image /Width '+W+' /Height '+H+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+binary.length+' >> stream\\n'+binary+'\\nendstream endobj\\n');
  const commands='q 612 0 0 792 0 0 cm /Im0 Do Q';
  objects.push(streamId+' 0 obj << /Length '+commands.length+' >> stream\\n'+commands+'\\nendstream endobj\\n');
 }
 objects[catalog-1]=catalog+' 0 obj << /Type /Catalog /Pages '+root+' 0 R >> endobj\\n';
 objects[root-1]=root+' 0 obj << /Type /Pages /Kids ['+kids.join(' ')+'] /Count '+kids.length+' >> endobj\\n';
 let pdf='%PDF-1.4\\n%âãÏÓ\\n',offsets=[0];
 for(const obj of objects){offsets.push(pdf.length);pdf+=obj}
 const start=pdf.length;pdf+='xref\\n0 '+offsets.length+'\\n0000000000 65535 f \\n';
 for(let i=1;i<offsets.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \\n';
 pdf+='trailer << /Size '+offsets.length+' /Root '+catalog+' 0 R >>\\nstartxref\\n'+start+'\\n%%EOF';
 return new Blob([Uint8Array.from(pdf,ch=>ch.charCodeAt(0)&255)],{type:'application/pdf'});
}
function name(s,format){return'TALCSYS-Lab-jornada-'+(s.journeyDate||'reporte')+'.'+format}
function exportSnapshot(s,format){
 const pages=pagesFor(s);
 if(format==='pdf'){downloadBlobFile(pdfFromPages(pages),name(s,'pdf'));return Promise.resolve()}
 if(pages.length>12)throw Error('El reporte tiene demasiadas páginas para una sola imagen. Descárgalo en PDF.');
 const image=document.createElement('canvas');image.width=W;image.height=H*pages.length;
 if(image.height>32767)throw Error('El reporte supera el tamaño máximo de imagen. Utiliza PDF.');
 const ctx=image.getContext('2d');if(!ctx)throw Error('No se pudo preparar la imagen');
 pages.forEach((p,i)=>ctx.drawImage(p,0,i*H));
 return canvasBlob(image,'image/png').then(b=>downloadBlobFile(b,name(s,'png')));
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
window.downloadArchivedReport=async function(format){const r=archivedRecord();if(!r)return;try{await exportSnapshot(selection(r.snapshot),format);toast('Reporte preparado para descargar. Puedes repetir la descarga cuando quieras.')}catch(e){toast(e.message||'No se pudo generar el reporte')}};
window.shareArchivedReport=async function(format){const r=archivedRecord();if(!r)return;try{await exportSnapshot(selection(r.snapshot),format);toast('Reporte preparado para descargar y compartir desde el dispositivo.')}catch(e){toast(e.message||'No se pudo generar el reporte')}};
window.generateReportPDF=async function(){if(!totalTests()){toast('Agrega pruebas antes de generar el reporte.');return}try{const r=archiveCurrentReport('pdf');if(!r)return;await exportSnapshot(r.snapshot,'pdf');toast('Reporte guardado en historial y PDF generado. La jornada permanece intacta.')}catch(e){toast(e.message||'No se pudo generar el PDF')}};
window.downloadPNG=async function(){if(!totalTests()){toast('Agrega pruebas antes de generar el reporte.');return}try{const r=archiveCurrentReport('png');if(!r)return;await exportSnapshot(r.snapshot,'png');toast('Reporte guardado en historial e imagen generada.')}catch(e){toast(e.message||'No se pudo generar la imagen')}};
})();
