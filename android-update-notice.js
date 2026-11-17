/* Avisos de versión Android: no instala APK ni modifica datos clínicos. */
(function(){
 'use strict';
 if(!window.Capacitor?.isNativePlatform?.())return;
 const plugin=window.Capacitor?.Plugins?.FleboIdScanner;
 if(!plugin?.scan)return;
 let last=0,working=false,closedVersion=0;
 async function check(){
  if(working||Date.now()-last<6*60*60*1000)return;
  working=true;last=Date.now();
  try{
   const [installed,request]=await Promise.all([
    plugin.getAppVersion?plugin.getAppVersion():Promise.resolve({versionCode:1,versionName:'1.0'}),
    fetch(new URL('./android-update.json',location.href),{cache:'no-store'})
   ]);
   if(!request.ok)throw Error('No se pudo consultar la versión');
   const latest=await request.json();
   const version=Number(latest.versionCode);
   if(!Number.isSafeInteger(version)||version<=Number(installed.versionCode)||version===closedVersion)return;
   if(typeof latest.releasePage!=='string'||!/^https:\/\/github\.com\/delosrios9301-cpu\/Fleboreport\/actions\//.test(latest.releasePage))return;
   if(document.getElementById('frAndroidUpdateNotice'))return;
   const box=document.createElement('section');box.id='frAndroidUpdateNotice';
   box.setAttribute('role','status');
   Object.assign(box.style,{position:'fixed',bottom:'max(16px, env(safe-area-inset-bottom))',left:'12px',right:'12px',zIndex:'2147483600',background:'#f5faf8',color:'#163b36',border:'1px solid #8eb9ad',borderRadius:'14px',padding:'14px',boxShadow:'0 8px 32px #0004',fontFamily:'system-ui,sans-serif'});
   const heading=document.createElement('strong');heading.textContent='Actualización Android disponible · '+String(latest.versionName||version);
   const desc=document.createElement('p');desc.textContent='Hay una versión nueva del APK. Los cambios web se actualizan al abrir FleboReport; para actualizar el escáner nativo debes instalar el APK nuevo.';desc.style.margin='8px 0';
   const link=document.createElement('a');link.href=latest.releasePage;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Ver nueva versión en GitHub';link.style.marginRight='16px';
   const close=document.createElement('button');close.type='button';close.textContent='Más tarde';close.onclick=()=>{closedVersion=version;box.remove();};
   box.append(heading,desc,link,close);document.body.appendChild(box);
  }catch(_){/* Sin red o versión no disponible: no bloquear la aplicación. */}
  finally{working=false;}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',check);else check();
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
})();
