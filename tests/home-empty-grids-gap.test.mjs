import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('index.html');
const js=read('inicio-premium.js');
const css=read('fleboreport-home-header-gap.css');

test('Regresión Android: Panel principal precede a los antiguos contenedores de gráficas',()=>{
  // Antes: root.appendChild(flow) colocaba el encabezado después de
  // cinco .op-grid antiguos con márgenes, generando una gran franja vacía.
  const homeMarkup=html.slice(html.indexOf('id="view-home"'),html.indexOf('id="view-journey"'));
  const wrappers=(homeMarkup.match(/class="op-grid(?: op-grid-wide)?"/g)||[]).length;
  assert.ok(wrappers>=4,'La vista original conserva varios wrappers de gráficas');
  assert.match(js,/function collapseLegacyHomeGap\(root\)/);
  assert.match(js,/child\.classList\.contains\('op-grid'\) && child\.childElementCount===0/);
  assert.match(js,/child\.remove\(\)/);
  assert.match(js,/root\.insertBefore\(flow,root\.firstElementChild\)/);
  assert.doesNotMatch(js,/root\.appendChild\(flow\)/);
  assert.match(js,/if\(root\.classList\.contains\('hp-layout-ready'\)\)\{\s*collapseLegacyHomeGap\(root\)/);
  assert.match(js,/root\.classList\.add\('hp-layout-ready'\);[\s\S]*?collapseLegacyHomeGap\(root\)/);
});

test('La capa de respaldo oculta sólo los wrappers vacíos en Inicio',()=>{
  assert.match(css,/#view-home\.hp-layout-ready > \.op-grid:empty/);
  assert.match(css,/#view-home\.hp-layout-ready > \.op-grid:not\(:has\(> \*\)\)/);
  assert.doesNotMatch(css,/#view-home\.hp-layout-ready > \.op-grid\s*\{/);
  assert.match(html,/inicio-premium\.js\?v=20261119-nogap2/);
  assert.match(html,/fleboreport-home-header-gap\.css\?v=20261119-nogap3/);
  assert.doesNotMatch(js,/localStorage|sessionStorage|supabase|\.delete\(|\.update\(/);
  assert.doesNotThrow(()=>new Function(js));
});
