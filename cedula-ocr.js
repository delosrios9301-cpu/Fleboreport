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
 const lines=String(raw||'').split(/[\r\n]+/).map(norm).filter(Boolean);
 const upper=lines.map(x=>x.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''));
 const text=upper.join(' ');
 const doc=text.match(/\b(?:PE|E|N|AV|[1-9]|1[0-3])[-\s]?\d{1,5}[-\s]\d{1,6}\b/)?.[0]?.replace(/\s+/g,'-')||'';
 const dates=[...text.matchAll(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](19\d{2}|20\d{2})\b/g)];
 const birthLine=upper.findIndex(x=>/NACIMIENTO|FECHA DE NAC|BIRTH/.test(x));
 let date= birthLine>=0 ? (upper[birthLine].match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](19\d{2}|20\d{2})\b/)||upper[birthLine+1]?.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](19\d{2}|20\d{2})\b/)) : (dates.length===1?dates[0]:null);
 let birth='';
 if(date){const d=+date[1],m=+date[2],y=+date[3];const dt=new Date(Date.UTC(y,m-1,d));if(dt.getUTCDate()===d&&dt.getUTCMonth()===m-1&&dt.getUTCFullYear()===y)birth=y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');}
 const ignore=/REPUBLICA|PANAMA|CEDULA|IDENTIDAD|PERSONAL|NACIMIENTO|NACIONALIDAD|EXPEDICION|VENCIMIENTO|DONANTE|DIRECCION|REGISTRO|TRIBUNAL|ELECTORAL|FECHA|DOCUMENTO|FIRMA|LUGAR|ESTADO|CIVIL|NUMERO|SEXO|NOMBRE|APELLIDO|VALIDA|VALIDO|SANGRE|EMISION|AUTORIDAD/;
 const cleanName=value=>norm(String(value||'').replace(/[^A-ZÁÉÍÓÚÜÑa-záéíóúüñ' -]/g,' ').replace(/\s+/g,' ')).replace(/^[ -]+|[ -]+$/g,'');
 function candidate(value){const v=cleanName(value);return v.length>=3&&v.length<=75&&/^[A-ZÁÉÍÓÚÜÑa-záéíóúüñ' -]+$/.test(v)&&!ignore.test(v.toUpperCase())?v:'';}
 function labeled(re){
  for(let i=0;i<upper.length;i++){
   const m=upper[i].match(re);if(!m)continue;
   const inline=candidate(upper[i].slice(m.index+m[0].length).replace(/^[\s:.-]+/,''));
   if(inline)return inline;
   for(let j=i+1;j<=Math.min(i+2,upper.length-1);j++){const next=candidate(upper[j]);if(next)return next;if(/CEDULA|NACIMIENTO|SEXO|APELLIDO|NOMBRE/.test(upper[j]))break;}
  }
  return '';
 }
 let name=labeled(/\b(?:NOMBRES?|PRIMER\s+NOMBRE|GIVEN\s+NAMES?)\s*[:.-]?/);
 let last=labeled(/\b(?:APELLIDOS?|PRIMER\s+APELLIDO|SURNAMES?|LAST\s+NAME)\s*[:.-]?/);
 // Algunas cédulas imprimen los nombres y apellidos en líneas independientes, sin rótulos.
 // Solo inferir cuando hay dos líneas consecutivas inequívocamente alfabéticas.
 if(!name&&!last){
  const chunks=upper.map(candidate).filter(Boolean);
  if(chunks.length===2){last=chunks[0];name=chunks[1];}
 }
 // Rótulos comunes en dos columnas: NOMBRES y APELLIDOS pueden aparecer juntos antes de los valores.
 if(!name&&!last){
  const labelIndex=upper.findIndex(x=>/\bNOMBRES?\b/.test(x)&&/\bAPELLIDOS?\b/.test(x));
  if(labelIndex>=0){const values=upper.slice(labelIndex+1,labelIndex+4).map(candidate).filter(Boolean);if(values.length===2){name=values[0];last=values[1];}}
 }
 let sex='';
 const explicit=text.match(/\b(?:SEXO|SEX|GENERO|GENDER)\s*[:.-]?\s*(FEMENINO|MASCULINO|MUJER|HOMBRE|F|M)\b/);
 if(explicit)sex=/^(F|FEMENINO|MUJER)$/.test(explicit[1])?'Femenino':'Masculino';
 else if(/\b(?:FEMALE|FEMALE\/F|MUJER)\b/.test(text))sex='Femenino';
 else if(/\b(?:MALE|HOMBRE)\b/.test(text))sex='Masculino';
 else{
  const sexLine=upper.findIndex(x=>/^(?:SEXO|SEX|GENERO|GENDER)\s*[:.-]?$/.test(x));
  if(sexLine>=0){const v=upper[sexLine+1]||'';if(/^(F|FEMENINO|MUJER)$/.test(v))sex='Femenino';if(/^(M|MASCULINO|HOMBRE)$/.test(v))sex='Masculino';}
 }
 return {doc,name,last,birth,sex};
}
function build(){
 if($('frIdScanModal'))return;
 const style=document.createElement('style');style.textContent='.fr-idscan-btn{margin:8px 0 12px!important;min-height:44px!important}.fr-idscan-modal[hidden]{display:none!important}.fr-idscan-modal{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(10,25,36,.66)}.fr-idscan-card{box-sizing:border-box;width:min(100%,520px);max-height:calc(100dvh - 28px);overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;background:#fff;color:#17323c;border-radius:17px;padding:18px;box-shadow:0 20px 65px #0005}.fr-idscan-card label{display:block;margin:9px 0 4px;font-weight:700}.fr-idscan-card input{box-sizing:border-box;width:100%;min-height:40px;padding:8px}.fr-idscan-actions{position:sticky;bottom:-18px;background:white;display:flex;gap:8px;flex-wrap:wrap;padding:12px 0}.fr-idscan-actions button{flex:1;min-height:44px}.fr-idscan-card p{line-height:1.45}';document.head.appendChild(style);
 const modal=document.createElement('div');modal.id='frIdScanModal';modal.className='fr-idscan-modal';modal.hidden=true;
 modal.innerHTML='<section class="fr-idscan-card" role="dialog" aria-modal="true" aria-labelledby="frIdScanTitle"><h2 id="frIdScanTitle">Escanear cédula</h2><p>La fotografía se analiza en este dispositivo. Revisa los datos antes de completar el formulario; no se guarda automáticamente.</p><div class="fr-idscan-actions"><button type="button" id="frIdScanCamera">Abrir cámara</button><button type="button" id="frIdScanGallery">Galería</button></div><video id="frIdScanVideo" autoplay playsinline muted hidden style="width:100%;max-height:46dvh;object-fit:contain;background:#111;border-radius:10px"></video><button type="button" id="frIdScanSnap" hidden>Capturar foto</button><input id="frIdScanFile" type="file" accept="image/*" capture="environment" hidden><input id="frIdScanGalleryFile" type="file" accept="image/*" hidden><p id="frIdScanStatus" role="status" aria-live="polite">Selecciona una fotografía nítida de la cédula.</p><div id="frIdScanFields" hidden><label>Número de cédula<input id="frIdScanDoc"></label><label>Nombres<input id="frIdScanName"></label><label>Apellidos<input id="frIdScanLast"></label><label>Fecha de nacimiento<input id="frIdScanBirth" type="date"></label><label>Sexo<select id="frIdScanSex"><option value="">Sin reconocer</option><option>Femenino</option><option>Masculino</option></select></label></div><div class="fr-idscan-actions"><button type="button" id="frIdScanCancel">Cancelar</button><button type="button" id="frIdScanApply" disabled>Rellenar formulario</button></div></section>';
 document.body.appendChild(modal);
 $('frIdScanCancel').onclick=()=>{if(!processing){stopCamera();modal.hidden=true;current=null;$('frIdScanFile').value='';$('frIdScanGalleryFile').value='';}};
 $('frIdScanCamera').onclick=()=>startCamera();
 $('frIdScanGallery').onclick=()=>{$('frIdScanGalleryFile').click();};
 $('frIdScanSnap').onclick=async()=>{const video=$('frIdScanVideo');if(!video.videoWidth)return;const canvas=document.createElement('canvas');const scale=Math.min(1,Math.sqrt(2100000/(video.videoWidth*video.videoHeight)));canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);stopCamera();const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));canvas.width=0;canvas.height=0;if(blob)await processFile(blob);};
 $('frIdScanFile').onchange=e=>{const file=e.target.files?.[0];if(file)processFile(file);};
 $('frIdScanGalleryFile').onchange=e=>{const file=e.target.files?.[0];if(file)processFile(file);};
 async function processFile(file){
  if(!file.type.startsWith('image/')){$('frIdScanStatus').textContent='Selecciona una imagen de la cédula.';return;}
  processing=true;$('frIdScanApply').disabled=true;$('frIdScanFields').hidden=true;$('frIdScanStatus').textContent='Reconociendo texto de la fotografía…';
  try{
   if(!window.FleboHomeOrderOCR?.recognizeImage)throw Error('El motor OCR no está disponible. Reabre la aplicación con conexión.');
   const result=await window.FleboHomeOrderOCR.recognizeImage(file);
   const found=extract(result.text);
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
  const set=(id,value)=>{const el=$(id);if(el&&value){el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}};
  set(f.doc,data.doc);set(f.birth,data.birth);set(f.sex,data.sex);
  if(f.last){set(f.name,data.name);set(f.last,data.last);}else set(f.name,[data.name,data.last].filter(Boolean).join(' '));
  stopCamera();modal.hidden=true;current=null;$('frIdScanFields').hidden=true;
  if(window.toast)window.toast('Datos rellenados. Verifica antes de guardar.');
 };
}
function attach(){
 for(const target of targets){
  const anchor=$(target.anchor);if(!anchor||document.querySelector('[data-idscan-for="'+target.anchor+'"]'))continue;
  const host=anchor.closest('.field')||anchor.parentElement;if(!host)continue;
  const btn=document.createElement('button');btn.type='button';btn.className='btn fr-idscan-btn';btn.dataset.idscanFor=target.anchor;btn.textContent='▣ Escanear cédula';btn.onclick=()=>{build();current=target;$('frIdScanModal').hidden=false;$('frIdScanFields').hidden=true;$('frIdScanApply').disabled=true;$('frIdScanStatus').textContent='Abriendo cámara…';startCamera();};host.insertAdjacentElement('afterend',btn);
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach);else attach();
new MutationObserver(()=>attach()).observe(document.documentElement,{childList:true,subtree:true});
})();
