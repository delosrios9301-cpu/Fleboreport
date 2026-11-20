import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('index.html'),auth=read('supabase-auth.js'),shell=read('fleboreport-v2-shell.js');

test('Android: primera pantalla sin cargar módulos ocultos ni eliminar información',()=>{
 const start=html.indexOf('if(!frInitialRenderCompleted){',html.indexOf('function renderAll(){'));
 const end=html.indexOf('return;',start);
 assert.ok(start>0&&end>start,'Se mantiene la rama de primer render');
 const initial=html.slice(start,end);
 assert.match(initial,/const first=document\.querySelector\('\.view\.active'\)/);
 assert.match(initial,/else refreshDashboard\(\)/);
 assert.doesNotMatch(initial,/renderCatalog\(\);renderJourneyPatientChoices\(\);renderJourneyPatients\(\);renderJourney\(\)/);
 const nav=html.slice(html.indexOf('function navigate('),html.indexOf('function toggleDrawer('));
 assert.match(nav,/if\(view==='journey'\)\{syncJourneyFormFromState\(\);renderJourneyPatientChoices\(\);renderJourneyPatients\(\);renderJourney\(\)\}/);
 assert.match(nav,/if\(view==='patients'\)renderPatients\(\)/);
 assert.match(nav,/if\(view==='catalog'\)renderCatalog\(\)/);
 assert.match(nav,/if\(view==='reports'\)renderReport\(\)/);
 assert.match(nav,/if\(view==='settings'\)\{renderCompanies\(\)/);
 assert.match(html,/flebo:cloud-state-applied/);
});

test('El inicio de sesión y navegación comparten exactamente una ubicación de Cerrar sesión',()=>{
 assert.match(auth,/function placeAuthSignoutControl\(signout\)/);
 assert.match(auth,/settings\.insertAdjacentElement\('afterend',signout\)/);
 assert.match(auth,/let signout=document\.getElementById\('fleboGlobalSignOut'\);placeAuthSignoutControl\(signout\)/);
 assert.match(shell,/function placeSignOutAfterSettings\(\)/);
 assert.doesNotMatch(shell,/new MutationObserver\(placeSignOutAfterSettings\)/);
 assert.match(shell,/if\(footer&&!footer\.hidden\)footer\.hidden=true/);
 // El nodo y su escucha original no se recrean al restaurar la sesión.
 assert.doesNotMatch(shell,/signout\.addEventListener\('click'/);
 assert.match(auth,/signout\.addEventListener\('click',signOut\)/);
 assert.doesNotMatch(auth,/if\(signout&&signoutFooter&&signout\.parentElement!==signoutFooter\)/);
});

test('La observación de montaje de autenticación termina después de encontrar Domicilios',()=>{
 assert.match(auth,/authMountObserver\.disconnect\(\)/);
 assert.match(auth,/authMountObserver\.observe\(document\.documentElement,\{childList:true,subtree:true\}\)/);
 assert.doesNotMatch(auth,/const observer=new MutationObserver\(\(\)=>\{if\(document\.getElementById\('view-domicilios'\)\)/);
 assert.match(html,/supabase-auth\.js\?v=20261119-startup2/);
 assert.match(html,/fleboreport-v2-shell\.js\?v=20261119-startup5/);
 assert.doesNotThrow(()=>new Function(auth));
 assert.doesNotThrow(()=>new Function(shell));
});
