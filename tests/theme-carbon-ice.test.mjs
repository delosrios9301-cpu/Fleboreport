import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const get=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const files=['fleboreport-theme-f-inline.css','fleboreport-theme-f-core.css','fleboreport-theme-f-modules.css','fleboreport-theme-f-patients.css','fleboreport-theme-f-final.css'];
const [html,sw,...sheets]=await Promise.all([get('index.html'),get('service-worker.js'),...files.map(get)]);
const all=sheets.join('\n');
const norm=s=>String(s).replace(/\s+/g,' ');

test('La propuesta F se carga de última en todos los dispositivos, pero no en reportes impresos',()=>{
 let previous=html.lastIndexOf('patients-edit-modal.css');
 assert.ok(previous>0);
 for(const file of files){
  const tag='<link rel="stylesheet" href="./'+file+'?v=20261114-f1" media="screen">';
  const index=html.indexOf(tag);
  assert.ok(index>previous,file+' debe cargar después de las anteriores');
  previous=index;
  assert.ok(sw.includes("'./"+file+"'"),file+' debe estar en caché PWA');
 }
 assert.ok(html.lastIndexOf('</body>')>previous);
 const legacyTheme=html.slice(html.indexOf('<!-- Propuesta F'),html.indexOf('<!-- Referencia aprobada: bosque clínico'));
 assert.doesNotMatch(legacyTheme,/<script\b/);
});

test('Las cinco capas sólo cambian cromatismo: sin tamaños, gestos, controles ni maquetación',()=>{
 const forbidden=/(?:[;{])\s*(?:display|visibility|position|top|right|bottom|left|inset|z-index|width|height|min-width|min-height|max-width|max-height|padding|margin|gap|row-gap|column-gap|grid|grid-template-columns|grid-template-rows|flex|flex-direction|flex-wrap|align-items|justify-content|transform|transition|animation|cursor|pointer-events|touch-action|overflow|border-radius|font-size|font-family|font-weight)\s*:/i;
 for(let i=0;i<sheets.length;i++)assert.doesNotMatch(sheets[i],forbidden,files[i]);
 assert.match(all,/background:/);
 assert.match(all,/border-color:/);
 assert.match(all,/color:/);
 assert.match(all,/html:root/);
});

function braces(source){
 let depth=0,quote=null,comment=false;
 for(let i=0;i<source.length;i++){
  const c=source[i],n=source[i+1];
  if(comment){if(c==='*'&&n==='/'){comment=false;i++}continue}
  if(quote){if(c===quote&&source[i-1]!=='\\')quote=null;continue}
  if(c==='/'&&n==='*'){comment=true;i++;continue}
  if(c==='\"'||c==="'"){quote=c;continue}
  if(c==='{')depth++;
  if(c==='}')depth--;
  assert.ok(depth>=0,'Cierre CSS sin apertura');
 }
 assert.equal(depth,0,'CSS incompleto');
}
test('Las hojas de tema están estructuralmente equilibradas',()=>{
 for(const sheet of sheets)braces(sheet);
});

test('Conserva colores accesibles para texto y estados médicos',()=>{
 const final=sheets.at(-1);
 for(const shade of ['#2B3137','#6E7F8D','#8FB9D4','#E9EEF2','#FFFFFF'])assert.ok(all.includes(shade),shade);
 assert.match(final,/\.status-danger/);
 assert.match(final,/\.status-success/);
 assert.match(final,/\.status-warning/);
 assert.match(final,/\.status-error/);
 const luminance=hex=>{
  const nums=[1,3,5].map(p=>parseInt(hex.slice(p,p+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
  return .2126*nums[0]+.7152*nums[1]+.0722*nums[2];
 };
 const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
 assert.ok(contrast('#2B3137','#E9EEF2')>=7);
 assert.ok(contrast('#536F85','#FFFFFF')>=4.5);
 assert.ok(contrast('#2B3137','#8FB9D4')>=4.5);
});

test('Cobertura cromática de módulos sin eliminar sus diseños',()=>{
 for(const token of ['#view-home','#view-domicilios','#view-patients','#view-journey','#view-clinical-processing','#view-catalog','#view-settings','#view-reports','#view-audit','#sidebar']){
  assert.ok(all.includes(token),token);
 }
 assert.ok(all.includes('.hv-swipe-row'),'El gesto para eliminar domicilios conserva su capa');
});
