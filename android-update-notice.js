/* Actualizaciones Android: detecta SOLO APK firmados publicados; nunca instala sin autorización. */
(function(){
 'use strict';
 // El puente nativo puede estar disponible después de cargar el script; comprobarlo en cada intento.
 const repoUrl='https://github.com/delosrios9301-cpu/Fleboreport';
 const api='https://api.github.com/repos/delosrios9301-cpu/Fleboreport/releases?per_page=30';
 let last=0,working=false,closedVersion='';
 const CHECK_INTERVAL=60*1000; // Reintentos al abrir y regresar a la app, sin esperar seis horas.
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
   if(asset){const shaMatch=/^sha256:([0-9a-f]{64})$/i.exec(String(asset.digest||''));available.push({versionName,apkUrl:asset.browser_download_url,sha256:shaMatch?shaMatch[1]:''});}
  }
  available.sort((a,b)=>isNewer(a.versionName,b.versionName)?-1:isNewer(b.versionName,a.versionName)?1:0);
  return available[0]||null;
 }
 async function fromStaticManifest(){
  // Identificador estable para eludir cualquier manifest 1.2 guardado por el Service Worker anterior.
  const request=await fetch(new URL('./android-update.json?androidUpdates=20261117-v2',location.href),{cache:'no-store'});
  if(!request.ok)return null;
  const latest=await request.json();
  if(!validatedAsset(latest.versionName,latest.apkUrl))return null;
  return {versionName:String(latest.versionName),apkUrl:latest.apkUrl,versionCode:Number(latest.versionCode),sha256:/^[0-9a-f]{64}$/i.test(String(latest.sha256||''))?latest.sha256:''};
 }
 async function check(force=false){
  if(!window.Capacitor?.isNativePlatform?.())return;
  const plugin=window.Capacitor?.Plugins?.FleboIdScanner;
  if(!plugin?.getAppVersion)return;
  if(working||(!force&&Date.now()-last<CHECK_INTERVAL))return;
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
   const desc=document.createElement('p');desc.style.margin='8px 0';
   const close=document.createElement('button');close.type='button';close.textContent='Más tarde';
   close.onclick=()=>{closedVersion=latest.versionName;box.remove();};
   const button=document.createElement('button');button.type='button';
   button.style.marginRight='16px';
   const fallback=document.createElement('a');fallback.href=latest.apkUrl;
   fallback.target='_blank';fallback.rel='noopener noreferrer';
   fallback.textContent='Descarga oficial alternativa';
   fallback.style.cssText='display:none;margin-top:9px;color:#075f8b;text-decoration:underline;font-weight:600';
   // En equipos donde falla la escritura del APK en el caché privado,
   // ofrecer una salida verificable sin pedir que se desinstale FleboReport.
   const showFallback=(message)=>{
    fallback.style.display='block';
    desc.textContent=message+' Puedes abrir la descarga oficial sin desinstalar FleboReport.';
   };
   box.append(heading,desc,button,close,fallback);document.body.appendChild(box);
   if(plugin.prepareUpdate&&plugin.installPreparedUpdate){
    // Descarga anticipada, sin instalación silenciosa. Android siempre pide confirmar.
    let prepared=false;
    let waitingForInstallPermission=false;
    let progressListener=null;
    let installing=false;
    const releaseListener=async()=>{
     if(progressListener){try{await progressListener.remove();}catch(_){}progressListener=null;}
    };
    const install=async()=>{
     if(installing || !prepared)return;
     installing=true;
     button.disabled=true;button.textContent='Abriendo instalador…';
     try{
      const result=await plugin.installPreparedUpdate({versionName:latest.versionName});
      if(result?.permissionRequired){
       waitingForInstallPermission=true;
       desc.textContent='Autoriza «Permitir desde esta fuente» para FleboReport en los ajustes de Android. Al regresar, se abrirá el instalador oficial.';
       button.textContent='Revisar permiso de instalación';
      }else{
       waitingForInstallPermission=false;
       desc.textContent='Instalador de Android abierto. Confirma «Actualizar» o «Instalar» para conservar tus datos.';
       button.textContent='Abrir instalador otra vez';
      }
     }catch(error){
      const detail=String(error?.message||'No se pudo abrir el instalador Android.').slice(0,300);
      showFallback('No fue posible iniciar la instalación interna: '+detail);
      button.textContent='Reintentar instalación';
     }finally{installing=false;button.disabled=false;}
    };
    // Si Android abre Ajustes para autorizar la fuente, reintenta al volver
    // únicamente cuando el usuario sí habilitó el permiso.
    const onReturn=async()=>{
     if(!waitingForInstallPermission||document.hidden||!box.isConnected||installing)return;
     if(!plugin.getInstallPermissionStatus)return;
     try{
      const status=await plugin.getInstallPermissionStatus();
      if(status?.allowed){
       waitingForInstallPermission=false;
       await install();
      }else{
       desc.textContent='La instalación sigue pendiente: activa «Permitir desde esta fuente» para FleboReport o usa la descarga alternativa.';
      }
     }catch(_){/* El botón de reintento queda disponible. */}
    };
    window.addEventListener('focus',onReturn);
    document.addEventListener('visibilitychange',onReturn);
    close.addEventListener('click',()=>{
     window.removeEventListener('focus',onReturn);
     document.removeEventListener('visibilitychange',onReturn);
     void releaseListener();
    });
    const prepare=async()=>{
     button.disabled=true;button.textContent='Descargando…';
     desc.textContent='Descargando y verificando el APK firmado en FleboReport. Si tarda demasiado, puedes usar el enlace alternativo.';
     try{
      progressListener=await plugin.addListener('updateProgress',event=>{
       const percentage=Number(event?.percentage);
       if(Number.isFinite(percentage))desc.textContent='Descargando actualización: '+Math.max(0,Math.min(100,percentage))+' %.';
      });
      await plugin.prepareUpdate({versionName:latest.versionName,apkUrl:latest.apkUrl,sha256:latest.sha256||''});
      prepared=true;
      let allowed=true;
      if(plugin.getInstallPermissionStatus){
       try{allowed=Boolean((await plugin.getInstallPermissionStatus())?.allowed);}catch(_){}
      }
      desc.textContent=allowed
       ?'APK descargado y verificado. Presiona «Instalar actualización» para abrir la confirmación de Android.'
       :'APK descargado y verificado. Android necesita autorizar las instalaciones desde FleboReport una sola vez.';
      button.textContent=allowed?'Instalar actualización':'Autorizar e instalar';
      button.onclick=install;
     }catch(error){
      const detail=String(error?.message||'Fallo en descarga o escritura del archivo.').slice(0,300);
      showFallback('No se pudo preparar la APK desde la aplicación: '+detail);
      button.textContent='Reintentar descarga';
      button.onclick=prepare;
     }finally{
      button.disabled=false;
      await releaseListener();
     }
    };
    button.onclick=()=>prepared?install():prepare();
    // El enlace oficial debe quedar siempre accesible si el instalador interno
    // no termina, incluso cuando todavía no hay un error de red declarado.
    fallback.style.display='block';
    void prepare();
   }else{
    // Las versiones 1.4 y anteriores todavía no tienen descargador nativo.
    // Requieren una única instalación convencional para adquirir esta función.
    desc.textContent='Esta versión necesita una última instalación desde el navegador. Después FleboReport descargará las siguientes actualizaciones por sí mismo.';
    button.remove();
    const link=document.createElement('a');link.href=latest.apkUrl;link.target='_blank';
    link.rel='noopener noreferrer';link.textContent='Descargar última actualización';
    link.style.marginRight='16px';box.insertBefore(link,close);
   }
  }catch(error){console.warn('[FleboReport][Actualizaciones] No se pudo comprobar versión:',error?.message||error);}
  finally{working=false;}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>check());else check();
 // Reintentos rápidos tras iniciar el WebView Android, antes del intervalo periódico.
 window.setTimeout(()=>check(),1500);
 window.setTimeout(()=>check(),5000);
 // En Android al reabrir, volver del navegador o recuperar conexión se verifica de nuevo.
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
 window.addEventListener('focus',()=>check());
 window.addEventListener('pageshow',()=>check());
 window.addEventListener('online',()=>check());
 window.setInterval(()=>{if(!document.hidden)check();},5*60*1000);
 // Permite integrar un botón «Buscar actualizaciones» sin alterar la comprobación automática.
 window.FleboReportCheckForUpdates=()=>check(true);
})();
