(function(){
'use strict';
/*
 * FleboReport Firebase bootstrap — isolated migration scaffold.
 * This module is intentionally NOT loaded by index.html yet.
 * Supply the Firebase Web App config through window.FLEBO_FIREBASE_CONFIG
 * only after creating a Web App in the Firebase project and reviewing its
 * authorized domains. Web config is public; service-account credentials are not.
 */
const SDK_VERSION='12.6.0';
let app=null,auth=null,db=null,initializing=null;
const required=['apiKey','authDomain','projectId','appId'];
function validateConfig(config){
 if(!config||typeof config!=='object')throw new Error('Falta window.FLEBO_FIREBASE_CONFIG.');
 const missing=required.filter(k=>typeof config[k]!=='string'||!config[k].trim());
 if(missing.length)throw new Error('Configuración Firebase incompleta: '+missing.join(', '));
 if(config.projectId!=='fleboreport')throw new Error('El projectId configurado no corresponde a FleboReport.');
 return config;
}
async function initialize(config){
 if(app)return {app,auth,db};
 if(initializing)return initializing;
 initializing=(async()=>{
  const cfg=validateConfig(config||window.FLEBO_FIREBASE_CONFIG);
  const base='https://www.gstatic.com/firebasejs/'+SDK_VERSION+'/';
  const [appSdk,authSdk,firestoreSdk]=await Promise.all([
   import(base+'firebase-app.js'),import(base+'firebase-auth.js'),import(base+'firebase-firestore.js')
  ]);
  app=appSdk.getApps().length?appSdk.getApp():appSdk.initializeApp(cfg);
  auth=authSdk.getAuth(app);
  db=firestoreSdk.getFirestore(app);
  return {app,auth,db,authSdk,firestoreSdk};
 })().catch(error=>{initializing=null;throw error});
 return initializing;
}
function status(){
 return Object.freeze({initialized:!!app,projectId:app?.options?.projectId||null,provider:'firebase',migrationMode:'preparation-only'});
}
window.FleboFirebase=Object.freeze({initialize,status});
})();
