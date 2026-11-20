import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../fleboreport-phone-landscape.css',import.meta.url),'utf8');
const shell=readFileSync(new URL('../fleboreport-v2-shell.js',import.meta.url),'utf8');
const media='(orientation:landscape) and (max-height:700px) and (max-width:1400px) and (pointer:coarse)';

test('Teléfono horizontal utiliza el menú temporal en vez de la barra fija desktop',()=>{
  assert.match(css,/@media screen and \(orientation:landscape\) and \(max-height:700px\)/);
  assert.ok(css.includes('(max-width:1400px) and (pointer:coarse)'));
  assert.ok(shell.includes(media),'CSS y JS usan condiciones equivalentes para la orientación');
  assert.match(css,/\.app-shell \.main[\s\S]*?margin:0!important;[\s\S]*?width:100%!important;/);
  assert.match(css,/#sidebar[\s\S]*?translateX\(-104%\)!important;/);
  assert.match(css,/#sidebar\.bubble-navigation\.open[\s\S]*?translateX\(0\)!important;/);
  assert.match(css,/#moduleFab\.module-fab[\s\S]*?display:inline-flex!important;/);
  assert.match(css,/#moduleFab\.module-fab[\s\S]*?position:fixed!important;/);
  assert.match(css,/#moduleFab\.module-fab[\s\S]*?right:max\(18px,env\(safe-area-inset-right,0px\)\)!important;/);
  assert.match(css,/#moduleFab\.module-fab[\s\S]*?bottom:max\(18px,env\(safe-area-inset-bottom,0px\)\)!important;/);
  assert.match(css,/#moduleFab\.module-fab[\s\S]*?background:rgba\(34,73,95,\.55\)!important;/);
  assert.match(css,/#moduleFab \.module-fab-label[\s\S]*?display:none!important;/);
  assert.match(css,/\.app-shell \.topbar \.fr2-menu-toggle[\s\S]*?display:none!important;/);
  assert.match(css,/#view-home>\.fr2-home-hero[\s\S]*?min-height:0!important;/);
  assert.match(css,/\.module-menu-close[\s\S]*?display:grid!important;/);
});

test('Rotar cierra la barra y conserva navegación accesible en escritorio',()=>{
  assert.match(shell,/function syncLandscapeNavigation\(\)/);
  assert.match(shell,/sidebar\?\.classList\.remove\('open'\)/);
  assert.match(shell,/document\.body\.classList\.remove\('module-menu-open'\)/);
  assert.match(shell,/sidebar\?\.setAttribute\('aria-hidden',String\(!open\)\)/);
  assert.match(shell,/const open=!!sidebar\?\.classList\.contains\('open'\)/);
  assert.match(shell,/if\(!previousPhoneLandscape\)/);
  assert.match(shell,/moduleFab'\)\?\.setAttribute\('aria-label',open\?'Cerrar menú de módulos':'Abrir menú de módulos'/);
  assert.match(shell,/sidebar\?\.setAttribute\('aria-hidden','false'\)/);
  assert.match(shell,/phoneLandscape\.addEventListener\?\.\('change',syncLandscapeNavigation\)/);
  assert.match(shell,/window\.addEventListener\('resize'/);
  assert.match(shell,/window\.toggleDrawer/);
  assert.match(shell,/!inPhoneLandscape\(\)/);
});

test('Nueva regla es la última capa CSS y solo modifica presentación del teléfono',()=>{
 const lastCss=html.lastIndexOf('fleboreport-phone-landscape.css?v=20261119-landscape4');
 assert.ok(lastCss>html.lastIndexOf('fleboreport-palette-2026.css'));
 assert.ok(lastCss>html.lastIndexOf('fleboreport-compact-unified.css'));
 assert.match(html,/fleboreport-v2-shell\.js\?v=20261119-startup5/);
 assert.doesNotMatch(css,/@media\s+print/);
 assert.doesNotMatch(css,/\.delete\(|\.update\(|\.insert\(|localStorage|supabase|IndexedDB/i);
 assert.match(css,/body\.fr2-app-authorized/);
 assert.match(css,/#sidebar\.bubble-navigation/);
});

test('El control flotante original sigue funcionando sin botones nuevos ni dependencias clínicas',()=>{
 assert.match(html,/id="moduleFab" onclick="toggleDrawer\(\)"/);
 assert.match(css,/#moduleFab\.module-fab/);
 assert.match(css,/#sidebar\.bubble-navigation\.open/);
 assert.match(shell,/new MutationObserver\(\(\)=>\{/);
 assert.match(shell,/attributeFilter:\['class'\]/);
 assert.doesNotMatch(css,/display:grid!important;place-items:center!important;\s*flex:0 0 44px!important;width:44px!important;height:44px!important;\s*min-width:44px!important;\s*\}\s*html:root body\.fr2-app-authorized \.module-fab/);
});


test('Cerrar sesión se inserta inmediatamente después del botón Configuración, no en el pie',()=>{
 assert.match(shell,/function placeSignOutAfterSettings\(\)/);
 assert.match(shell,/querySelector\('\.nav-list \[data-nav="settings"\]'\)/);
 assert.match(shell,/const signout=\$\('fleboGlobalSignOut'\)/);
 assert.match(shell,/settings\.insertAdjacentElement\('afterend',signout\)/);
 assert.match(shell,/signout\.classList\.add\('fr2-nav-signout'\)/);
 assert.match(shell,/if\(footer\)footer\.hidden=true/);
 assert.doesNotMatch(shell,/new MutationObserver\(placeSignOutAfterSettings\)/);
 assert.ok(html.indexOf('data-nav="settings"')<html.indexOf('<div class="drawer-footer">'));
 assert.match(css,/#sidebar\.bubble-navigation \.drawer-footer\[hidden\][\s\S]*?display:none!important;/);
 assert.match(css,/#fleboGlobalSignOut\.fr2-nav-signout/);
 assert.match(css,/#fleboGlobalSignOut\.fr2-nav-signout \.nav-copy/);
 assert.match(css,/#fleboGlobalSignOut\.fr2-nav-signout \.nav-icon/);
 assert.match(shell,/signout\.getAttribute\('aria-label'\)!=='Cerrar sesión'/);
});

test('El cierre de sesión no duplica botones ni altera autenticación o permisos',()=>{
 assert.match(shell,/signout\.parentElement!==settings\.parentElement/);
 assert.match(shell,/signout\.previousElementSibling!==settings/);
 assert.doesNotMatch(shell,/cloneNode\(/);
 assert.doesNotMatch(shell,/signout\.addEventListener\('click'/);
 assert.ok(css.includes('bottom:max(18px,env(safe-area-inset-bottom,0px))!important'));
 assert.doesNotMatch(css,/localStorage|indexedDB|supabase/i);
});
