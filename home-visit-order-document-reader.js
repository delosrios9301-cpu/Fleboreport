/* FleboReport · Lectura local de órdenes, presupuestos, fotografías y listados.
   Los archivos permanecen en el navegador durante el reconocimiento.
   No se permite macros, fórmulas ni contenido HTML activo. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.FleboHomeOrderDocuments=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const ZIP_LIB='https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';
 let zipPromise=null;
 const EXTENSIONS={
  pdf:'pdf',jpg:'image',jpeg:'image',png:'image',webp:'image',
  docx:'docx',xlsx:'xlsx',xlsm:'xlsx',csv:'text',txt:'text',
  doc:'legacy',xls:'legacy'
 };
 const MIME={
  pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',
  docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm:'application/vnd.ms-excel.sheet.macroEnabled.12',
  csv:'text/csv',txt:'text/plain',doc:'application/msword',xls:'application/vnd.ms-excel'
 };
 function extension(file){return String(file?.name||'').toLowerCase().split('.').pop().trim();}
 function kind(file){return EXTENSIONS[extension(file)]||'';}
 function storageMime(file){return MIME[extension(file)]||'';}
 async function zipApi(){
  if(!zipPromise){
   zipPromise=import(ZIP_LIB).then(x=>{
    const api=x.default||x.JSZip||x;
    if(typeof api.loadAsync!=='function')throw new Error('No se pudo cargar el lector de documentos comprimidos.');
    return api;
   }).catch(e=>{zipPromise=null;throw e});
  }
  return zipPromise;
 }
 const parseXML=text=>{
  const parser=new DOMParser();
  const doc=parser.parseFromString(text,'application/xml');
  if(doc.getElementsByTagName('parsererror').length)throw new Error('Documento XML dañado.');
  return doc;
 };
 function textContent(node,localName){
  const found=Array.from(node.getElementsByTagName('*')).filter(n=>n.localName===localName);
  return found.map(x=>x.textContent||'').join(' ').replace(/\s+/g,' ').trim();
 }
 async function readWord(file){
  const ZIP=await zipApi(),zip=await ZIP.loadAsync(file);
  const item=zip.file('word/document.xml');
  if(!item)throw new Error('El archivo Word no contiene una sección de texto reconocible.');
  const xml=parseXML(await item.async('string'));
  const lines=[];
  for(const row of Array.from(xml.getElementsByTagName('*')).filter(x=>x.localName==='tr').slice(0,1500)){
   const cells=Array.from(row.children).filter(x=>x.localName==='tc');
   const values=cells.map(x=>textContent(x,'t')).filter(Boolean);
   if(values.length)lines.push(values.join('\t'));
  }
  for(const p of Array.from(xml.getElementsByTagName('*')).filter(x=>x.localName==='p').slice(0,3500)){
   const text=textContent(p,'t');
   if(text)lines.push(text);
  }
  return lines.join('\n');
 }
 async function readWorkbook(file){
  const ZIP=await zipApi(),zip=await ZIP.loadAsync(file);
  const shared=zip.file('xl/sharedStrings.xml');
  const dictionary=[];
  if(shared){
   const xml=parseXML(await shared.async('string'));
   for(const si of Array.from(xml.getElementsByTagName('*')).filter(x=>x.localName==='si').slice(0,20000))
    dictionary.push(textContent(si,'t'));
  }
  const keys=Object.keys(zip.files).filter(p=>/^xl\/worksheets\/sheet\d+\.xml$/i.test(p)).slice(0,10);
  if(!keys.length)throw new Error('No se encontraron hojas legibles en la planilla.');
  const lines=[];
  for(const key of keys){
   const xml=parseXML(await zip.file(key).async('string'));
   const rows=Array.from(xml.getElementsByTagName('*')).filter(x=>x.localName==='row').slice(0,3500);
   for(const row of rows){
    const cells=Array.from(row.children).filter(x=>x.localName==='c').slice(0,50);
    const items=cells.map(c=>{
     if(c.getAttribute('t')==='inlineStr')return textContent(c,'t');
     const v=Array.from(c.children).find(x=>x.localName==='v');
     if(!v)return '';
     const raw=v.textContent||'';
     return c.getAttribute('t')==='s'?dictionary[Number(raw)]||'':raw;
    }).filter(Boolean);
    if(items.length)lines.push(items.join('\t'));
   }
  }
  return lines.join('\n');
 }
 async function readText(file){
  const bytes=new Uint8Array(await file.arrayBuffer());
  const encoding=bytes[0]===0xff&&bytes[1]===0xfe?'utf-16le':
   bytes[0]===0xfe&&bytes[1]===0xff?'utf-16be':'utf-8';
  return new TextDecoder(encoding).decode(bytes).replace(/\0/g,'').slice(0,550000);
 }
 async function read(file,options={}){
  const type=kind(file);
  if(!type)throw new Error('Tipo de archivo no compatible para lectura. Utiliza PDF, foto, Word moderno, Excel moderno, CSV o TXT.');
  if(type==='pdf'){
   if(typeof options.pdfReader!=='function')throw new Error('El lector PDF no está disponible.');
   return options.pdfReader(file,options.request);
  }
  if(type==='image'){
   const ocr=options.ocr;
   if(!ocr?.recognizeImage)throw new Error('No está disponible la lectura OCR de fotografías; conserva el adjunto y registra las pruebas manualmente.');
   options.onProgress?.('Analizando fotografía con OCR local…');
   return (await ocr.recognizeImage(file,{cancelled:options.cancelled})).text||'';
  }
  if(type==='docx')return readWord(file);
  if(type==='xlsx')return readWorkbook(file);
  if(type==='text')return readText(file);
  // Word .doc y Excel .xls son binarios antiguos; nunca afirmar reconocimiento.
  throw new Error('El formato antiguo .doc o .xls no permite lectura fiable en este navegador. Convierte a PDF, DOCX, XLSX o foto; el archivo puede adjuntarse para revisión.');
 }
 return {extension,kind,storageMime,read,readWord,readWorkbook,readText};
});