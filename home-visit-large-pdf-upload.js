/* FleboReport · Transporte privado para órdenes de Domicilios.
   Archivos > 6 MB utilizan carga reanudable TUS si está disponible.
   Sin CDN/conexión compatible, intenta el método estándar de Supabase;
   jamás usa una URL pública ni credenciales privilegiadas. */
(function(){
 'use strict';
 const MB=1024*1024,RELIABLE_THRESHOLD=6*MB;
 const URL_TUS='https://cdn.jsdelivr.net/npm/tus-js-client@4.3.1/+esm';
 let tusModule;
 function ensurePromise(){return tusModule||(tusModule=import(URL_TUS));}
 function storageEndpoint(client){
  const raw=client&&client.supabaseUrl;
  if(typeof raw!=='string')throw new Error('No se pudo determinar la dirección del almacenamiento.');
  const host=new URL(raw).hostname;
  const match=host.match(/^([a-z0-9-]+)\.supabase\.co$/i);
  if(!match)throw new Error('La URL del almacenamiento no es compatible.');
  return 'https://'+match[1]+'.storage.supabase.co/storage/v1/upload/resumable';
 }
 async function resumable(client,bucket,path,file,mime,onProgress){
  const lib=await ensurePromise();const Upload=lib.Upload||lib.default?.Upload;
  if(typeof Upload!=='function')throw new Error('El cargador reanudable no está disponible.');
  const sessionResult=await client.auth.getSession();
  const token=sessionResult?.data?.session?.access_token;
  if(!token)throw new Error('La sesión expiró. Inicia sesión antes de adjuntar el documento.');
  const endpoint=storageEndpoint(client);
  return new Promise((resolve,reject)=>{
   const upload=new Upload(file,{
    endpoint,
    retryDelays:[0,3000,5000,10000,20000],
    headers:{authorization:'Bearer '+token,'x-upsert':'false'},
    uploadDataDuringCreation:true,
    removeFingerprintOnSuccess:true,
    chunkSize:6*MB,
    metadata:{bucketName:bucket,objectName:path,contentType:mime,cacheControl:'3600'},
    onProgress:(uploaded,total)=>{if(typeof onProgress==='function')onProgress(uploaded,total)},
    onError:reject,
    onSuccess:resolve
   });
   upload.findPreviousUploads().then(previous=>{
    if(previous.length)upload.resumeFromPreviousUpload(previous[0]);
    upload.start();
   }).catch(reject);
  });
 }
 async function upload(client,bucket,path,file,mime,onProgress){
  if(!client||!file)throw new Error('Falta el archivo o no hay conexión.');
  let shouldFallback=false;
  if(file.size>RELIABLE_THRESHOLD){
   try{
    await resumable(client,bucket,path,file,mime,onProgress);
    return {method:'reanudable'};
   }catch(error){
    // Fallo al cargar la dependencia: permitir envío estándar (hasta 50 MB)
    // sin confundirlo con un fallo en la transferencia ya iniciada.
    const moduleUnavailable=!(await ensurePromise().then(()=>true,()=>false));
    if(!moduleUnavailable)throw error;
    shouldFallback=true;
    console.warn('[Domicilios] Cargador reanudable no disponible; probando la subida estándar.');
   }
  }
  const result=await client.storage.from(bucket).upload(path,file,{contentType:mime,upsert:false});
  if(result.error)throw result.error;
  if(typeof onProgress==='function')onProgress(file.size,file.size);
  return {method:shouldFallback?'estándar alternativa':'estándar'};
 }
 window.FleboHomeVisitUploader={upload,RELIABLE_THRESHOLD};
})();
