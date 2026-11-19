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
  assert.match(css,/\.app-shell \.topbar \.fr2-menu-toggle[\s\S]*?display:grid!important;/);
  assert.match(css,/\.module-menu-close[\s\S]*?display:grid!important;/);
});

test('Rotar cierra la barra y conserva navegación accesible en escritorio',()=>{
  assert.match(shell,/function syncLandscapeNavigation\(\)/);
  assert.match(shell,/sidebar\.classList\.remove\('open'\)/);
  assert.match(shell,/document\.body\.classList\.remove\('module-menu-open'\)/);
  assert.match(shell,/sidebar\?\.setAttribute\('aria-hidden','true'\)/);
  assert.match(shell,/sidebar\?\.setAttribute\('aria-hidden','false'\)/);
  assert.match(shell,/phoneLandscape\.addEventListener\?\.\('change',syncLandscapeNavigation\)/);
  assert.match(shell,/window\.addEventListener\('resize'/);
  assert.match(shell,/window\.toggleDrawer/);
  assert.match(shell,/!inPhoneLandscape\(\)/);
});

test('Nueva regla es la última capa CSS y solo modifica presentación del teléfono',()=>{
 const lastCss=html.lastIndexOf('fleboreport-phone-landscape.css?v=20261119-landscape1');
 assert.ok(lastCss>html.lastIndexOf('fleboreport-palette-2026.css'));
 assert.ok(lastCss>html.lastIndexOf('fleboreport-compact-unified.css'));
 assert.match(html,/fleboreport-v2-shell\.js\?v=20261119-landscape1/);
 assert.doesNotMatch(css,/@media\s+print/);
 assert.doesNotMatch(css,/\.delete\(|\.update\(|\.insert\(|localStorage|supabase|IndexedDB/i);
 assert.match(css,/body\.fr2-app-authorized/);
 assert.match(css,/#sidebar\.bubble-navigation/);
});
