import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const css=await readFile(new URL('../domicilios-reference.css',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const sw=await readFile(new URL('../service-worker.js',import.meta.url),'utf8');
const dom=await readFile(new URL('../domicilios.js',import.meta.url),'utf8');

test('El único Nuevo domicilio comparte acabado de cápsula con Pendientes y Aceptados',()=>{
 const start=css.indexOf('/* v292 — «Nuevo domicilio»');
 assert.ok(start>0,'No se encontró el acabado v292');
 const rules=css.slice(start);
 assert.match(rules,/:is\(\.hv-ref-new,\.hv-ref-tools-toggle\)/);
 assert.match(rules,/border-radius:999px!important/);
 assert.match(rules,/border:1px solid #d9d0f4!important/);
 assert.match(rules,/background:linear-gradient\(135deg,#fff 5%,#eeeaff 100%\)!important/);
 assert.match(rules,/box-shadow:0 3px 7px #54328c25,inset 0 1px #fff!important/);
 assert.match(rules,/min-height:44px!important/);
 assert.match(css,/\.hv-ref-pill\{/);
});
test('Alineación compacta y gestos táctiles sin afectar accesibilidad',()=>{
 const rules=css.slice(css.indexOf('/* v292 — «Nuevo domicilio»'));
 assert.match(rules,/@media\(max-width:420px\)/);
 assert.match(rules,/@media\(max-width:355px\)/);
 assert.match(rules,/:focus-visible/);
 assert.match(rules,/:active/);
 assert.match(rules,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(rules,/\.hv-ref-new\[hidden\]/);
});
test('REGRESIÓN: la clase del botón existe y coincide con el selector CSS real',()=>{
 const markup=dom.match(/<button type="button" id="hvRefNew" class="([^"]+)" hidden>＋ Nuevo domicilio<\/button>/);
 assert.ok(markup,'La clase CSS debe existir en el HTML real generado por Domicilios');
 assert.ok(markup[1].split(/\s+/).includes('hv-ref-new'),'Sin la clase el botón queda rectangular');
 assert.match(css,/#view-domicilios :is\(#hvRefNew\.hv-ref-new,#hvRefToggleTools\.hv-ref-tools-toggle\)/);
 assert.match(css,/#hvRefNew\.hv-ref-new\[hidden\]/);
 assert.match(css,/border-radius:999px!important/);
});
test('Sigue habiendo un solo botón y su flujo de creación no se modifica',()=>{
 assert.equal((dom.match(/id="hvRefNew" class="hv-ref-new" hidden>＋ Nuevo domicilio<\/button>/g)||[]).length,1);
 assert.doesNotMatch(dom,/hvPremiumCreate|hvCreateTab/);
 assert.match(dom,/if\(target\.id==='hvRefNew'\)\{setTab\('create'\);return\}/);
 assert.match(dom,/if\(createRef\)createRef\.hidden=!manager\|\|technician/);
 assert.doesNotThrow(()=>new Function(dom));
});
test('Se publica CSS renovado y caché PWA v292 sin cambiar lógica clínica',()=>{
 assert.match(html,/domicilios-reference\.css\?v=20261112-reference3" media="screen"/);
 assert.match(sw,/fleboreport-shell-v310/);
 assert.match(sw,/'\.\/domicilios-reference.css'/);
});
