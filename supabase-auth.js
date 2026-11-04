(function(){
'use strict';
const SUPABASE_URL='https://knfjwvafwbhallhpsjqe.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_U5eHx3CDBBzS5vfNO7uQNw_CffYjJmo';
const SDK_URL='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
let client=null, sdkReady=null, currentUser=null, currentMembership=null, currentPermissions=[], permissionsLoaded=false, authBootComplete=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function setStatus(message,error){['fleboAuthStatus','fleboSessionStatus'].forEach(id=>{const el=document.getElementById(id);if(el){el.textContent=message||'';el.dataset.state=error?'error':'info';el.setAttribute('role',error?'alert':'status');}});const global=document.getElementById('fleboGlobalAuthStatus');if(global){global.textContent=error?(message||'No se pudo verificar el acceso.') : '';global.hidden=!error;}}
function panelMarkup(){return '<section id="fleboAuthPanel" aria-label="Inicio de sesión"><div class="flebo-login-art" aria-hidden="true"><div class="flebo-orbit orbit-one"></div><div class="flebo-orbit orbit-two"></div><div class="flebo-orbit orbit-three"></div><div class="flebo-art-line"></div><div class="flebo-art-word">FleboReport</div></div><div class="flebo-login-card"><div class="flebo-avatar" aria-hidden="true"><svg viewBox="0 0 64 64"><circle cx="32" cy="21" r="11"></circle><path d="M12 54c1-13 9-20 20-20s19 7 20 20"></path></svg></div><div class="flebo-login-heading"><span>ACCESO SEGURO</span><h1>FleboReport</h1><p>Ingresa tus credenciales para continuar</p></div><div id="fleboAuthBadge" class="flebo-auth-badge">Acceso requerido</div><form id="fleboAuthForm" novalidate><div id="fleboAuthStatus" class="flebo-auth-status" role="status" aria-live="polite" aria-atomic="true"></div><label class="flebo-input-row"><span class="flebo-field-icon" aria-hidden="true">♟</span><span class="flebo-sr-only">Usuario</span><input id="fleboAuthUsername" autocomplete="username" placeholder="Usuario" aria-label="Usuario" required></label><label class="flebo-input-row"><span class="flebo-field-icon" aria-hidden="true">▣</span><span class="flebo-sr-only">Contraseña</span><input id="fleboAuthPassword" type="password" autocomplete="current-password" placeholder="Contraseña" aria-label="Contraseña" required><button id="fleboPasswordToggle" class="flebo-password-toggle" type="button" aria-label="Mostrar contraseña" aria-pressed="false">Mostrar</button></label><div class="flebo-login-options"><label><input id="fleboRememberMe" type="checkbox" checked> <span>Recordarme</span></label></div><button id="fleboAuthSignIn" type="submit">INICIAR SESIÓN</button><p class="flebo-login-help">Acceso exclusivo para usuarios autorizados.</p></form><div id="fleboAuthSession" hidden><div id="fleboSessionStatus" class="flebo-auth-status" role="status" aria-live="polite" aria-atomic="true"></div><b id="fleboAuthUser"></b><div id="fleboAuthRole"></div><p id="fleboAuthWorkspaceHelp" class="flebo-login-help" hidden>Tu cuenta no tiene una vinculación activa con el espacio de trabajo. No crees otro espacio: vuelve a verificar la conexión o contacta al administrador.</p><button id="fleboAuthRetryMembership" type="button" hidden>Reintentar verificación</button><button id="fleboAuthSignOut" type="button">Cerrar sesión</button></div></div></section>'}
function mountPanel(){installGlobalControls();if(document.getElementById('fleboAuthPanel'))return;let gate=document.getElementById('fleboAuthGate');if(!gate){gate=document.createElement('div');gate.id='fleboAuthGate';gate.innerHTML='<div class="flebo-login-brand"><div class="flebo-login-mark">💧</div><div><b>FleboReport</b><small>Acceso seguro al centro de operaciones</small></div></div><div id="fleboAuthMount"></div><p class="flebo-login-foot">Acceso privado · Sesión protegida · Datos por espacio de trabajo</p>';document.body.prepend(gate)}const mount=document.getElementById('fleboAuthMount');mount.innerHTML=panelMarkup();bindPanel();const authGateEl=document.getElementById('fleboAuthGate');if(authGateEl&&!authBootComplete)authGateEl.dataset.checking='true';renderState();installGlobalControls();}
function bindPanel(){const bind=(id,fn)=>{const el=document.getElementById(id);if(el)el.addEventListener('click',fn)};const form=document.getElementById('fleboAuthForm');if(form)form.addEventListener('submit',e=>{e.preventDefault();signIn()});bind('fleboAuthRetryMembership',retryMembership);bind('fleboAuthSignOut',signOut);const toggle=document.getElementById('fleboPasswordToggle');if(toggle)toggle.addEventListener('click',()=>{const input=document.getElementById('fleboAuthPassword');if(!input)return;const showing=input.type==='text';input.type=showing?'password':'text';toggle.textContent=showing?'Mostrar':'Ocultar';toggle.setAttribute('aria-label',showing?'Mostrar contraseña':'Ocultar contraseña');toggle.setAttribute('aria-pressed',String(!showing));});const remember=document.getElementById('fleboRememberMe');if(remember){try{remember.checked=localStorage.getItem('fleboRememberSession')!=='false'}catch(_){remember.checked=true}remember.addEventListener('change',()=>{try{localStorage.setItem('fleboRememberSession',remember.checked?'true':'false')}catch(_){}})}}
async function init(){if(sdkReady)return sdkReady;sdkReady=import(SDK_URL).then(({createClient})=>{const sessionStorageAdapter={getItem(key){try{const remember=document.getElementById('fleboRememberMe')?.checked!==false;return (remember?localStorage:sessionStorage).getItem(key)}catch(_){return null}},setItem(key,value){try{const remember=document.getElementById('fleboRememberMe')?.checked!==false;(remember?localStorage:sessionStorage).setItem(key,value);(remember?sessionStorage:localStorage).removeItem(key)}catch(_){}},removeItem(key){try{localStorage.removeItem(key);sessionStorage.removeItem(key)}catch(_){}}};client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{storage:sessionStorageAdapter,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});window.fleboSupabase=client;client.auth.onAuthStateChange((event,session)=>{if(event==='INITIAL_SESSION')return;setTimeout(()=>refreshSession(session&&session.user),0)});return client}).catch(e=>{setStatus('No se pudo cargar el SDK de autenticación: '+e.message,true);throw e});return sdkReady;}
function values(){return {username:(document.getElementById('fleboAuthUsername')?.value||'').trim().toLowerCase(),email:(document.getElementById('fleboAuthEmail')?.value||'').trim().toLowerCase(),password:document.getElementById('fleboAuthPassword')?.value||'',name:(document.getElementById('fleboAuthName')?.value||'').trim(),workspace:(document.getElementById('fleboWorkspaceName')?.value||'FleboReport').trim()};}
async function usernameAuth(action,v){const response=await fetch(SUPABASE_URL+'/functions/v1/flebo-username-auth',{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify({action,username:v.username,email:v.email,password:v.password,display_name:v.name})});const result=await response.json();if(!response.ok)throw new Error(result.error||'No se pudo completar la autenticación.');return result}
async function signIn(){const button=document.getElementById('fleboAuthSignIn');try{if(button){button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='VALIDANDO…'}setStatus('Validando usuario…');await init();const v=values();if(!v.username||!v.password)throw new Error('Escribe tu nombre de usuario y contraseña.');const result=await usernameAuth('login',v);if(!result.session?.access_token||!result.session?.refresh_token)throw new Error('La autenticación no devolvió una sesión válida. Inténtalo nuevamente.');const {data,error}=await client.auth.setSession({access_token:result.session.access_token,refresh_token:result.session.refresh_token});if(error)throw error;await refreshSession(data.user)}catch(e){const msg=String(e?.message||'');setStatus(/(failed to fetch|network|timeout|504|500)/i.test(msg)?'No se pudo conectar con el servicio de acceso. Comprueba tu conexión e inténtalo nuevamente en unos segundos.':msg,true)}finally{if(button){button.disabled=false;button.removeAttribute('aria-busy');button.textContent='INICIAR SESIÓN'}}}
async function signUp(){try{await init();const v=values();if(!v.name||!v.username||!v.email||v.password.length<8||v.workspace.length<2)throw new Error('Completa nombre, usuario, correo, laboratorio y contraseña (mínimo 8 caracteres).');setStatus('Registrando la primera cuenta…');const result=await usernameAuth('signup',v);if(!result.session){setStatus('Cuenta registrada. Confirma el correo electrónico y luego inicia sesión con tu nombre de usuario.');return}const {data,error}=await client.auth.setSession({access_token:result.session.access_token,refresh_token:result.session.refresh_token});if(error)throw error;await refreshSession(data.user);if(currentUser&&!currentMembership)await createWorkspace()}catch(e){setStatus(e.message,true)}}
async function loadMembership(user){const {data,error}=await client.auth.getSession();if(error)throw error;const token=data.session?.access_token;if(!token)return null;const response=await fetch(SUPABASE_URL+'/functions/v1/flebo-username-auth',{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_PUBLISHABLE_KEY,'Authorization':'Bearer '+token},body:JSON.stringify({action:'get-membership'})});const result=await response.json();if(!response.ok)throw new Error(result.error||'No se pudo verificar el acceso al espacio de trabajo.');return result.membership||null}
async function loadCurrentPermissions(){currentPermissions=[];permissionsLoaded=false;if(!currentUser||!currentMembership||!client)return;const wid=currentMembership.workspace_id;const [base,overrides]=await Promise.all([client.from('role_permissions').select('module_key,action_key,allowed').eq('workspace_id',wid).eq('role_key',currentMembership.role),client.from('member_permissions').select('module_key,action_key,allowed,site_id').eq('workspace_id',wid).eq('user_id',currentUser.id)]);if(base.error||overrides.error){console.warn('No se pudieron cargar permisos granulares',base.error||overrides.error);setStatus('No se pudieron verificar tus permisos. Por seguridad, el acceso a los módulos permanecerá bloqueado. Pulsa Reintentar verificación.',true);return}currentPermissions=[...(base.data||[]).map(p=>({...p,source:'role'})),...(overrides.data||[]).map(p=>({...p,source:'member'}))];permissionsLoaded=true}
async function refreshSession(user){if(!user){currentUser=null;currentMembership=null;currentPermissions=[];permissionsLoaded=false;renderState();return}try{currentUser=user;currentMembership=null;currentPermissions=[];permissionsLoaded=false;renderState();currentMembership=await loadMembership(user);await loadCurrentPermissions();renderState();const authorized=!!(currentUser&&currentMembership&&currentMembership.active===true);if(currentMembership)setStatus('Cuenta autenticada y vinculada al espacio de trabajo.');else{setStatus('Cuenta autenticada. Falta crear o asignar un espacio de trabajo.');const b=document.getElementById('fleboAuthCreateWorkspace');if(b)b.hidden=false}}catch(e){currentMembership=null;currentPermissions=[];permissionsLoaded=false;renderState();setStatus('No se pudo verificar tu espacio de trabajo. Por seguridad, el acceso permanece bloqueado. Pulsa Reintentar verificación. '+e.message,true)}}
async function retryMembership(){if(!currentUser)return;setStatus('Volviendo a verificar tu vinculación…');await refreshSession(currentUser)}async function createWorkspace(){try{await init();if(!currentUser)throw new Error('Primero inicia sesión.');if(currentMembership)throw new Error('Esta cuenta ya tiene un espacio de trabajo asignado.');const name=values().workspace;if(name.length<2)throw new Error('Escribe el nombre del laboratorio.');setStatus('Creando el espacio inicial…');const {data,error}=await client.rpc('create_workspace',{workspace_name:name});if(error)throw error;await refreshSession(currentUser);setStatus('Espacio de trabajo inicial creado.');}catch(e){setStatus(e.message,true)}}
async function signOut(){try{if(client)await client.auth.signOut();currentUser=null;currentMembership=null;currentPermissions=[];permissionsLoaded=false;document.body.classList.remove('flebo-authenticated');document.getElementById('fleboGlobalSignOut')?.setAttribute('hidden','');renderState();setStatus('Sesión cerrada.')}catch(e){setStatus(e.message,true)}}
function roleModules(role){const all=['home','journey','companies','patients','domicilios','catalog','reports','report-history','clinical-studies','clinical-processing','audit','settings'];const map={admin:all,clinician:['home','journey','companies','patients','domicilios','catalog','reports','report-history','clinical-studies','clinical-processing'],reception:['home','journey','companies','patients','domicilios','catalog','reports','report-history'],technician:['home','domicilios'],viewer:['home','reports','report-history']};return map[role]||[]}
const VIEW_MODULE_MAP={home:'dashboard',journey:'journeys',companies:'companies',patients:'patients',domicilios:'domicilios',catalog:'catalog',reports:'reports','report-history':'reports','clinical-studies':'studies','clinical-processing':'processing',settings:'settings',audit:'audit'};function canAction(module,action,siteId){if(!currentUser||!currentMembership)return false;if(currentMembership.role==='admin')return true;if(permissionsLoaded){const overrides=currentPermissions.filter(p=>p.source==='member'&&p.module_key===module&&p.action_key===action&&(p.site_id===null||p.site_id===undefined||p.site_id===siteId));const specific=siteId?overrides.find(p=>p.site_id===siteId):null;const global=overrides.find(p=>p.site_id===null||p.site_id===undefined);if(specific)return !!specific.allowed;if(global)return !!global.allowed;const base=currentPermissions.find(p=>p.source==='role'&&p.module_key===module&&p.action_key===action);return !!base?.allowed}return false}function canAccess(view){if(!currentUser||!currentMembership||currentMembership.active!==true)return false;if(view==='settings'&&currentMembership.role!=='admin')return false;if(permissionsLoaded)return canAction(VIEW_MODULE_MAP[view]||view,'view');return currentMembership.role==='admin'&&roleModules(currentMembership.role).includes(view)}window.fleboCan=(module,action,siteId)=>canAction(module,action,siteId);
function applyAccess(){
 const role=currentMembership?.role||'';
 document.querySelectorAll('[data-nav]').forEach(el=>{el.hidden=!canAccess(el.dataset.nav)});
 document.querySelectorAll('[data-mobile]').forEach(el=>{el.hidden=!canAccess(el.dataset.mobile)});
 document.querySelectorAll('.view[id^="view-"]').forEach(el=>{const key=el.id.replace(/^view-/,'');const allowed=canAccess(key);el.hidden=!allowed;el.setAttribute('aria-hidden',String(!allowed))});
 if(window.navigate){const original=window.navigate;if(!original.__fleboGuard){const guarded=function(view,...args){if(!canAccess(view)){if(window.toast)window.toast('Tu cuenta no tiene permiso para abrir este módulo.');return}return original.call(this,view,...args)};guarded.__fleboGuard=true;guarded.__original=original;window.navigate=guarded}}
 const home=document.getElementById('view-home');
 if(home){
  let welcome=home.querySelector('#fleboRoleHome');
  if(!welcome){welcome=document.createElement('section');welcome.id='fleboRoleHome';welcome.className='panel flebo-role-home';welcome.innerHTML='<div class="flebo-role-home-icon" aria-hidden="true">⌂</div><div><span class="eyebrow">INICIO</span><h2>Tu espacio de trabajo</h2><p>Usa los módulos habilitados para tu cuenta.</p><button type="button" class="btn btn-primary" data-role-home-link>Ir a Domicilios</button></div>';home.appendChild(welcome)}
  const limited=role==='technician';
  home.querySelectorAll('.op-kpis,.op-panel,.op-grid,.op-quick').forEach(el=>el.hidden=limited);
  welcome.hidden=!limited;
  if(limited){const link=welcome.querySelector('[data-role-home-link]');if(link&&!link.dataset.bound){link.dataset.bound='1';link.addEventListener('click',()=>window.navigate&&window.navigate('domicilios'))}}
 }
 if(role==='admin')mountAdminUsers();else{document.getElementById('fleboUsersTab')?.remove();document.getElementById('fleboUsersSection')?.remove()}
 const current=document.querySelector('.view.active');
 const view=current?.id?.replace('view-','');
 if(view&&!canAccess(view)&&currentUser&&currentMembership&&window.navigate)window.navigate('home');
}
function installGlobalControls(){if(!document.getElementById('fleboGlobalAuthStatus')){const notice=document.createElement('div');notice.id='fleboGlobalAuthStatus';notice.hidden=true;notice.setAttribute('role','alert');notice.setAttribute('aria-live','assertive');document.body.appendChild(notice)}if(!document.getElementById('fleboGlobalAuthStyles')){const st=document.createElement('style');st.id='fleboGlobalAuthStyles';st.textContent=`
.view[hidden]{display:none!important}\n.flebo-role-home{display:flex;align-items:center;gap:18px;max-width:760px;margin:24px auto;padding:24px;background:linear-gradient(135deg,#fff,#edf8f7);border-radius:22px;box-shadow:0 14px 32px #0f766e1c}\n.flebo-role-home[hidden]{display:none!important}\n.flebo-role-home h2{margin:4px 0 8px;color:#12324a}\n.flebo-role-home p{margin:0 0 16px;color:#62768b}\n.flebo-role-home-icon{display:grid;place-items:center;flex:0 0 58px;width:58px;height:58px;border-radius:19px;background:linear-gradient(145deg,#0d9488,#0c6d75);color:white;font-size:30px;box-shadow:0 8px 16px #0d94884d}\n@media(max-width:600px){.flebo-role-home{margin:16px 0;padding:18px;align-items:flex-start}.flebo-role-home-icon{flex-basis:48px;width:48px;height:48px}}\n#fleboGlobalAuthStatus{position:fixed;top:calc(12px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:11000;width:min(92vw,620px);padding:12px 15px;border:1px solid #e9a5a5;border-radius:13px;background:#fff4f3;color:#982b2b;box-shadow:0 12px 30px #153e5728;font-size:13px;line-height:1.45;text-align:center;overflow-wrap:anywhere}
#fleboGlobalAuthStatus[hidden]{display:none!important}
#fleboAuthGate{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:clamp(12px,4vw,42px);background:#f4f4f4;overflow:auto}
#fleboAuthGate[hidden]{display:none!important}
#fleboAuthGate[data-checking='true']{visibility:hidden;pointer-events:none}
.flebo-login-brand,.flebo-login-foot{display:none!important}
#fleboAuthMount{width:min(100%,1220px);margin:auto}
#fleboAuthPanel{position:relative;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(360px,.95fr);min-height:min(78vh,760px);overflow:hidden;border:10px solid #fff;border-radius:5px;background:linear-gradient(135deg,#111 0%,#242224 100%);box-shadow:0 12px 38px #0003;color:#fff}
.flebo-login-art{position:relative;min-height:580px;overflow:hidden;background:radial-gradient(ellipse at 45% 50%,#333 0%,#171617 57%,#101010 100%)}
.flebo-login-art:before,.flebo-login-art:after{content:"";position:absolute;inset:-20%;border:1px solid #aaa5;border-radius:50%;transform:rotate(-35deg) scale(.7)}
.flebo-login-art:after{inset:12% -28% 12% 5%;border-color:#7778;transform:rotate(38deg) scale(.85)}
.flebo-orbit{position:absolute;border:1px solid #aaa9;border-radius:50%}
.orbit-one{width:310px;height:310px;left:8%;top:14%}
.orbit-two{width:110px;height:110px;left:15%;top:43%}
.orbit-three{width:74px;height:74px;left:48%;top:70%}
.flebo-art-line{position:absolute;width:150%;height:1px;left:-15%;top:55%;background:#bbb8;transform:rotate(-48deg);box-shadow:0 0 0 1px #0005}
.flebo-art-word{position:absolute;left:9%;bottom:8%;font-size:clamp(28px,4vw,52px);font-weight:800;letter-spacing:-2px;color:#ffffff16}
.flebo-login-card{position:relative;align-self:center;justify-self:center;width:min(88%,470px);margin:56px 5%;padding:70px 34px 34px;border:1px solid #ffffff30;border-radius:24px;background:linear-gradient(145deg,#ffffff42,#ffffff18);box-shadow:0 22px 55px #0008;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
.flebo-avatar{position:absolute;top:-86px;left:50%;transform:translateX(-50%);width:132px;height:132px;border-radius:50%;display:grid;place-items:center;background:#d4d4d4;border:5px solid #bdbdbd;box-shadow:0 5px 18px #0005}
.flebo-avatar svg{width:76px;height:76px;fill:none;stroke:#fff;stroke-width:3;stroke-linecap:round}
.flebo-login-heading{text-align:center;margin:0 0 24px}
.flebo-login-heading>span{font-size:11px;letter-spacing:2px;font-weight:800;color:#e1e1e1}
.flebo-login-heading h1{margin:8px 0 5px;font-size:clamp(25px,3vw,34px);color:#fff;letter-spacing:-.7px}
.flebo-login-heading p{margin:0;color:#e0e0e0;font-size:13px}
.flebo-auth-badge{margin:0 0 16px;text-align:center;color:#f2f2f2;font-size:12px;font-weight:700}
.flebo-input-row{display:flex;align-items:center;height:58px;margin:0 0 14px;background:#e8e8e8;border:1px solid #c8c8c8;color:#292929}
.flebo-field-icon{width:58px;height:100%;display:grid;place-items:center;background:#d3d3d3;color:#333;font-size:21px;border-right:1px solid #c4c4c4}
.flebo-input-row input{width:100%;height:100%;min-width:0;padding:0 18px;border:0!important;outline:none!important;background:transparent!important;color:#171717!important;font-size:16px!important;box-shadow:none!important}
.flebo-input-row input::placeholder{color:#777;opacity:1}
.flebo-login-options{display:flex;justify-content:flex-start;align-items:center;margin:18px 0 24px;color:#e6e6e6;font-size:12px}
.flebo-login-options label{display:flex;align-items:center;gap:7px}
.flebo-login-options input{accent-color:#aaa;width:15px;height:15px}
#fleboAuthSignIn{width:100%;min-height:58px;border:1px solid #eee;background:#e7e7e7;color:#171717;font-size:15px;font-weight:850;letter-spacing:2px;border-radius:2px;box-shadow:0 5px 14px #0003}
#fleboAuthSignIn:active{transform:translateY(1px)}
.flebo-login-help{margin:18px 0 0;text-align:center;color:#e2e2e2;font-size:11px}
.flebo-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
#fleboAuthSession{color:#fff;text-align:center;display:grid;gap:12px}
#fleboAuthSession[hidden],#fleboAuthForm[hidden],#fleboAuthPanel [hidden]{display:none!important}
#fleboAuthSession button{padding:12px;border:0;border-radius:4px;background:#eee;color:#111;font-weight:700}
#fleboGlobalSignOut{position:relative;inset:auto;z-index:1;display:block;width:100%;min-width:0;min-height:44px;margin:10px 0 0;padding:10px 14px;border:1px solid #d7e5eb;border-radius:12px;background:linear-gradient(145deg,#fff,#edf4f7);color:#9b3440;font-weight:850;font-size:12px;box-shadow:0 3px 0 #c4d4dc,0 7px 14px #092d4420;cursor:pointer;text-align:center}#fleboGlobalSignOut:active{transform:translateY(1px)}#fleboGlobalSignOut[hidden]{display:none!important}
/* Cierre de sesión integrado en el pie del menú desplegable, nunca sobre el dashboard. */
#sidebar .drawer-footer{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
#sidebar .drawer-footer #fleboGlobalSignOut{
 position:relative!important;inset:auto!important;top:auto!important;right:auto!important;
 transform:none!important;float:none!important;z-index:1!important;
 display:block;width:100%;min-width:0;min-height:44px;margin:8px 0 0;padding:10px 14px;
 flex:0 0 100%;box-sizing:border-box;border:1px solid #d7e5eb;border-radius:12px;
 background:linear-gradient(145deg,#fff,#edf4f7);color:#9b3440;font-weight:850;
 font-size:12px;box-shadow:0 3px 0 #c4d4dc,0 7px 14px #092d4420;
 cursor:pointer;text-align:center;
}
#sidebar .drawer-footer #fleboGlobalSignOut[hidden]{display:none!important}
#sidebar .drawer-footer #fleboGlobalSignOut:active{transform:translateY(1px)!important}

#sidebar .nav-list #fleboGlobalSignOut:active{transform:translateY(1px)!important}@media(max-width:760px){#fleboGlobalSignOut{top:calc(70px + env(safe-area-inset-top));right:12px;min-width:118px;min-height:40px;padding:9px 12px;border-radius:12px;z-index:10050}}
#fleboGlobalSignOut[hidden]{display:none!important}
#fleboUsersSection .fields{margin-top:12px}#fleboUsersList .list-row{align-items:center;flex-wrap:wrap}#fleboUsersList select{min-height:34px;border:1px solid #dce7ed;border-radius:8px;padding:6px}
@media(max-width:760px){#fleboAuthGate{padding:10px}#fleboAuthPanel{display:flex;justify-content:center;min-height:min(88vh,780px);border-width:5px}.flebo-login-art{display:none}.flebo-login-card{width:min(100%,430px);margin:100px 12px 24px;padding:64px 22px 26px}.flebo-avatar{width:112px;height:112px;top:-72px}.flebo-avatar svg{width:65px;height:65px}.flebo-login-heading h1{font-size:29px}}
@media(max-height:650px) and (min-width:761px){#fleboAuthPanel{min-height:560px}.flebo-login-art{min-height:540px}.flebo-login-card{margin:90px 4% 30px;padding-top:58px}.flebo-avatar{width:105px;height:105px;top:-65px}}

/* FleboReport · acceso clínico luminoso (solo presentación; autenticación intacta) */
#fleboAuthGate{
 background:
  radial-gradient(ellipse at 12% 18%,rgba(45,164,226,.18),transparent 34%),
  radial-gradient(ellipse at 88% 78%,rgba(19,151,168,.16),transparent 36%),
  linear-gradient(135deg,#f8fcff 0%,#e8f5fc 48%,#f7fbff 100%);
}
#fleboAuthGate:before{
 content:"";position:fixed;inset:0;pointer-events:none;opacity:.38;
 background:
  radial-gradient(ellipse at 80% 20%,transparent 0 13%,rgba(72,158,205,.16) 13.2% 13.5%,transparent 13.7% 19%,rgba(72,158,205,.12) 19.2% 19.5%,transparent 19.7%),
  repeating-linear-gradient(118deg,transparent 0 72px,rgba(67,151,194,.055) 73px 74px,transparent 75px 146px);
}
#fleboAuthMount{position:relative;z-index:1;width:min(100%,520px)}
#fleboAuthPanel{
 display:flex;justify-content:center;align-items:center;min-height:0;overflow:visible;
 padding:22px 0;border:0;border-radius:32px;
 background:transparent;box-shadow:none;color:#123c5c;
}
.flebo-login-art{display:none!important}
.flebo-login-card{
 width:min(100%,470px);margin:70px 12px 20px;padding:76px 34px 30px;
 border:1px solid rgba(255,255,255,.92);border-radius:30px;
 background:linear-gradient(145deg,rgba(255,255,255,.88),rgba(226,244,255,.72));
 box-shadow:0 28px 75px rgba(25,91,130,.17),0 5px 18px rgba(27,102,145,.08),inset 0 1px 0 #fff;
 -webkit-backdrop-filter:blur(24px) saturate(150%);backdrop-filter:blur(24px) saturate(150%);
 color:#123c5c;
}
.flebo-avatar{
 top:-62px;width:112px;height:112px;border:4px solid #f8fdff;
 background:linear-gradient(145deg,#fafdff,#8dbedb 48%,#145a86);
 box-shadow:0 12px 28px rgba(18,91,137,.25),inset 0 2px 5px #fff;
}
.flebo-avatar:after{content:"";position:absolute;inset:7px;border:1px solid rgba(255,255,255,.7);border-radius:50%;pointer-events:none}
.flebo-avatar svg{width:65px;height:65px;stroke:#fff;stroke-width:2.8;filter:drop-shadow(0 2px 3px #164e7180)}
.flebo-login-heading{margin:0 0 22px}
.flebo-login-heading>span{color:#176c9e;font-size:10px;letter-spacing:2.2px}
.flebo-login-heading h1{
 margin:8px 0 7px;font-size:clamp(32px,6vw,43px);font-weight:850;letter-spacing:-1.5px;
 background:linear-gradient(100deg,#103d68,#087fbe 65%,#16a0b1);-webkit-background-clip:text;background-clip:text;color:transparent;
}
.flebo-login-heading p{color:#526f85;font-size:13px;line-height:1.5}
.flebo-auth-badge{min-height:18px;margin:0 0 14px;color:#176b91;font-size:11px}
.flebo-input-row{
 position:relative;display:flex;align-items:center;height:58px;margin:0 0 13px;
 border:1.5px solid #8fc7e9;border-radius:17px;background:rgba(229,245,255,.88);
 color:#146a9f;box-shadow:inset 0 2px 5px rgba(33,113,159,.06),0 3px 9px rgba(31,113,159,.05);
 transition:border-color .18s ease,box-shadow .18s ease,background .18s ease;
}
.flebo-input-row:focus-within{border-color:#168bd0;background:#f5fbff;box-shadow:0 0 0 4px rgba(36,151,211,.12),inset 0 2px 5px rgba(33,113,159,.04)}
.flebo-field-icon{width:54px;flex:none;background:transparent;border:0;color:#087dbb;font-size:21px}
.flebo-input-row input{padding:0 15px 0 2px;color:#174c70!important;font-size:15px!important}
.flebo-input-row input::placeholder{color:#5485a4;opacity:1}
.flebo-login-options{justify-content:flex-start;margin:17px 2px 23px;color:#315d79;font-size:12px}
.flebo-login-options label{gap:10px;cursor:pointer}
.flebo-login-options input{
 appearance:none;-webkit-appearance:none;position:relative;width:43px;height:25px;flex:none;margin:0;
 border:1px solid #a9c3d3;border-radius:99px;background:#d6e3eb;cursor:pointer;
 transition:background .18s ease,border-color .18s ease;
}
.flebo-login-options input:before{
 content:"";position:absolute;top:2px;left:2px;width:19px;height:19px;border-radius:50%;
 background:#fff;box-shadow:0 2px 5px #16415c35;transition:transform .18s ease;
}
.flebo-login-options input:checked{background:#1686c6;border-color:#1686c6}
.flebo-login-options input:checked:before{transform:translateX(18px)}
.flebo-login-options input:focus-visible{outline:3px solid #56b9e777;outline-offset:3px}
#fleboAuthSignIn{
 width:100%;min-height:58px;border:1px solid #0878a9;border-radius:17px;
 background:linear-gradient(105deg,#075b91,#087fb7 56%,#087d91);color:#fff;
 font-size:14px;font-weight:850;letter-spacing:1.25px;
 box-shadow:0 8px 18px rgba(5,94,143,.23),inset 0 1px rgba(255,255,255,.25);
 transition:transform .16s ease,filter .16s ease,box-shadow .16s ease;
}
#fleboAuthSignIn:hover{filter:brightness(1.07);box-shadow:0 10px 22px rgba(5,94,143,.28),inset 0 1px rgba(255,255,255,.25)}
#fleboAuthSignIn:active{transform:translateY(1px)}
#fleboAuthSignIn:focus-visible{outline:3px solid #168bd088;outline-offset:3px}
.flebo-login-help{margin:21px 0 0;color:#315d79;font-size:11px;line-height:1.5}
.flebo-auth-status{display:none;margin:0 0 14px;padding:11px 13px;border:1px solid #c8dce9;border-radius:12px;background:#f1f8fc;color:#24536f;font-size:12px;line-height:1.5;text-align:left;overflow-wrap:anywhere}
.flebo-auth-status:not(:empty){display:block}
.flebo-auth-status[data-state='error']{border-color:#f1b9b9;background:#fff3f2;color:#9c2929}
.flebo-password-toggle{flex:none;margin-right:8px;padding:7px 9px;border:1px solid #b5d2e3;border-radius:9px;background:#fff;color:#176b9b;font-size:11px;font-weight:750}
#fleboAuthSignIn:disabled{opacity:.68;cursor:wait;filter:saturate(.65)}
#fleboAuthForm{width:100%}
#fleboAuthSession{color:#174766}
#fleboAuthSession button{min-height:48px;border:0;border-radius:14px;background:linear-gradient(105deg,#075b91,#087fb7);color:#fff;font-weight:800}
#fleboAuthSession #fleboAuthSignOut{background:#fff;color:#315d79;border:1px solid #c9dce8}
#fleboAuthGate .flebo-login-brand,#fleboAuthGate .flebo-login-foot{display:none!important}
@media(max-width:760px){
 #fleboAuthGate{align-items:center;justify-content:center;padding:max(14px,env(safe-area-inset-top)) 12px max(14px,env(safe-area-inset-bottom))}
 #fleboAuthMount{width:min(100%,440px)}
 #fleboAuthPanel{min-height:0;padding:18px 0}
 .flebo-login-card{width:100%;margin:64px 0 10px;padding:68px 22px 25px;border-radius:25px}
 .flebo-avatar{width:104px;height:104px;top:-57px}
 .flebo-avatar svg{width:60px;height:60px}
 .flebo-login-heading h1{font-size:35px}
 .flebo-input-row{height:56px;border-radius:15px}
 #fleboAuthSignIn{min-height:56px;border-radius:15px}
}
@media(max-height:650px){
 #fleboAuthGate{align-items:flex-start}
 #fleboAuthPanel{padding:8px 0}
 .flebo-login-card{margin-top:58px;padding-top:62px}
 .flebo-avatar{width:90px;height:90px;top:-49px}
 .flebo-avatar svg{width:52px;height:52px}
 .flebo-login-heading{margin-bottom:15px}
 .flebo-input-row{height:50px;margin-bottom:10px}
 .flebo-login-options{margin:12px 2px 15px}
 #fleboAuthSignIn{min-height:50px}
 .flebo-login-help{margin-top:13px}
}
@media(prefers-reduced-motion:reduce){
 .flebo-input-row,.flebo-login-options input,.flebo-login-options input:before,#fleboAuthSignIn{transition:none!important}
}

/* El indicador de acceso no necesita fondo de alerta */
.flebo-auth-badge{
 background:transparent!important;
 box-shadow:none!important;
 border:0!important;
 padding:0!important;
 border-radius:0!important;
}
`;document.head.appendChild(st)}let signout=document.getElementById('fleboGlobalSignOut');if(!signout){signout=document.createElement('button');signout.id='fleboGlobalSignOut';signout.type='button';signout.textContent='Cerrar sesión';signout.hidden=true;signout.addEventListener('click',signOut)}const footer=document.querySelector('#sidebar .drawer-footer');if(footer&&signout.parentElement!==footer)footer.appendChild(signout);else if(!footer&&!signout.isConnected)(document.querySelector('#sidebar')||document.body).appendChild(signout);}
async function refreshRegistrationMode(){setStatus('Inicia sesión con tu usuario y contraseña para acceder a FleboReport.');}
async function adminRequest(action,payload={}){if(!client||!currentUser||!currentMembership||currentMembership.role!=='admin')throw new Error('Solo el administrador puede gestionar usuarios.');const {data,error}=await client.auth.getSession();if(error)throw error;const token=data.session?.access_token;if(!token)throw new Error('La sesión expiró. Inicia sesión nuevamente.');const response=await fetch(SUPABASE_URL+'/functions/v1/flebo-username-auth',{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_PUBLISHABLE_KEY,'Authorization':'Bearer '+token},body:JSON.stringify({action,workspace_id:currentMembership.workspace_id,...payload})});const result=await response.json();if(!response.ok)throw new Error(result.error||'No se pudo completar la operación.');return result}
function mountAdminUsers(){const view=document.getElementById('view-settings'),tabs=view?.querySelector('.settings-tabs');if(!view||!tabs||document.getElementById('fleboUsersSection'))return;const tab=document.createElement('button');tab.id='fleboUsersTab';tab.className='no-print';tab.dataset.settings='users';tab.textContent='Usuarios y permisos';tab.addEventListener('click',()=>{document.querySelectorAll('.settings-section').forEach(x=>x.hidden=x.id!=='fleboUsersSection');tabs.querySelectorAll('[data-settings]').forEach(x=>x.classList.toggle('active',x===tab));loadAdminUsers()});tabs.appendChild(tab);const section=document.createElement('section');section.id='fleboUsersSection';section.className='settings-section';section.hidden=true;section.innerHTML='<div class="panel form-panel"><h2>Usuarios y permisos</h2><p class="section-description">Crea cuentas de acceso y asigna el nivel de cada colaborador. Los permisos también se validan en el servidor.</p><div class="fields"><div class="field"><label for="frNewName">Nombre completo</label><input id="frNewName" autocomplete="name"></div><div class="field"><label for="frNewUsername">Nombre de usuario</label><input id="frNewUsername" autocomplete="off" placeholder="usuario123"></div><div class="field"><label for="frNewEmail">Correo de acceso</label><input id="frNewEmail" type="email" autocomplete="off"></div><div class="field"><label for="frNewPassword">Contraseña inicial</label><input id="frNewPassword" type="password" minlength="8" autocomplete="new-password"></div><div class="field"><label for="frNewRole">Rol</label><select id="frNewRole"><option value="technician">Flebotomista</option><option value="reception">Recepción / Agenda</option><option value="clinician">Supervisor clínico</option><option value="viewer">Solo consulta</option><option value="role_custom">Personalizado (role_custom)</option><option value="admin">Administrador</option></select></div></div><div class="form-actions"><button class="btn primary" id="frCreateUser" type="button">Crear usuario</button><button class="btn" id="frRefreshUsers" type="button">Actualizar lista</button></div><p id="frUsersStatus" class="field-help" aria-live="polite"></p><div class="divider"></div><h3>Usuarios del espacio</h3><div id="fleboUsersList" class="list-stack"><div class="empty-state">Cargando usuarios…</div></div></div>';view.appendChild(section);document.getElementById('frCreateUser').addEventListener('click',createAdminUser);document.getElementById('frRefreshUsers').addEventListener('click',loadAdminUsers);const list=document.getElementById('fleboUsersList');list.addEventListener('change',updateAdminUser);list.addEventListener('click',updateAdminUser);loadAdminUsers()}
async function loadAdminUsers(){const host=document.getElementById('fleboUsersList');if(!host||currentMembership?.role!=='admin')return;try{host.innerHTML='<div class="empty-state">Consultando usuarios…</div>';const r=await adminRequest('admin-list-users');host.innerHTML=(r.users||[]).map(u=>{const protectedUser=!!u.is_primary_admin||u.user_id===currentUser?.id;const roleOptions='<option value="admin" '+(u.role==='admin'?'selected':'')+'>Administrador</option><option value="clinician" '+(u.role==='clinician'?'selected':'')+'>Supervisor clínico</option><option value="reception" '+(u.role==='reception'?'selected':'')+'>Recepción / Agenda</option><option value="technician" '+(u.role==='technician'?'selected':'')+'>Flebotomista</option><option value="viewer" '+(u.role==='viewer'?'selected':'')+'>Solo consulta</option><option value="role_custom" '+(u.role==='role_custom'?'selected':'')+'>Personalizado</option>';return '<div class="list-row" data-user-id="'+esc(u.user_id)+'"><div><strong>'+esc(u.display_name||u.username||'Usuario')+'</strong><small>@'+esc(u.username||'sin usuario')+' · '+esc(u.email||'')+(u.is_primary_admin?' · ADMINISTRADOR PRINCIPAL PROTEGIDO':'')+'</small></div><div class="list-actions">'+(protectedUser?'<span class="badge">Protegido</span>':'<select data-user-role data-current-role="'+esc(u.role)+'" aria-label="Rol del usuario">'+roleOptions+'</select><button class="btn '+(u.active?'danger':'primary')+'" data-user-active="'+(u.active?'false':'true')+'">'+(u.active?'Desactivar':'Activar')+'</button>')+'</div></div>'}).join('')||'<div class="empty-state">No hay usuarios registrados.</div>'}catch(e){host.innerHTML='<div class="empty-state">'+esc(e.message)+'</div>'}}
async function createAdminUser(){const status=document.getElementById('frUsersStatus');try{const payload={display_name:document.getElementById('frNewName').value.trim(),username:document.getElementById('frNewUsername').value.trim().toLowerCase(),email:document.getElementById('frNewEmail').value.trim().toLowerCase(),password:document.getElementById('frNewPassword').value,role:document.getElementById('frNewRole').value};if(!payload.display_name||!payload.username||!payload.email||payload.password.length<8)throw new Error('Completa todos los campos. La contraseña debe tener al menos 8 caracteres.');status.textContent='Creando cuenta y asignando permisos…';await adminRequest('admin-create-user',payload);['frNewName','frNewUsername','frNewEmail','frNewPassword'].forEach(id=>document.getElementById(id).value='');status.textContent='Usuario creado correctamente.';await loadAdminUsers()}catch(e){status.textContent=e.message}}
async function updateAdminUser(event){const control=event.target;if(control.matches('[data-user-role]')&&event.type!=='change')return;if(control.matches('[data-user-active]')&&event.type!=='click')return;if(!control.matches('[data-user-role],[data-user-active]'))return;const row=control.closest('[data-user-id]');if(!row)return;const status=document.getElementById('frUsersStatus'),isRole=control.matches('[data-user-role]'),previousRole=control.dataset.currentRole,previousActive=control.dataset.userActive;try{control.disabled=true;const payload={target_user_id:row.dataset.userId};if(isRole)payload.role=control.value;else payload.active=control.dataset.userActive==='true';await adminRequest('admin-update-user',payload);if(isRole)control.dataset.currentRole=control.value;else{const active=payload.active;control.dataset.userActive=active?'false':'true';control.textContent=active?'Desactivar':'Activar';control.classList.toggle('danger',active);control.classList.toggle('primary',!active)}if(status)status.textContent=isRole?'Rol actualizado correctamente.':'Estado del usuario actualizado.'}catch(e){if(isRole&&previousRole)control.value=previousRole;if(!isRole&&previousActive)control.dataset.userActive=previousActive;if(status)status.textContent=e.message}finally{control.disabled=false}}
function renderState(){const badge=document.getElementById('fleboAuthBadge'),form=document.getElementById('fleboAuthForm'),session=document.getElementById('fleboAuthSession'),userLabel=document.getElementById('fleboAuthUser'),role=document.getElementById('fleboAuthRole'),retry=document.getElementById('fleboAuthRetryMembership'),help=document.getElementById('fleboAuthWorkspaceHelp'),workspace=document.getElementById('hvWorkspace'),panel=document.getElementById('fleboAuthPanel'),gate=document.getElementById('fleboAuthGate');if(!badge)return;const authorized=!!(currentUser&&currentMembership&&currentMembership.active===true);if(workspace)workspace.hidden=!authorized;if(panel)panel.hidden=authorized;if(gate){gate.hidden=authorized;if(authBootComplete)gate.removeAttribute('data-checking')}document.body.classList.toggle('flebo-authenticated',authorized);if(currentUser){badge.textContent=authorized?'Sesión activa':'Cuenta autenticada';badge.style.background=authorized?'#dcfce7':'#fff0d4';badge.style.color=authorized?'#166534':'#925c00';form.hidden=true;session.hidden=false;userLabel.textContent=currentUser.user_metadata?.display_name||currentUser.user_metadata?.name||currentUser.email||'Usuario autenticado';const roleNames={admin:'Administrador',clinician:'Supervisor clínico',reception:'Recepción / Agenda',technician:'Flebotomista',viewer:'Solo consulta',role_custom:'Rol personalizado'};role.textContent=currentMembership?((currentMembership.workspaces&&currentMembership.workspaces.name)||'FleboReport')+' · Rol: '+(roleNames[currentMembership.role]||'Rol no reconocido')+(currentMembership.role==='role_custom'?' (permisos definidos por el administrador)':''):'No se ha confirmado la vinculación con el espacio de trabajo.';if(retry)retry.hidden=authorized;if(help)help.hidden=authorized;if(currentMembership&&!currentMembership.active)setStatus('Tu acceso a este espacio de trabajo está desactivado. Contacta al administrador.',true);else if(currentMembership&&!permissionsLoaded)setStatus('Verificando permisos de acceso…',true)}else{badge.textContent='Acceso requerido';badge.style.background='#fff0d4';badge.style.color='#925c00';form.hidden=false;session.hidden=true}let signout=document.getElementById('fleboGlobalSignOut');const signoutFooter=document.querySelector('#sidebar .drawer-footer');if(signout&&signoutFooter&&signout.parentElement!==signoutFooter)signoutFooter.appendChild(signout);if(signout)signout.hidden=!currentUser;if(authorized)applyAccess();window.dispatchEvent(new Event('flebo:auth-changed'))}
let bootPromise=null;function boot(){if(bootPromise)return bootPromise;bootPromise=(async()=>{installGlobalControls();mountPanel();try{await init();await refreshRegistrationMode();const {data,error}=await client.auth.getSession();if(error)throw error;await refreshSession(data.session&&data.session.user)}catch(e){setStatus(e.message,true)}finally{authBootComplete=true;renderState()}})();return bootPromise}
window.addEventListener('flebo:domicilios-mounted',()=>{mountPanel();if(!window.fleboSupabase)boot();else renderState();});const observer=new MutationObserver(()=>{if(document.getElementById('view-domicilios')){mountPanel();if(!window.fleboSupabase)boot()}});observer.observe(document.documentElement,{childList:true,subtree:true});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
window.FleboAuth={init,get client(){return client},get user(){return currentUser},get membership(){return currentMembership}};
})();