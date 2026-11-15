/* FleboReport · Importación segura de pruebas (CSV/Excel XLSX).
   No instala dependencias, no hace peticiones de red ni procesa macros. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.FleboCatalogImportCore=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const MAX_FILE=3*1024*1024, MAX_ROWS=1500, MAX_XML=8*1024*1024;
 const norm=s=>String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').replace(/\s+/g,' ').trim();
 const clean=s=>String(s==null?'':s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,600);
 const headings={
  name:['nombre','nombre de la prueba','prueba','examen','estudio','analisis','test','test name','nombre del examen'],
  code:['codigo','codigo de prueba','codigo del examen','id prueba','code','test code'],
  sample:['muestra','tipo de muestra','sample','specimen'],
  vessel:['recipiente','tubo','contenedor','tipo de tubo','vessel','container'],
  colorName:['color del tubo','color de tubo','color de tapa','color','color recipiente','color del recipiente'],
  shape:['forma','tipo de recipiente','forma de recipiente','shape','tipo de contenedor'],
  volume:['volumen','volumen requerido','volume'],
  method:['metodo','metodologia','tecnica','method'],
  fasting:['ayuno','horas de ayuno','fasting'],
  conditions:['condiciones','preparacion','requisitos','conditions'],
  instructions:['indicaciones','instrucciones','observaciones','instructions']
 };
 const headerMap=header=>{
  const map={};
  (header||[]).forEach((v,i)=>{
   const key=Object.keys(headings).find(k=>headings[k].includes(norm(v)));
   if(key!==undefined&&map[key]===undefined)map[key]=i;
  });
  return map;
 };
 function chooseSeparator(s){
  const first=String(s||'').split(/\r?\n/,1)[0];
  const count=d=>{let quotes=false,n=0;for(let i=0;i<first.length;i++){if(first[i]==='"'&&first[i+1]==='"'&&quotes){i++;continue}if(first[i]==='"')quotes=!quotes;else if(first[i]===d&&!quotes)n++;}return n;};
  return [[';',count(';')],[',',count(',')],['\t',count('\t')]].sort((a,b)=>b[1]-a[1])[0][0];
 }
 function parseDelimited(text){
  const input=String(text||'').replace(/^\uFEFF/,'');
  const sep=chooseSeparator(input);let quote=false,cell='',row=[],rows=[];
  function pushRow(){row.push(cell);cell='';if(row.some(v=>String(v).trim()))rows.push(row);row=[];if(rows.length>MAX_ROWS+1)throw Error('El archivo supera el máximo de '+MAX_ROWS+' pruebas por importación.');}
  for(let i=0;i<input.length;i++){
   const c=input[i];
   if(c==='"'){
    if(quote&&input[i+1]==='"'){cell+='"';i++;}
    else if(!quote&&cell.trim())cell+=c;
    else quote=!quote;
   }else if(c===sep&&!quote){row.push(cell);cell='';}
   else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&input[i+1]==='\n')i++;pushRow();}
   else {cell+=c;if(cell.length>3000)throw Error('Una celda excede el tamaño permitido.');}
  }
  if(quote)throw Error('El archivo contiene comillas sin cerrar.');
  if(row.length||cell)pushRow();
  return rows;
 }
 function firstTag(node,name){return node.getElementsByTagNameNS('*',name)[0]||node.getElementsByTagName(name)[0]||null}
 function xmlText(node,name){const x=firstTag(node,name);return x?x.textContent||'':'';}
 function xmlDoc(s){
  if(s.length>MAX_XML)throw Error('El contenido Excel supera el límite de seguridad.');
  const doc=new DOMParser().parseFromString(s,'application/xml');
  if(doc.getElementsByTagName('parsererror').length)throw Error('El documento Excel tiene XML inválido.');
  return doc;
 }
 function zipEntries(bytes){
  const buf=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let pos=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
   if(buf.getUint32(i,true)===0x06054b50){pos=i;break;}
  }
  if(pos<0)throw Error('El archivo no es un XLSX válido.');
  const total=buf.getUint16(pos+10,true), offset=buf.getUint32(pos+16,true);
  if(total>250||offset>=bytes.length)throw Error('El XLSX tiene demasiados archivos internos.');
  let cursor=offset, entries=new Map();
  const td=new TextDecoder('utf-8');
  for(let i=0;i<total;i++){
   if(cursor+46>bytes.length||buf.getUint32(cursor,true)!==0x02014b50)throw Error('Directorio XLSX inválido.');
   const method=buf.getUint16(cursor+10,true);
   const packed=buf.getUint32(cursor+20,true),unpacked=buf.getUint32(cursor+24,true);
   const nameLen=buf.getUint16(cursor+28,true),extra=buf.getUint16(cursor+30,true),comment=buf.getUint16(cursor+32,true);
   const local=buf.getUint32(cursor+42,true);
   if(cursor+46+nameLen+extra+comment>bytes.length)throw Error('Nombre XLSX inválido.');
   const path=td.decode(bytes.subarray(cursor+46,cursor+46+nameLen));
   if(path.startsWith('xl/')&&/\.(xml|rels)$/.test(path)&&!path.includes('..')){
    if(unpacked>MAX_XML)throw Error('Hoja Excel demasiado grande.');
    entries.set(path,{method,packed,unpacked,local});
   }
   cursor+=46+nameLen+extra+comment;
  }
  async function read(path){
   const e=entries.get(path);if(!e)return '';
   if(e.local+30>bytes.length||buf.getUint32(e.local,true)!==0x04034b50)throw Error('Entrada XLSX inválida.');
   const n=buf.getUint16(e.local+26,true),x=buf.getUint16(e.local+28,true);
   const start=e.local+30+n+x;if(start+e.packed>bytes.length)throw Error('Archivo XLSX incompleto.');
   const packed=bytes.subarray(start,start+e.packed);
   let plain;
   if(e.method===0)plain=packed;
   else if(e.method===8){
    if(typeof DecompressionStream==='undefined')throw Error('Este dispositivo no puede leer XLSX directamente. Guarda el Excel como CSV UTF-8 y cárgalo.');
    let stream;
    try{stream=new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));}
    catch(_){throw Error('Este navegador no admite XLSX. Exporta la hoja como CSV UTF-8.');}
    const reader=stream.getReader(),chunks=[];let size=0;
    try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>MAX_XML){await reader.cancel();throw Error('Hoja Excel demasiado grande.');}chunks.push(part.value);}}
    catch(error){throw Error(error.message||'No se puede descomprimir el XLSX.');}
    plain=new Uint8Array(size);let off=0;for(const part of chunks){plain.set(part,off);off+=part.length;}
   }else throw Error('El XLSX usa una compresión no compatible. Exporta a CSV.');
   return new TextDecoder('utf-8').decode(plain);
  }
  return {read,paths:[...entries.keys()]};
 }
 async function parseXlsx(buffer){
  if(typeof DOMParser==='undefined')throw Error('Este navegador no admite XLSX. Exporta la hoja como CSV.');
  const zip=zipEntries(new Uint8Array(buffer));
  let first='xl/worksheets/sheet1.xml';
  const book=await zip.read('xl/workbook.xml'),rels=await zip.read('xl/_rels/workbook.xml.rels');
  if(book&&rels){
   const sheet=firstTag(xmlDoc(book),'sheet'),relId=sheet?.getAttribute('r:id')||sheet?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
   const relDoc=xmlDoc(rels);
   const match=[...relDoc.getElementsByTagNameNS('*','Relationship')].find(x=>x.getAttribute('Id')===relId);
   const target=match?.getAttribute('Target')||'';
   if(target&&!target.startsWith('http')&&!target.includes('..')){
    const path=target.startsWith('/')?target.slice(1):target.startsWith('xl/')?target:'xl/'+target;
    if(zip.paths.includes(path))first=path;
   }
  }
  const source=await zip.read(first);
  if(!source)throw Error('No se encontró la primera hoja del Excel.');
  const sheet=xmlDoc(source),shared=await zip.read('xl/sharedStrings.xml');
  const dictionary=shared?[...xmlDoc(shared).getElementsByTagNameNS('*','si')].map(si=>
   [...si.getElementsByTagNameNS('*','t')].map(t=>t.textContent||'').join('')):[];
  const lines=[],sheetRows=[...sheet.getElementsByTagNameNS('*','row')];
  for(const row of sheetRows){
   const cells=[...row.getElementsByTagNameNS('*','c')],record=[];
   for(const c of cells){
    const ref=c.getAttribute('r')||'',letters=ref.match(/^[A-Z]+/i)?.[0]||'';
    let index=0;for(const ch of letters.toUpperCase())index=index*26+(ch.charCodeAt(0)-64);index--;
    if(index<0||index>90)continue;
    const type=c.getAttribute('t'),v=xmlText(c,type==='inlineStr'?'is':'v');
    let val=type==='s'?(dictionary[Number(v)]||''):type==='inlineStr'?xmlText(c,'is'):v;
    if(type==='inlineStr'){const inline=firstTag(c,'is');val=inline?[...inline.getElementsByTagNameNS('*','t')].map(t=>t.textContent||'').join(''):'';}
    record[index]=val;
   }
   if(record.some(v=>String(v||'').trim()))lines.push(record);
   if(lines.length>MAX_ROWS+1)throw Error('El Excel supera '+MAX_ROWS+' filas de pruebas.');
  }
  return lines;
 }
 function prepare(matrix,existing){
  if(!Array.isArray(matrix)||!matrix.length)throw Error('El archivo está vacío.');
  const map=headerMap(matrix[0]);
  if(map.name===undefined)throw Error('Falta la columna "Nombre" en la primera fila. Descarga la plantilla.');
  const prior=new Set(),activeCodes=new Set(),allNames=new Set();
  for(const x of (Array.isArray(existing)?existing:[])){
   if(x&&x.name)allNames.add(norm(x.name));
   if(x&&(x.code||x.testCode))activeCodes.add(norm(x.code||x.testCode));
  }
  const prepared=[],limited=matrix.slice(1,MAX_ROWS+1);
  limited.forEach((r,i)=>{
   const item={};for(const [key,col] of Object.entries(map))item[key]=clean(r[col]);
   item.name=item.name||'';
   const code=norm(item.code),name=norm(item.name);
   let status='new',reason='';
   if(!name){status='invalid';reason='Falta nombre';}
   else if(item.name.length>180){status='invalid';reason='Nombre demasiado largo';}
   else if(code&&activeCodes.has(code)){status='duplicate';reason='Código ya registrado';}
   else if(allNames.has(name)){status='duplicate';reason='Nombre ya registrado';}
   else if(prior.has('name:'+name)||(code&&prior.has('code:'+code))){status='duplicate';reason='Repetida dentro del archivo';}
   if(status==='new'){prior.add('name:'+name);if(code)prior.add('code:'+code);}
   prepared.push({line:i+2,item,status,reason});
  });
  return prepared;
 }
 function makeCatalogRecord(item,id,now){
  return {id,name:item.name,code:item.code||'',sample:item.sample||'',vessel:item.vessel||'',
   volume:item.volume||'',method:item.method||'',fasting:item.fasting||'',
   conditions:item.conditions||'',instructions:item.instructions||'',
   // No inventar un tubo verde cuando el archivo no incluye color/recipiente.
   color:'#94A3B8',colorName:item.colorName||'',shape:['tube','jar'].includes(String(item.shape||'').trim().toLowerCase())?String(item.shape).trim().toLowerCase():'',validated:false,active:true,
   createdAt:now,updatedAt:now};
 }
 return {MAX_FILE,MAX_ROWS,norm,parseDelimited,parseXlsx,prepare,makeCatalogRecord,headerMap};
});
