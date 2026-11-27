import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const get=file=>readFile(new URL('../'+file,import.meta.url),'utf8');
const [style,html,sw,settings,domicilios,swipe,prior]=await Promise.all([
 get('fleboreport-desktop-screenshot-repair.css'),get('index.html'),
 get('service-worker.js'),get('settings-reference-panels.js'),
 get('domicilios.js'),get('domicilios-archive-swipe.css'),
 get('fleboreport-responsive-universal.css')
]);
const css=style.replace(/\/\*[\s\S]*?\*\//g,'');

test('Configuración tiene seis tarjetas reales y reglas de PC que no las comprimen',()=>{
 for(const name of ['users','companies','permissions','notifications','catalog','reset'])
  assert.match(settings,new RegExp('\\b'+name+':\\{'));
 assert.ok(settings.includes("landing.id='srSettingsHome'"));
 assert.ok(settings.includes("const cards=el('div','sr-settings-cards')"));
 assert.ok(settings.includes('landing.append(pageTitle,cards)'));
 assert.match(css,/#view-settings\.sr-settings-ready #srSettingsHome:not\(\[hidden\]\)/);
 assert.match(css,/#view-settings\.sr-settings-ready\.active\s*\{[\s\S]*?display:block!important;/);
 assert.match(css,/#srSettingsHome>\.sr-settings-cards\s*\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important;/);
 assert.match(css,/grid-auto-rows:minmax\(112px,auto\)!important;/);
 assert.match(css,/>button\.sr-setting-card:not\(\[hidden\]\)\s*\{[\s\S]*?min-height:112px!important;max-height:185px!important;/);
 assert.match(css,/\.sr-title-group h1\s*\{[\s\S]*?white-space:nowrap!important;word-break:normal!important;/);
 assert.match(css,/\.sr-card-caption strong\s*\{[\s\S]*?font-size:clamp\(16px,1\.3vw,20px\)!important/);
});
test('Configuración muestra una columna horizontal en tablets, no tarjetas verticales estrechas',()=>{
 assert.match(css,/@media screen and \(min-width:761px\) and \(max-width:1199px\)/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)!important;\s*max-width:760px!important;/);
 assert.match(css,/\.sr-settings-detail-open\s*>\.settings-section:not\(\[hidden\]\)/);
});

test('Las fichas de historial y agenda reales quedan centradas aunque haya una sola',()=>{
 assert.ok(domicilios.includes('id="hvHistoryRows" class="hv-visit-list"'));
 assert.ok(domicilios.includes('id="hvRows" class="hv-visit-list"'));
 assert.ok(domicilios.includes('class="hv-swipe-row hv-touch-swipe"'));
 assert.ok(domicilios.includes("if(!canDate&&!canOpen&&!canDelete)return card;"));
 assert.match(domicilios,/canDelete\?'<button type="button" class="hv-archive-action"/);
 assert.match(css,/#hvWorkspace\s+:is\(#hvRows,#hvHistoryRows\)\.hv-visit-list/);
 assert.match(css,/grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,320px\),380px\)\)!important/);
 assert.match(css,/justify-content:center!important;justify-items:stretch!important;/);
 assert.match(css,/width:100%!important;max-width:100%!important;min-width:0!important;/);
 assert.match(css,/>\.hv-swipe-row\s*\{[\s\S]*?max-width:380px!important;/);
});

test('Eliminar en PC es compacto y en táctil conserva el deslizamiento original',()=>{
 assert.match(swipe,/@media screen and \(pointer:coarse\)/);
 assert.match(swipe,/\.hv-swipe-row\.is-open>\.hv-swipe-content/);
 assert.match(css,/@media screen and \(min-width:761px\) and \(hover:hover\) and \(pointer:fine\)/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)!important;/);
 assert.match(css,/>button\.hv-archive-action:not\(\[hidden\]\):not\(\[aria-hidden="true"\]\)/);
 assert.match(css,/min-height:36px!important;max-height:44px!important;/);
 assert.match(css,/justify-self:end!important;grid-column:1!important;/);
 assert.match(domicilios,/cloud\.role==='admin'\|\|\(typeof window\.fleboCan==='function'&&window\.fleboCan\('domicilios','delete'\)\)/);
 assert.doesNotMatch(css,/@media screen and \(max-width:760px\)/);
});

test('Nueva capa se sirve tras layout universal, sin modificar lógica ni impresión',()=>{
 const former=html.indexOf('fleboreport-responsive-universal.css?v=20261114-layout2');
 const newCss=html.indexOf('fleboreport-desktop-screenshot-repair.css?v=20261114-repair1');
 assert.ok(former>0&&newCss>former);
 assert.match(html,/<link rel="stylesheet" href="\.\/fleboreport-desktop-screenshot-repair\.css\?v=20261114-repair1" media="screen">/);
 assert.ok(sw.includes("'./fleboreport-desktop-screenshot-repair.css'"));
 assert.match(prior,/@media screen and \(min-width:1450px\)/);
 assert.doesNotMatch(css,/@media print|\b(?:fetch\(|\.delete\(|\.remove\(|auth\.uid\(|localStorage)\b/);
 assert.doesNotMatch(css,/\.sr-setting-card\[hidden\][^{]*\{[^}]*display:(?:flex|grid)/);
});

test('Los estilos del parche están equilibrados',()=>{
 let depth=0,quote=null,comment=false;
 for(let i=0;i<style.length;i++){
  const c=style[i],n=style[i+1];
  if(comment){if(c==='*'&&n==='/'){comment=false;i++}continue}
  if(quote){if(c===quote&&style[i-1]!=='\\')quote=null;continue}
  if(c==='/'&&n==='*'){comment=true;i++;continue}
  if(c==='"'||c==="'"){quote=c;continue}
  if(c==='{')depth++;
  if(c==='}')depth--;
  assert.ok(depth>=0,'Bloque CSS sin apertura');
 }
 assert.equal(depth,0,'Bloque CSS sin cierre');
});
