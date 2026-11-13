import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [html,js,css,worker,auth,config,notify]=await Promise.all([
 read('index.html'),read('settings-reference-panels.js'),read('settings-reference-panels.css'),
 read('service-worker.js'),read('supabase-auth.js'),read('configuracion.js'),
 read('notification-settings.js')
]);
test('Configuración usa exactamente seis tarjetas premium fieles a la referencia',()=>{
 for(const title of ['Usuarios','Empresas','Permisos','Notificaciones','Catálogo','Reiniciar datos']){
  assert.ok(js.includes("title:'"+title+"'"),'Debe existir tarjeta '+title);
 }
 for(const icon of ['users','building','shield','bell','layers','refresh']){
  assert.ok(js.includes("icon:'"+icon+"'"),'Debe existir icono '+icon);
 }
 assert.match(js,/sr-settings-cards/);
 assert.match(js,/sr-setting-card sr-/);
 assert.match(css,/\.sr-setting-card::after/);
 assert.match(css,/\.sr-card-icon/);
 assert.match(css,/\.sr-card-divider/);
 assert.match(css,/\.sr-card-chevron/);
 assert.match(css,/\.sr-cyan/);
 assert.match(css,/--sr-accent:#6520e1/);
 assert.match(css,/@media screen and \(max-width:760px\)/);
 assert.match(css,/@media screen and \(min-width:900px\)/);
});
test('Se reutilizan formularios y rutas sin crear datos ni eliminar acciones',()=>{
 for(const id of ['view-settings','settings-company','settings-catalog','settings-templates',
 'settings-services','settings-report','settings-data','settings-clinical-config']){
  assert.ok(html.includes('id="'+id+'"'),'Sección original '+id);
 }
 for(const id of ['fleboUsersTab','fleboUsersSection'])assert.ok(auth.includes(id));
 for(const id of ['settings-security','settings-reset','frSecurityTab','frResetTab'])assert.ok(config.includes(id));
 assert.match(notify,/frNotifyAdminTab/);
 assert.match(js,/tab\.click\(\)/);
 assert.match(js,/window\.FleboConfiguration\.open\(route\)/);
 assert.match(js,/window\.selectClinicalConfig\('studies'\)/);
 assert.match(js,/const mapping=\{/);
 assert.match(js,/source\.click\(\)/);
 assert.doesNotMatch(js,/\blocalStorage\b|\bsessionStorage\b|\bclient\.rpc\b|\bclient\.from\b/);
});
test('El control de roles impide mostrar tarjetas administrativas a no administradores',()=>{
 assert.match(js,/window\.FleboAuth\?\.membership\?\.role==='admin'/);
 assert.match(js,/if\(!admin\(\)&&paths\[key\]\?\.admin\)return false/);
 assert.match(js,/b\.hidden=!permitted\(key\)/);
 assert.match(js,/if\(!admin\(\)\|\|!tab\)return false/);
 assert.match(js,/if\(!admin\(\)\|\|!\$\('#frResetTab'\)\)return false/);
 assert.match(js,/if\(!admin\(\)\|\|!\$\('#settings-security'\)/);
});
test('Navegación a categorías conserva accesos externos y retorno a portada',()=>{
 assert.match(js,/function showHome\(\)/);
 assert.match(js,/function openCategory\(key,link,opts=\{\}\)/);
 assert.match(js,/function selectLink\(key,route,/);
 assert.match(js,/window\.navigate=wrapped/);
 assert.match(js,/onNavigate\(view,settingsTab\)/);
 assert.match(js,/clinical-config/);
 assert.match(js,/companies-module/);
 assert.match(js,/detailHeader\.addEventListener\('touchstart'/);
 assert.match(js,/detailHeader\.addEventListener\('touchend'/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/sr-settings-landing>.settings-section/);
});
test('Publicación v308 agrega recursos a PWA y los carga después del diseño clínico',()=>{
 assert.match(html,/settings-reference-panels\.css\?v=20261113-settings1/);
 assert.match(html,/settings-reference-panels\.js\?v=20261113-settings1/);
 assert.ok(html.lastIndexOf('settings-reference-panels.js')>html.lastIndexOf('clinical-reference-panels.js'));
 assert.match(worker,/fleboreport-shell-v314/);
 assert.ok(worker.includes("'./settings-reference-panels.js'"));
 assert.ok(worker.includes("'./settings-reference-panels.css'"));
 assert.doesNotThrow(()=>new Function(js));
});
