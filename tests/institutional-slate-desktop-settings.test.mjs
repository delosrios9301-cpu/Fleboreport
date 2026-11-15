import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const file=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [theme,desktop,html,sw,settings,sidebar,previous]=await Promise.all([
 file('fleboreport-institutional-slate.css'),
 file('fleboreport-desktop-settings-center.css'),
 file('index.html'),file('service-worker.js'),
 file('settings-reference-panels.css'),file('bubble-navigation-catalog.css'),
 file('fleboreport-desktop-responsive.css')
]);

const executable=s=>s.replace(/\/\*[\s\S]*?\*\//g,'');
const colorLuminance=hex=>{
 const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
 const [r,g,b]=rgb.map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
 return .2126*r+.7152*g+.0722*b;
};
const contrast=(a,b)=>{
 const x=colorLuminance(a),y=colorLuminance(b);
 return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
};

test('La nueva paleta institucional tiene contraste WCAG AA para botones, menú y textos secundarios',()=>{
 for(const [fg,bg] of [
  ['#DCE5E9','#29343C'],['#FFFFFF','#465E6B'],
  ['#65747D','#FFFFFF'],['#29343C','#E9EFF2'],
  ['#FFFFFF','#354A56'],['#B9C7CE','#29343C']
 ])assert.ok(contrast(fg,bg)>=4.5,fg+' sobre '+bg);
 assert.match(theme,/#sidebar\.bubble-navigation/);
 assert.match(theme,/background:linear-gradient\(180deg,#29343C 0%,#303F49 100%\)!important/);
 assert.match(theme,/\.nav-icon svg\s*\{[\s\S]*?stroke:currentColor!important/);
});

test('La navegación ejecutiva conserva módulos, clics, estado activo y ocultamiento por permisos',()=>{
 const menu=executable(theme);
 assert.match(sidebar,/\.bubble-atmosphere-orb\.top/);
 assert.match(menu,/\.bubble-atmosphere,\.bubble-atmosphere-orb\)/);
 assert.match(menu,/\.nav-list button\[data-nav\]:not\(\[hidden\]\):not\(\[disabled\]\):not\(\[aria-hidden="true"\]\)/);
 assert.match(menu,/\.nav-list button\[data-nav\]\.active:not\(\[hidden\]\)/);
 for(const blocked of ['[hidden]','[aria-hidden="true"]','[disabled]']){
  assert.ok(menu.includes('button[data-nav]'+blocked),'Permiso '+blocked);
 }
 assert.match(menu,/\.nav-group:not\(\[open\]\)>\.nav-group-items\s*\{display:none!important;/);
 assert.doesNotMatch(menu,/\b(?:onclick|addEventListener|auth\.uid|localStorage|fetch\()\b/i);
});

test('Configuración en PC usa tarjetas y paneles centrados con dos columnas según el ancho',()=>{
 assert.match(settings,/#view-settings\.sr-settings-ready \.sr-settings-cards/);
 assert.match(desktop,/@media screen and \(min-width:761px\)/);
 assert.match(desktop,/#view-settings\.sr-settings-ready \.sr-settings-home:not\(\[hidden\]\)/);
 assert.match(desktop,/#view-settings\.sr-settings-ready \.sr-settings-cards\s*\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important;/);
 assert.match(desktop,/@media screen and \(min-width:761px\) and \(max-width:1199px\)/);
 assert.match(desktop,/#view-settings\.sr-settings-ready \.fr-config-grid\s*\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important;/);
 assert.match(desktop,/>\.settings-section:not\(\[hidden\]\)/);
 assert.match(desktop,/\.sr-detail-menu\s*\{[\s\S]*?flex-wrap:wrap!important;/);
});

test('El arreglo de Configuración no fuerza mostrar una vista inactiva ni secciones ocultas',()=>{
 const css=executable(desktop);
 const rootBlock=css.match(/#view-settings\.sr-settings-ready\s*\{([^{}]+)\}/);
 assert.ok(rootBlock);
 assert.doesNotMatch(rootBlock[1],/\bdisplay\s*:/,'No se debe hacer visible un módulo inactivo');
 assert.doesNotMatch(css,/\.sr-settings-home\s*\{[^}]*display:block!important/);
 assert.match(css,/\.sr-settings-home:not\(\[hidden\]\)/);
 assert.match(css,/>\.settings-section:not\(\[hidden\]\)/);
 assert.doesNotMatch(css,/\bdisplay\s*:\s*none\s*!important/);
});

test('Las fichas se centran en escritorio y conservan su contenido',()=>{
 for(const name of ['#hvRows','#hvHistoryRows','.pp-patient-cards','.crx-study-cards',
 '.crx-review-cards','.crx-process-cards','.rhr-archive-list',
 '.fr2-catalog-list','.rhr-history-list'])assert.ok(desktop.includes(name),name+' sin cobertura');
 assert.match(desktop,/grid-template-columns:repeat\(auto-fit,minmax\(290px,360px\)\)!important;/);
 assert.match(desktop,/justify-content:center!important;/);
 assert.match(desktop,/margin-inline:auto!important;/);
 assert.match(desktop,/\.app-shell \.main\s*\{[\s\S]*?width:calc\(100% - 255px\)!important;/);
 assert.match(previous,/dialog\.pp-expedient-dialog\[open\]/);
 assert.match(desktop,/dialog\.pp-expedient-dialog\[open\],dialog\.pp-patient-form-dialog\[open\]/);
});

test('Las hojas de estilo se cargan al final, versionadas y precacheadas',()=>{
 const baseline=html.indexOf('fleboreport-desktop-responsive.css?v=20261114-desktop1');
 const palette=html.indexOf('fleboreport-institutional-slate.css?v=20261114-slate1');
 const layout=html.indexOf('fleboreport-desktop-settings-center.css?v=20261114-slate1');
 assert.ok(baseline>0&&palette>baseline&&layout>palette);
 assert.ok(sw.includes("'./fleboreport-institutional-slate.css'"));
 assert.ok(sw.includes("'./fleboreport-desktop-settings-center.css'"));
 for(const name of ['fleboreport-institutional-slate.css','fleboreport-desktop-settings-center.css'])
  assert.match(html,new RegExp(name.replaceAll('.','\\.')+'\\?v=20261114-slate1" media="screen"'));
});

test('No se cambia la geometría en móvil ni los reportes impresos',()=>{
 const css=executable(desktop);
 assert.doesNotMatch(css,/@media print|@media screen and \(max-width:760px\)/);
 assert.match(css,/@media screen and \(min-width:761px\)/);
 assert.match(theme,/@media screen/);
 assert.doesNotMatch(executable(desktop),/\.nav-list button\[data-nav\]\[hidden\]\s*\{display:flex/);
 assert.doesNotMatch(executable(desktop),/\b(?:delete|archive|remove|fetch|setItem)\s*\(/);
});

test('Ambos CSS están estructuralmente equilibrados',()=>{
 for(const css of [theme,desktop]){
  let depth=0,comment=false,quote=null;
  for(let i=0;i<css.length;i++){
   const c=css[i],n=css[i+1];
   if(comment){if(c==='*'&&n==='/'){comment=false;i++}continue}
   if(quote){if(c===quote&&css[i-1]!=='\\')quote=null;continue}
   if(c==='/'&&n==='*'){comment=true;i++;continue}
   if(c==='"'||c==="'"){quote=c;continue}
   if(c==='{')depth++;
   if(c==='}')depth--;
   assert.ok(depth>=0,'Cierre CSS sin apertura');
  }
  assert.equal(depth,0,'Bloque CSS incompleto');
 }
});
