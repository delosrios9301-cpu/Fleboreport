import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../fleboreport-menu-minimal.css',import.meta.url),'utf8');
const shell=readFileSync(new URL('../fleboreport-v2-shell.js',import.meta.url),'utf8');
const readBlock=(token)=>{
  const p=css.indexOf(token);
  assert.ok(p>=0,'Falta selector: '+token);
  const open=css.indexOf('{',p),close=css.indexOf('}',open);
  assert.ok(open>=0&&close>open);
  return css.slice(open+1,close);
};

test('El menú minimalista se carga después de todos los estilos anteriores',()=>{
  const ref='fleboreport-menu-minimal.css?v=20261119-menu-clean1';
  const position=html.lastIndexOf(ref);
  assert.ok(position>0);
  for(const prior of ['bubble-navigation-catalog.css',
    'fleboreport-palette-2026.css','fleboreport-phone-landscape.css'])
    assert.ok(position>html.lastIndexOf(prior),'El nuevo estilo debe prevalecer sobre '+prior);
  assert.equal((css.match(/\{/g)||[]).length,(css.match(/\}/g)||[]).length);
});

test('Los nombres no tienen cápsulas, contornos, sombras ni degradados, tampoco al seleccionar',()=>{
  const normal=readBlock('.nav-list button[data-nav]:not([hidden]) .nav-copy');
  const selected=readBlock('.nav-list button[data-nav].active:not([hidden]) .nav-copy');
  for(const block of [normal,selected]){
    assert.match(block,/border:0!important/);
    assert.match(block,/background:transparent!important/);
    assert.match(block,/box-shadow:none!important/);
    assert.match(block,/text-shadow:none!important/);
  }
  assert.match(normal,/color:#F4F9FC!important/);
  assert.match(selected,/color:#FFFFFF!important/);
});

test('Sólo la fila activa recibe un resaltado sutil; iconos siguen legibles y botones táctiles',()=>{
  const row=readBlock('.nav-list button[data-nav]:not([hidden]):not([disabled]):not([aria-hidden="true"])');
  const active=readBlock('.nav-list button[data-nav].active:not([hidden]),');
  const icon=readBlock('.nav-list button[data-nav]:not([hidden]) .nav-icon');
  assert.match(row,/min-height:50px!important/);
  assert.match(row,/background:transparent!important/);
  assert.match(active,/background:rgba\(224,242,249,\.16\)!important/);
  assert.match(active,/box-shadow:none!important/);
  assert.match(icon,/background:#DCEBF0!important/);
  assert.match(icon,/color:#234B60!important/);
  assert.match(css,/:focus-visible/);
});

test('Cerrar sesión permanece debajo de Configuración, también sin cuadro',()=>{
  assert.match(shell,/settings\.insertAdjacentElement\('afterend',signout\)/);
  const signout=readBlock('.nav-list .nav-group-items #fleboGlobalSignOut.fr2-nav-signout:not([hidden])');
  const label=readBlock('.nav-list .nav-group-items #fleboGlobalSignOut.fr2-nav-signout .nav-copy');
  assert.match(signout,/min-height:50px!important/);
  assert.match(signout,/background:transparent!important/);
  assert.match(signout,/border:0!important/);
  assert.match(label,/border:0!important/);
  assert.match(label,/background:transparent!important/);
  assert.match(css,/#fleboGlobalSignOut\.fr2-nav-signout\[hidden\][\s\S]*?display:none!important/);
  assert.doesNotMatch(css,/\.delete\(|\.insert\(|\.update\(|localStorage|indexedDB|supabase/);
});

test('No se cambian permisos ni se fuerza a mostrar módulos ocultos',()=>{
  assert.doesNotMatch(css,/\bdisplay\s*:\s*flex\s*!important/);
  assert.doesNotMatch(css,/\bdisplay\s*:\s*grid\s*!important/);
  assert.doesNotMatch(css,/\bdisplay\s*:\s*block\s*!important/);
  assert.doesNotMatch(css,/@media\s+print/);
});
