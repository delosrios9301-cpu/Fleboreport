/* FleboReport: lectura local y voluntaria de cédula. No persiste fotografías ni guarda pacientes. */
(function(){
'use strict';
const targets=[
 {anchor:'journeyPatientName',fields:{name:'journeyPatientName',last:'journeyPatientLastName',doc:'journeyPatientId',birth:'journeyPatientBirth',sex:'journeyPatientSex'}},
 {anchor:'hvName',fields:{name:'hvName',doc:'hvDoc',birth:'hvBirthDate',sex:'hvSex'}},
 {anchor:'indPatientName',fields:{name:'indPatientName',doc:'indPatientDocument',birth:'indPatientBirth',sex:'indPatientSex'}}
];
const $=id=>document.getElementById(id);
let current=null,processing=false,cameraStream=null,autoTimer=null,autoSamples=0,autoPrevious=null,autoStarted=0,autoBusy=false;
function stopCamera(){if(autoTimer){clearInterval(autoTimer);autoTimer=null;}autoSamples=0;autoPrevious=null;autoStarted=0;autoBusy=false;if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null;}const video=$('frIdScanVideo');if(video){video.pause();video.srcObject=null;video.hidden=true;}if($('frIdScanSnap'))$('frIdScanSnap').hidden=true;}
async function startCamera(){
 const video=$('frIdScanVideo');
 if(!navigator.mediaDevices?.getUserMedia){$('frIdScanStatus').textContent='Este navegador no permite cámara directa. Usa Tomar foto o Galería.';$('frIdScanFile').click();return;}
 try{stopCamera();cameraStream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'}}});video.srcObject=cameraStream;video.hidden=false;await video.play();$('frIdScanSnap').hidden=false;$('frIdScanStatus').textContent='Coloca la cédula dentro de la cámara y mantén el teléfono quieto. La captura será automática cuando la imagen esté estable.';beginAutoCapture();}
 catch(err){stopCamera();$('frIdScanStatus').textContent='No se pudo abrir la cámara ('+(err.name||'permiso')+'). Permite el acceso o usa Galería.';}
}

function beginAutoCapture(){
 const video=$('frIdScanVideo');
 const sample=document.createElement('canvas');sample.width=96;sample.height=64;
 const ctx=sample.getContext('2d',{willReadFrequently:true});
 if(!ctx){$('frIdScanStatus').textContent='Captura automática no disponible. Usa Capturar foto.';return;}
 autoSamples=0;autoPrevious=null;autoStarted=Date.now();
 autoTimer=setInterval(()=>{
  if(!cameraStream||processing||!video||video.readyState<2||!video.videoWidth)return;
  ctx.drawImage(video,0,0,96,64);
  const rgba=ctx.getImageData(0,0,96,64).data;
  const grey=new Uint8Array(96*64);let total=0,edge=0;
  for(let i=0;i<grey.length;i++){grey[i]=(rgba[i*4]*77+rgba[i*4+1]*150+rgba[i*4+2]*29)>>8;total+=grey[i];}
  for(let y=1;y<63;y+=2)for(let x=1;x<95;x+=2){const p=y*96+x;edge+=Math.abs(grey[p]-grey[p-1])+Math.abs(grey[p]-grey[p-96]);}
  let motion=0;if(autoPrevious){for(let i=0;i<grey.length;i+=11)motion+=Math.abs(grey[i]-autoPrevious[i]);motion/=Math.ceil(grey.length/11);}
  const hasPrevious=!!autoPrevious;autoPrevious=grey;
  const light=total/grey.length,sharp=edge/1488;
  if(hasPrevious&&motion<18&&light>35&&light<235&&sharp>7)autoSamples++;else autoSamples=0;
  const elapsed=Date.now()-autoStarted;
  if(autoSamples>=3){
   clearInterval(autoTimer);autoTimer=null;
   $('frIdScanStatus').textContent='Captura automática realizada. Analizando fotografía…';
   $('frIdScanSnap').click();
  }else if(elapsed>9000){
   clearInterval(autoTimer);autoTimer=null;
   $('frIdScanStatus').textContent='No se pudo garantizar una imagen nítida. Ajusta la cédula y pulsa Capturar foto o reintenta. No se tomará una fotografía borrosa automáticamente.';
  }else $('frIdScanStatus').textContent='Enfoca la cédula y mantenla quieta. Captura automática en cuanto la imagen sea estable.';
 },550);
}

const norm=s=>String(s||'').replace(/\s+/g,' ').trim();
function extract(raw){
 const lines=String(raw||'').split(/[\r\n]+/).map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean);
 const normalize=s=>String(s||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const upper=lines.map(normalize),text=upper.join(' ');
 const header=upper.findIndex(s=>/TRIBUNAL\s+ELECTORAL/.test(s));
 const firstField=upper.findIndex(s=>/NOMBRE\s+USUAL|FECHA\s+(?:DE\s+)?NACIMIENTO|LUGAR\s+(?:DE\s+)?NACIMIENTO|\bSEXO\b/.test(s));
 const invalid=/\b(REPUBLICA|PANAMA|TRIBUNAL|ELECTORAL|NOMBRE|USUAL|CEDULA|IDENTIDAD|PERSONAL|FECHA|NACIMIENTO|SEXO|SANGRE|LUGAR|EXPEDIDA|EXPIRA|FIRMA|DOCUMENTO|NACIONALIDAD|REGISTRO|TIPO|CONTROL|EMISION|VENCE|VENCIMIENTO)\b/;
 const candidate=s=>/^[A-ZÑ][A-ZÑ' -]{2,65}$/.test(s)&&!invalid.test(s)&&!/[0-9]/.test(s);
 // A veces ML Kit divide TRIBUNAL ELECTORAL en dos líneas; localizar el bloque
 // por sus rótulos sin asumir que cada nombre ocupa una posición fija.
 const top=header>=0?header+1:upper.findIndex(s=>/ELECTORAL/.test(s))+1;
 const end=firstField>top?firstField:Math.min(upper.length,top+7);
 const area=top>0?upper.slice(top,end):[];
 const clean=s=>s.replace(/^[^A-ZÑ]+/,'').replace(/[^A-ZÑ' -]+$/,'').trim();
 const nameLines=area.map(clean).filter(candidate);
 let name='',last='';
 if(nameLines.length>=2){name=nameLines[0];last=nameLines[1];}
 const labeled=re=>{
  for(let i=0;i<upper.length;i++){
   const m=upper[i].match(re);if(!m)continue;
   const value=clean(upper[i].slice(m.index+m[0].length));
   if(candidate(value))return value;
   const next=clean(upper[i+1]||'');
   if(candidate(next))return next;
  }
  return '';
 };
 if(!name)name=labeled(/\b(?:NOMBRES|GIVEN\s+NAMES?)\s*[:.-]?/);
 if(!last)last=labeled(/\b(?:APELLIDOS?|SURNAMES?)\s*[:.-]?/);
 const idMatches=[...text.matchAll(/\b((?:PE|E|N|AV|\d{1,2})\s*[-–]\s*\d{1,5}\s*[-–]\s*\d{1,6})\b/g)];
 const doc=idMatches.map(m=>m[1].replace(/\s+/g,'').replace(/–/g,'-')).find(v=>!/^0-/.test(v))||'';
 const months={ENE:1,FEB:2,MAR:3,ABR:4,MAY:5,JUN:6,JUL:7,AGO:8,SEP:9,SET:9,OCT:10,NOV:11,DIC:12,DEC:12,JAN:1,APR:4,AUG:8};
 const datePattern=/(\d{1,2})\s*[-/.]\s*(\d{1,2}|[A-Z]{3,10})\s*[-/.]\s*((?:19|20)\d{2})/;
 const birthRow=upper.findIndex(s=>/FECHA\s+(?:DE\s+)?NACIMIENTO|BIRTH\s+DATE/.test(s));
 let dateMatch=birthRow>=0?(upper[birthRow].match(datePattern)||(upper[birthRow+1]||'').match(datePattern)):null;
 let birth='';
 if(dateMatch){
  const day=Number(dateMatch[1]),token=dateMatch[2],month=/^\d+$/.test(token)?Number(token):months[token.slice(0,3)],year=Number(dateMatch[3]);
  if(month>=1&&month<=12){const d=new Date(Date.UTC(year,month-1,day));if(d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day)birth=year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');}
 }
 const sexMatch=text.match(/\bSEXO\s*[:.]?\s*(MASCULINO|FEMENINO|M|F)\b/);
 const sex=sexMatch?(/^(M|MASCULINO)$/.test(sexMatch[1])?'Masculino':'Femenino'):'';
 return {doc,name,last,birth,sex};
}
// Formato delimitado del QR de la cédula; no registrar el contenido bruto.
function extractQr(raw){
 const parts=String(raw||'').split(/[|;\r\n]+/).map(v=>v.trim()).filter(Boolean);
 if(parts.length<5)throw Error('El QR fue leído correctamente, pero su estructura no coincide con los datos esperados. No se transfirió información.');
 const doc=parts[0].replace(/\s+/g,'');
 if(!/^(?:PE|E|N|AV|\d{1,2})-\d{1,5}-\d{1,6}$/i.test(doc))throw Error('El QR fue leído, pero no se pudo validar el número de cédula. Revisa el documento.');
 const name=parts[1]||'',last=parts[2]||'';
 // El QR delimitado de cédula contiene nombres sin etiquetas; cualquier
 // «NOMBRES: ...» se procesa con el lector de campos etiquetados.
 const person=value=>/^[\p{L}][\p{L}\p{M}\s.'-]{1,74}$/u.test(value);
 if(!person(name)||!person(last))
  throw Error('El QR no tiene el formato delimitado de cédula; revisar etiquetas.');
 const sexToken=parts.slice(3,7).find(x=>/^(M|F)$/i.test(x))||'';
 const sex=sexToken.toUpperCase()==='M'?'Masculino':sexToken.toUpperCase()==='F'?'Femenino':'';
 // Fecha de nacimiento: primera fecha posterior al sexo. Las posteriores
 // corresponden a otros datos del documento y no deben usarse como nacimiento.
 const sexIndex=parts.findIndex((x,i)=>i>=3&&/^(M|F)$/i.test(x));
 const dates=parts.slice(sexIndex>=0?sexIndex+1:3).filter(x=>/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(x));
 let birth='';
 if(dates.length){
  const [day,month,year]=dates[0].split(/[-/]/).map(Number);
  const date=new Date(Date.UTC(year,month-1,day));
  if(year>=1900&&year<=new Date().getUTCFullYear()&&date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day)
   birth=year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
 }
 return {doc,name,last,birth,sex};
}

// Acepta datos personales legibles de una licencia física, pero nunca intenta
// desencriptar un QR reservado a autoridades ni interpreta un número de control
// de licencia como una cédula. No conserva ni comunica el QR completo.
function extractIdentityQr(raw){
 const source=String(raw||'').trim();
 if(!source||source.length>16384)throw Error('El código QR está vacío o tiene un tamaño no compatible.');
 try{return extractQr(source);}catch(_){}
 const canonical=key=>String(key||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]/g,'');
 const fields={};
 const set=(key,value)=>{
  const k=canonical(key),v=String(value==null?'':value).trim();
  if(!k||!v||v.length>180||fields[k])return;
  fields[k]=v;
 };
 const flatten=(record,depth=0)=>{
  if(!record||typeof record!=='object'||Array.isArray(record)||depth>2)return;
  for(const [key,value] of Object.entries(record)){
   if(value&&typeof value==='object')flatten(value,depth+1);
   else if(typeof value==='string'||typeof value==='number')set(key,value);
  }
 };
 // JSON legible, campos con etiqueta o parámetros de URL. No abrir enlaces.
 if(source.startsWith('{')){
  try{flatten(JSON.parse(source));}catch(_){}
 }
 if(/^https?:\/\//i.test(source)){
  // Se decodifican parámetros de texto sin navegar a ninguna URL.
  const query=source.includes('?')?source.split('?')[1].split('#')[0]:'';
  for(const pair of query.split('&')){
   const pos=pair.indexOf('=');
   if(pos<0)continue;
   try{set(decodeURIComponent(pair.slice(0,pos)),decodeURIComponent(pair.slice(pos+1).replace(/\+/g,' ')));}
   catch(_){}
  }
 }else{
  for(const field of source.split(/[\r\n|;&]+/)){
   const m=field.match(/^\s*([^:=]{2,50})\s*[:=]\s*(.+?)\s*$/);
   if(m)set(m[1],m[2]);
  }
 }
 const pick=(names)=>{
  for(const key of names){const value=fields[canonical(key)];if(value)return value}
  return '';
 };
 const namedDoc=pick(['cedula','ncedula','numerocedula','numerodecedula',
  'cedulaidentidad','documentoidentidad','numerodocumentoidentidad',
  'identificacion','numeroidentificacion','documentnumber','identificationnumber']);
 // Algunos QR mixtos comienzan por la cédula y luego usan etiquetas para
 // los campos restantes. Solo se admite con nombres explícitos etiquetados.
 const firstToken=source.split(/[|;\r\n]/)[0].trim();
 const fallbackDoc=(fields.nombres||fields.apellidos||fields.nombre||fields.apellido)
  &&/^(?:PE|E|N|AV|\d{1,2})-\d{1,5}-\d{1,6}$/i.test(firstToken)?firstToken:'';
 const doc=String(namedDoc||fallbackDoc).toUpperCase().replace(/[\u2013\u2014]/g,'-')
  .replace(/\s*-\s*/g,'-').trim();
 const docValid=/^(?:PE|E|N|AV|\d{1,2})-\d{1,5}-\d{1,6}$/i.test(doc);
 const cleanPerson=value=>{
  const trimmed=String(value||'').replace(/\s+/g,' ').trim();
  return trimmed.length<=75&&/^[\p{L}][\p{L}\p{M}\s.'-]{1,74}$/u.test(trimmed)
   ?trimmed.toUpperCase():'';
 };
 const name=cleanPerson(pick(['nombres','nombre','primernombre','givennames','givenname','firstnames','firstname']));
 const last=cleanPerson(pick(['apellidos','apellido','primerapellido','surnames','surname','lastname','lastnames']));
 const sexRaw=canonical(pick(['sexo','sex','genero','gender']));
 const sex=/^(masculino|hombre|male|m)$/.test(sexRaw)?'Masculino'
  :/^(femenino|mujer|female|f)$/.test(sexRaw)?'Femenino':'';
 const rawBirth=pick(['fechanacimiento','fechadenacimiento','nacimiento','birthdate','dateofbirth','dob']);
 const parseBirth=value=>{
  const clean=String(value||'').trim(),iso=clean.match(/^((?:19|20)\d{2})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  const local=clean.match(/^(\d{1,2})[-/.](\d{1,2})[-/.]((?:19|20)\d{2})$/);
  if(!iso&&!local)return '';
  const year=Number(iso?iso[1]:local[3]),month=Number(iso?iso[2]:local[2]),day=Number(iso?iso[3]:local[1]);
  const d=new Date(Date.UTC(year,month-1,day));
  return year>=1900&&year<=new Date().getUTCFullYear()&&d.getUTCFullYear()===year
   &&d.getUTCMonth()===month-1&&d.getUTCDate()===day
   ?year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0'):'';
 };
 const birth=parseBirth(rawBirth);
 if(!docValid){
  throw Error('El QR no proporciona una cédula verificable. Algunas licencias incluyen códigos protegidos o solo un enlace de validación. Utiliza el QR legible del documento o registra los datos manualmente.');
 }
 if(!name&&!last&&!birth&&!sex)
  throw Error('El QR contiene un número de documento, pero no datos personales suficientes para rellenar el paciente. Revisa la licencia o introduce los datos manualmente.');
 return {doc,name,last,birth,sex};
}
// El puente nativo se activa solo cuando la app Android registra el plugin.
async function recognizeNative(){
 const plugin=window.Capacitor?.Plugins?.FleboIdScanner;
 if(!plugin?.scan)throw Error('El escáner nativo no está instalado en esta versión Android.');
 const response=await plugin.scan();
 if(!response||response.cancelled)return null;
 const raw=String(response.qr||'').trim();
 if(!raw)throw Error('El escáner terminó sin devolver información del QR.');
 return extractIdentityQr(raw);
}
// Permite reintentar otro QR de la licencia sin cerrar el formulario.
async function readNativeFromModal(target,modal){
 if(processing)return;
 processing=true;
 try{
  $('frIdScanStatus').textContent='Abriendo escáner Android…';
  const found=await recognizeNative();
  if(!found){$('frIdScanStatus').textContent='Escaneo cancelado. Puedes volver a intentarlo.';return;}
  for(const [key,value] of Object.entries(found)){
   const input=$('frIdScan'+({doc:'Doc',name:'Name',last:'Last',birth:'Birth',sex:'Sex'}[key]));
   if(input)input.value=value;
  }
  $('frIdScanFields').hidden=false;$('frIdScanApply').disabled=false;
  // No se guarda ningún paciente al escanear: solo se trasladan datos
  // completos si no existe otra cédula ya introducida en el formulario.
  const existingDoc=$(target.fields.doc)?.value?.trim()||'';
  const complete=[found.doc,found.name,found.last,found.birth,found.sex].every(Boolean);
  if(complete&&(!existingDoc||existingDoc===found.doc)){
   $('frIdScanApply').click();
   if(!modal.hidden)$('frIdScanStatus').textContent='Datos leídos. Revisa los campos que no se pudieron transferir.';
  }else{
   $('frIdScanStatus').textContent=existingDoc&&existingDoc!==found.doc
    ?'El formulario contiene otra cédula. Revisa antes de reemplazar sus datos.'
    :'QR detectado. Revisa los campos reconocidos o vuelve a escanear el QR público de la licencia.';
  }
 }catch(error){
  $('frIdScanStatus').textContent='No fue posible leer los datos personales: '
   +(error?.message||'QR no compatible')+' Puedes reintentar otro QR o introducirlos manualmente.';
 }finally{processing=false;}
}
function build(){
 if($('frIdScanModal'))return;
 const style=document.createElement('style');style.textContent='.fr-idscan-btn{margin:8px 0 12px!important;min-height:44px!important}.fr-idscan-modal[hidden]{display:none!important}.fr-idscan-modal{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(10,25,36,.66)}.fr-idscan-card{box-sizing:border-box;width:min(100%,520px);max-height:calc(100dvh - 28px);overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;background:#fff;color:#17323c;border-radius:17px;padding:18px;box-shadow:0 20px 65px #0005}.fr-idscan-card label{display:block;margin:9px 0 4px;font-weight:700}.fr-idscan-card input{box-sizing:border-box;width:100%;min-height:40px;padding:8px}.fr-idscan-actions{position:sticky;bottom:-18px;background:white;display:flex;gap:8px;flex-wrap:wrap;padding:12px 0}.fr-idscan-actions button{flex:1;min-height:44px}.fr-idscan-card p{line-height:1.45}';document.head.appendChild(style);
 const modal=document.createElement('div');modal.id='frIdScanModal';modal.className='fr-idscan-modal';modal.hidden=true;
 modal.innerHTML='<section class="fr-idscan-card" role="dialog" aria-modal="true" aria-labelledby="frIdScanTitle"><h2 id="frIdScanTitle">Escanear cédula o licencia</h2><p>La fotografía se analiza en este dispositivo. Revisa los datos antes de completar el formulario; no se guarda automáticamente.</p><div class="fr-idscan-actions"><button type="button" id="frIdScanCamera">Abrir cámara</button><button type="button" id="frIdScanGallery">Galería</button></div><video id="frIdScanVideo" autoplay playsinline muted hidden style="width:100%;max-height:46dvh;object-fit:contain;background:#111;border-radius:10px"></video><button type="button" id="frIdScanSnap" hidden>Capturar foto</button><input id="frIdScanFile" type="file" accept="image/*" capture="environment" hidden><input id="frIdScanGalleryFile" type="file" accept="image/*" hidden><p id="frIdScanStatus" role="status" aria-live="polite">Selecciona una fotografía nítida de la cédula.</p><div id="frIdScanFields" hidden><label>Número de cédula<input id="frIdScanDoc"></label><label>Nombres<input id="frIdScanName"></label><label>Apellidos<input id="frIdScanLast"></label><label>Fecha de nacimiento<input id="frIdScanBirth" type="date"></label><label>Sexo<select id="frIdScanSex"><option value="">Sin reconocer</option><option>Femenino</option><option>Masculino</option></select></label></div><div class="fr-idscan-actions"><button type="button" id="frIdScanCancel">Cancelar</button><button type="button" id="frIdScanApply" disabled>Rellenar formulario</button></div></section>';
 document.body.appendChild(modal);
 if(!window.Capacitor?.isNativePlatform?.())$('frIdScanTitle').textContent='Escanear cédula';
 // En Android el lector nativo usa vídeo continuo; no mostrar opciones de foto/OCR.
 if(window.Capacitor?.isNativePlatform?.()&&window.Capacitor?.Plugins?.FleboIdScanner?.scan){
  modal.querySelector('p').textContent='Apunta al QR legible de la cédula o licencia. La cámara se cierra al detectarlo y no guarda fotografías. Los QR protegidos no permiten extraer datos personales. Comprueba los datos antes de guardar.';
  $('frIdScanGallery').hidden=true;
  $('frIdScanCamera').textContent='Volver a escanear QR';
  $('frIdScanSnap').hidden=true;
 }

 $('frIdScanCancel').onclick=()=>{if(!processing){stopCamera();modal.hidden=true;current=null;$('frIdScanFile').value='';$('frIdScanGalleryFile').value='';}};
 $('frIdScanCamera').onclick=()=>{
  if(window.Capacitor?.isNativePlatform?.()&&window.Capacitor?.Plugins?.FleboIdScanner?.scan){if(current)void readNativeFromModal(current,modal);}
  else void startCamera();
 };
 $('frIdScanGallery').onclick=()=>{$('frIdScanGalleryFile').click();};
 $('frIdScanSnap').onclick=async()=>{const video=$('frIdScanVideo');if(!video.videoWidth)return;const canvas=document.createElement('canvas');const scale=Math.min(1,Math.sqrt(2100000/(video.videoWidth*video.videoHeight)));canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);stopCamera();const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));canvas.width=0;canvas.height=0;if(blob)await processFile(blob);};
 $('frIdScanFile').onchange=e=>{const file=e.target.files?.[0];if(file)processFile(file);};
 $('frIdScanGalleryFile').onchange=e=>{const file=e.target.files?.[0];if(file)processFile(file);};
 async function processFile(file){
  if(!file.type.startsWith('image/')){$('frIdScanStatus').textContent='Selecciona una imagen de la cédula.';return;}
  stopCamera();processing=true;$('frIdScanApply').disabled=true;$('frIdScanFields').hidden=true;$('frIdScanStatus').textContent='Reconociendo texto de la fotografía…';
  try{
   if(!window.FleboHomeOrderOCR?.recognizeImage)throw Error('El motor OCR no está disponible. Reabre la aplicación con conexión.');
   const ocr=window.FleboHomeOrderOCR;
   const result=ocr.recognizeIdImage?await ocr.recognizeIdImage(file):{full:(await ocr.recognizeImage(file)).text};
   const found=extract(result.full);
   // Priorizar exclusivamente las dos líneas entre TRIBUNAL ELECTORAL y NOMBRE USUAL
   // del OCR de la tarjeta completa. Los recortes sin bordes detectados pueden
   // incluir rótulos y producir nombres falsos (p. ej. "USUAL A").
   const details=extract(result.details);
   const document=extract(result.document);
   if(!found.name||!found.last){found.name='';found.last='';}
   if(details.birth)found.birth=details.birth;
   if(details.sex)found.sex=details.sex;
   if(document.doc)found.doc=document.doc;
   // No registrar ni mostrar el texto OCR completo: contiene datos sensibles.
   for(const [key,value] of Object.entries(found)){const input=$('frIdScan'+({doc:'Doc',name:'Name',last:'Last',birth:'Birth',sex:'Sex'}[key]));if(input)input.value=value;}
   $('frIdScanFields').hidden=false;
   $('frIdScanStatus').textContent=Object.values(found).some(Boolean)?'Revisa y corrige los datos detectados. Los campos vacíos no se pudieron reconocer.':'No se identificaron datos fiables. Prueba otra foto o completa los campos manualmente.';
   $('frIdScanApply').disabled=false;
  }catch(err){$('frIdScanStatus').textContent='No fue posible leer la imagen: '+(err.message||'error OCR');}
  finally{processing=false;$('frIdScanFile').value='';$('frIdScanGalleryFile').value='';}
 }
 $('frIdScanApply').onclick=()=>{
  if(!current)return;
  const data={doc:$('frIdScanDoc').value.trim(),name:$('frIdScanName').value.trim(),last:$('frIdScanLast').value.trim(),birth:$('frIdScanBirth').value,sex:$('frIdScanSex').value};
  const f=current.fields;
  const set=(id,value)=>{const el=$(id);if(!el||!value)return false;if(el.tagName==='SELECT'&&!Array.from(el.options).some(o=>o.value===value))return false;el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return el.value===value;};
  const required=[f.doc,f.name,f.birth,f.sex].filter(Boolean);
  const missing=required.filter(id=>!$(id));
  if(missing.length){$('frIdScanStatus').textContent='El formulario no contiene los campos: '+missing.join(', ')+'. No se transfirieron datos.';return;}
  const results=[['cédula',f.doc,data.doc],['fecha de nacimiento',f.birth,data.birth],['sexo',f.sex,data.sex]];
  if(f.last){results.push(['nombres',f.name,data.name],['apellidos',f.last,data.last]);}
  else results.push(['nombre completo',f.name,[data.name,data.last].filter(Boolean).join(' ')]);
  const failed=results.filter(([label,id,value])=>id&&value&&!set(id,value)).map(([label])=>label);
  if(failed.length){$('frIdScanStatus').textContent='No se pudieron transferir: '+failed.join(', ')+'. Revisa el formulario.';return;}
  stopCamera();modal.hidden=true;current=null;$('frIdScanFields').hidden=true;
  if(window.toast)window.toast('Datos transferidos al formulario. Verifica antes de guardar.');
 };
}
function attach(){
 for(const target of targets){
  const anchor=$(target.anchor);if(!anchor||document.querySelector('[data-idscan-for="'+target.anchor+'"]'))continue;
  const host=anchor.closest('.field')||anchor.parentElement;if(!host)continue;
  const btn=document.createElement('button');btn.type='button';btn.className='btn fr-idscan-btn';btn.dataset.idscanFor=target.anchor;btn.textContent=window.Capacitor?.isNativePlatform?.()?'▣ Escanear cédula o licencia':'▣ Escanear cédula';btn.onclick=async()=>{
   build();current=target;$('frIdScanModal').hidden=false;$('frIdScanFields').hidden=true;$('frIdScanApply').disabled=true;
   if(window.Capacitor?.isNativePlatform?.()&&window.Capacitor?.Plugins?.FleboIdScanner?.scan){
    await readNativeFromModal(target,$('frIdScanModal'));
   }else{$('frIdScanStatus').textContent='Abriendo cámara…';startCamera();}
  };host.insertAdjacentElement('afterend',btn);
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach);else attach();
new MutationObserver(()=>attach()).observe(document.documentElement,{childList:true,subtree:true});
})();
