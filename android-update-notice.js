/* Actualizaciones Android: detecta SOLO APK firmados publicados; nunca instala sin autorización. */
(function(){
 'use strict';
 if(!window.Capacitor?.isNativePlatform?.())return;
 const plugin=window.Capacitor?.Plugins?.FleboIdScanner;
 if(!plugin?.getAppVersion)return;
 const repoUrl='https://github.com/delosrios9301-cpu/Fleboreport';
 const api='https://api.github.com/repos/delosrios9301-cpu/Fleboreport/releases?per_page=30';
 let last=0,working=false,closedVersion='';
 const parts=v=>/^[0-9]+\.[0-9]+(?:\.[0-9]+)?$/.test(String(v||''))?String(v).split('.').map(Number):null;
 function isNewer(a,b){
  const x=parts(a),y=parts(b);
  if(!x||!y)return false;
  for(let i=0;i<3;i++){const n=(x[i]||0)-(y[i]||0);if(n)return n>0;}
  return false;
 }
 function validatedAsset(v,url){
  if(!parts(v))return false;
  return url===repoUrl+'/releases/download/android-v'+v+'/FleboReport-'+v+'.apk';
 }
 async function fromPublishedReleases(){
  const response=await fetch(api,{cache:'no-store',headers:{Accept:'application/vnd.github+json'}});
  if(!response.ok)throw Error('GitHub Releases no disponible');
  const releases=await response.json();
  if(!Array.isArray(releases))throw Error('Respuesta inválida de Releases');
  const available=[];
  for(const release of releases){
   if(release.draft||release.prerelease)continue;
   const match=/^android-v([0-9]+\.[0-9]+(?:\.[0-9]+)?)$/.exec(String(release.tag_name||''));
   if(!match)continue;
   const versionName=match[1];
   const asset=(release.assets||[]).find(item=>item.name==='FleboReport-'+versionName+'.apk'
      && validatedAsset(versionName,item.browser_download_url));
   if(asset)available.push({versionName,apkUrl:asset.browser_download_url});
  }
  available.sort((a,b)=>isNewer(a.versionName,b.versionName)?-1:isNewer(b.versionName,a.versionName)?1:0);
  return available[0]||null;
 }
 async function fromStaticManifest(){
  const request=await fetch(new URL('./android-update.json',location.href),{cache:'no-store'});
  if(!request.ok)return null;
  const latest=await request.json();
  if(!validatedAsset(latest.versionName,latest.apkUrl))return null;
  return {versionName:String(latest.versionName),apkUrl:latest.apkUrl,versionCode:Number(latest.versionCode)};
 }
 async function check(){
  if(working||Date.now()-last<6*60*60*1000)return;
  working=true;last=Date.now();
  try{
   const installed=await plugin.getAppVersion();
   let latest=null;
   try{latest=await fromPublishedReleases();}catch(_){/* Si API no responde, usar manifest. */}
   if(!latest)latest=await fromStaticManifest();
   if(!latest||!isNewer(latest.versionName,installed.versionName)||latest.versionName===closedVersion)return;
   if(!validatedAsset(latest.versionName,latest.apkUrl))return;
   if(document.getElementById('frAndroidUpdateNotice'))return;
   const box=document.createElement('section');box.id='frAndroidUpdateNotice';
   box.setAttribute('role','status');
   Object.assign(box.style,{position:'fixed',bottom:'max(16px, env(safe-area-inset-bottom))',left:'12px',right:'12px',zIndex:'2147483600',background:'#f5faf8',color:'#163b36',border:'1px solid #8eb9ad',borderRadius:'14px',padding:'14px',boxShadow:'0 8px 32px #0004',fontFamily:'system-ui,sans-serif'});
   const heading=document.createElement('strong');heading.textContent='Actualización Android disponible · '+latest.versionName;
   const desc=document.createElement('p');
   desc.textContent='FleboReport Android tiene una versión firmada nueva. Descarga el APK y confirma la instalación sobre la versión actual; no es necesario desinstalar.';
   desc.style.margin='8px 0';
   const link=document.createElement('a');link.href=latest.apkUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Descargar actualización';link.style.marginRight='16px';
   const close=document.createElement('button');close.type='button';close.textContent='Más tarde';close.onclick=()=>{closedVersion=latest.versionName;box.remove();};
   box.append(heading,desc,link,close);document.body.appendChild(box);
  }catch(_){/* Sin red o sin versión publicada: no bloquear la aplicación. */}
  finally{working=false;}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',check);else check();
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
})();
