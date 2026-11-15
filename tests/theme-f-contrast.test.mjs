import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [index,style,worker,original]=await Promise.all([
 read('index.html'),
 read('fleboreport-theme-f-contrast.css'),
 read('service-worker.js'),
 read('fleboreport-theme-f-modules.css')
]);

const luminance=hex=>{
 const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
 const [r,g,b]=rgb.map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
 return .2126*r+.7152*g+.0722*b;
};
const contrast=(a,b)=>{
 const x=luminance(a),y=luminance(b);
 return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
};

test('La corrección supera contraste AA sobre botones de acciones y secundarios',()=>{
 assert.ok(contrast('#FFFFFF','#455C70')>=4.5,'texto blanco sobre azul de acción');
 assert.ok(contrast('#FFFFFF','#2B4153')>=4.5,'texto blanco sobre extremo de gradiente');
 assert.ok(contrast('#2B3137','#FFFFFF')>=4.5,'texto carbón sobre fondo blanco');
 assert.ok(contrast('#2B3137','#E5EDF3')>=4.5,'texto carbón sobre azul hielo suave');
 assert.ok(contrast('#FFFFFF','#8FB9D4')<4.5,'regresión detectada: texto blanco sobre azul hielo');
 assert.ok(contrast('#FFFFFF','#6E93AF')<4.5,'regresión detectada: texto blanco sobre azul grisáceo');
});

test('El botón del menú de burbujas no presenta glifo blanco sobre esfera blanca',()=>{
 assert.match(original,/#FFFFFF 0%,#F7F9FC 15%,#C6D8E5 38%,#8FB9D4 69%,#536F85 100%/);
 assert.match(style,/#sidebar\.bubble-navigation[\s\S]+?\.nav-icon\s*\{\s*color:#2B3137!important;\s*background:radial-gradient/);
 assert.match(style,/#sidebar\.bubble-navigation[\s\S]+?\.active:not\(\[hidden\]\) \.nav-icon\s*\{\s*color:#FFFFFF!important;\s*background:radial-gradient\(circle at 26% 17%,#455C70/);
});

test('Revisar acciones principales y botones de todos los módulos',()=>{
 const scopes=[
 '#view-home','#view-domicilios','#view-patients','#view-journey',
 '#view-clinical-studies','#view-clinical-processing','#view-catalog',
 '#view-settings','#view-reports','#view-audit'
 ];
 for(const token of scopes)assert.ok(style.includes(token),token+' ausente');
 for(const token of ['.btn.primary','.btn.blue','.hv-ref-new','.journey-report-button',
 '.journey-register-button','button.crx-action','.fr2-catalog-new',
 '.sr-detail-tab.is-current','.rhr-export.rhr-pdf','.pp-chip.selected',
 '#cmMobileDock','.nav-icon']){
  assert.ok(style.includes(token),token+' sin regla de contraste');
 }
 assert.match(style,/background:linear-gradient\(135deg,#455C70 0%,#2B4153 100%\)!important;/);
 assert.match(style,/color:#FFFFFF!important/);
 assert.match(style,/color:#2B3137!important/);
});

test('Acciones destructivas conservan identidad roja y texto blanco legible',()=>{
 assert.ok(contrast('#FFFFFF','#8D3446')>=4.5);
 assert.ok(contrast('#FFFFFF','#7C3948')>=4.5);
 assert.match(style,/button\.hv-archive-action,[\s\S]*?\.pp-swipe-delete\s*\{/);
 assert.match(style,/background:linear-gradient\(135deg,#8D3446,#7C3948\)!important/);
 assert.match(style,/\.btn\.danger,button\.btn\.danger/);
});

test('Corrección puramente cromática sin romper tamaños, gestos ni permisos',()=>{
 const forbidden=/(?:\{|;)\s*(?:display|visibility|position|top|right|bottom|left|inset|z-index|width|height|min-width|min-height|max-width|max-height|padding|margin|gap|grid|grid-template-columns|flex|transform|transition|animation|touch-action|pointer-events|overflow|font-size|font-family|border-radius)\s*:/i;
 assert.doesNotMatch(style,forbidden);
 assert.match(style,/@media screen\s*\{/);
 let braces=0;for(const ch of style){if(ch==='{')braces++;if(ch==='}')braces--;assert.ok(braces>=0)}
 assert.equal(braces,0);
});

test('Se instala tras la paleta F y la reparación de login en PC, Android e iPad',()=>{
 const a=index.indexOf('fleboreport-theme-f-final.css?v=20261114-f1');
 const b=index.indexOf('fleboreport-login-layout-fix.css?v=20261114-login1');
 const c=index.indexOf('fleboreport-theme-f-contrast.css?v=20261114-aa1');
 assert.ok(a>0 && b>a && c>b,'debe ser la última capa de color');
 assert.match(index,/<link rel="stylesheet" href="\.\/fleboreport-theme-f-contrast\.css\?v=20261114-aa1" media="screen">/);
 assert.ok(worker.includes("'./fleboreport-theme-f-contrast.css'"));
});
