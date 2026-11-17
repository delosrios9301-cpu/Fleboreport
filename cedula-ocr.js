/* FleboReport: lectura local y voluntaria de cédula. No persiste fotografías ni guarda pacientes. */
(function(){
'use strict';
const targets=[
 {anchor:'journeyPatientName',fields:{name:'journeyPatientName',last:'journeyPatientLastName',doc:'journeyPatientId',birth:'journeyPatientBirth',sex:'journeyPatientSex'}},
 {anchor:'hvName',fields:{name:'hvName',doc:'hvDoc',birth:'hvBirthDate',sex:'hvSex'}},
 {anchor:'indPatientName',fields:{name:'indPatientName',doc:'indPatientDocument',birth:'indPatientBirth',sex:'indPatientSex'}}
];
const $=id=>document.getElementById(id);
let current=null,processing=false;
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
 function named(re){let i=upper.findIndex(x=>re.test(x));if(i<0)return '';let v=upper[i].replace(re,'').replace(/^[\s:.-]+/,'');if(!v||/^(S|ES|COMPLETO)$/.test(v))v=upper[i+1]||'';return /^[A-ZÑ ]{3,}$/.test(v)&&!/REPUBLICA|PANAMA|CEDULA|IDENTIDAD|PERSONAL|NACIMIENTO/.test(v)?norm(v):'';}
 const name=named(/^(?:NOMBRES?|GIVEN NAMES?)\s*:?\s*/);
 const last=named(/^(?:APELLIDOS?|SURNAMES?)\s*:?\s*/);
 const sex=/\b(?:SEXO|SEX)\s*:?\s*(?:F|FEMENINO|MUJER)\b/.test(text)?'Femenino':/\b(?:SEXO|SEX)\s*:?\s*(?:M|MASCULINO|HOMBRE)\b/.test(text)?'Masculino':'';
 return {doc,name,last,birth,sex};
}
function build(){
 if($('frIdScanModal'))return;
 const style=document.createElement('style');style.textContent='.fr-idscan-btn{margin:8px 0 12px!important;min-height:44px!important}.fr-idscan-modal[hidden]{display:none!important}.fr-idscan-modal{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(10,25,36,.66)}.fr-idscan-card{box-sizing:border-box;width:min(100%,520px);max-height:calc(100dvh - 28px);overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;background:#fff;color:#17323c;border-radius:17px;padding:18px;box-shadow:0 20px 65px #0005}.fr-idscan-card label{display:block;margin:9px 0 4px;font-weight:700}.fr-idscan-card input{box-sizing:border-box;width:100%;min-height:40px;padding:8px}.fr-idscan-actions{position:sticky;bottom:-18px;background:white;display:flex;gap:8px;flex-wrap:wrap;padding:12px 0}.fr-idscan-actions button{flex:1;min-height:44px}.fr-idscan-card p{line-height:1.45}';document.head.appendChild(style);
 const modal=document.createElement('div');modal.id='frIdScanModal';modal.className='fr-idscan-modal';modal.hidden=true;
 modal.innerHTML='<section class="fr-idscan-card" role="dialog" aria-modal="true" aria-labelledby="frIdScanTitle"><h2 id="frIdScanTitle">Escanear cédula</h2><p>La fotografía se analiza en este dispositivo. Revisa los datos antes de completar el formulario; no se guarda automáticamente.</p><input id="frIdScanFile" type="file" accept="image/*" capture="environment" aria-label="Tomar foto o seleccionar imagen"><p id="frIdScanStatus" role="status" aria-live="polite">Selecciona una fotografía nítida de la cédula.</p><div id="frIdScanFields" hidden><label>Número de cédula<input id="frIdScanDoc"></label><label>Nombres<input id="frIdScanName"></label><label>Apellidos<input id="frIdScanLast"></label><label>Fecha de nacimiento<input id="frIdScanBirth" type="date"></label><label>Sexo<select id="frIdScanSex"><option value="">Sin reconocer</option><option>Femenino</option><option>Masculino</option></select></label></div><div class="fr-idscan-actions"><button type="button" id="frIdScanCancel">Cancelar</button><button type="button" id="frIdScanApply" disabled>Rellenar formulario</button></div></section>';
 document.body.appendChild(modal);
 $('frIdScanCancel').onclick=()=>{if(!processing){modal.hidden=true;current=null;$('frIdScanFile').value='';}};
 $('frIdScanFile').onchange=async e=>{
  const file=e.target.files?.[0];if(!file)return;
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
  finally{processing=false;$('frIdScanFile').value='';}
 };
 $('frIdScanApply').onclick=()=>{
  if(!current)return;
  const data={doc:$('frIdScanDoc').value.trim(),name:$('frIdScanName').value.trim(),last:$('frIdScanLast').value.trim(),birth:$('frIdScanBirth').value,sex:$('frIdScanSex').value};
  const f=current.fields;
  const set=(id,value)=>{const el=$(id);if(el&&value){el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}};
  set(f.doc,data.doc);set(f.birth,data.birth);set(f.sex,data.sex);
  if(f.last){set(f.name,data.name);set(f.last,data.last);}else set(f.name,[data.name,data.last].filter(Boolean).join(' '));
  modal.hidden=true;current=null;$('frIdScanFields').hidden=true;
  if(window.toast)window.toast('Datos rellenados. Verifica antes de guardar.');
 };
}
function attach(){
 for(const target of targets){
  const anchor=$(target.anchor);if(!anchor||document.querySelector('[data-idscan-for="'+target.anchor+'"]'))continue;
  const host=anchor.closest('.field')||anchor.parentElement;if(!host)continue;
  const btn=document.createElement('button');btn.type='button';btn.className='btn fr-idscan-btn';btn.dataset.idscanFor=target.anchor;btn.textContent='▣ Escanear cédula';btn.onclick=()=>{build();current=target;$('frIdScanModal').hidden=false;$('frIdScanFields').hidden=true;$('frIdScanApply').disabled=true;$('frIdScanStatus').textContent='Selecciona una fotografía nítida de la cédula.';};host.insertAdjacentElement('afterend',btn);
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach);else attach();
new MutationObserver(()=>attach()).observe(document.documentElement,{childList:true,subtree:true});
})();
