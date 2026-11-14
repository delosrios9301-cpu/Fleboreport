import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
const js=await read('domicilios.js');
const css=await read('domicilios-archive-swipe.css');
const html=await read('index.html');

test('Cerrar Ver seguimiento desmonta únicamente el modal, sin reconstruir fichas ni agenda',()=>{
 const begin=js.indexOf('window.hvCloseDetail=event=>{');
 const end=js.indexOf(';window.hvOpenNotificationVisit=',begin);
 assert.ok(begin>=0&&end>begin);
 const source=js.slice(begin,end);
 assert.doesNotMatch(source,/render\(\)/,'El cierre no debe repintar todos los domicilios');
 let removed=0,cleared=0,hidden=false,detailOpen;
 const backdrop={remove:()=>removed++};
 const panel={replaceChildren:()=>cleared++,set hidden(value){hidden=value}};
 const mockDocument={querySelector:selector=>selector==='body > .hv-detail-backdrop'?backdrop:null};
 const window={};
 const getState=new Function('window','document','$',
  'let detailOpen=true;'+source+';return ()=>detailOpen;'
 )(window,mockDocument,id=>id==='hvDetail'?panel:null);
 const target={},different={};
 window.hvCloseDetail({target,currentTarget:different});
 assert.equal(removed,0,'Un clic interno no cierra el seguimiento');
 window.hvCloseDetail({target,currentTarget:target});
 assert.equal(getState(),false);
 assert.equal(removed,1);
 assert.equal(cleared,1);
 assert.equal(hidden,true);
 assert.doesNotThrow(()=>window.hvCloseDetail());
});

test('En móvil el control rojo sólo se muestra al deslizar o abrir la ficha',()=>{
 assert.match(css,/\.hv-swipe-row:not\(\.is-open\):not\(\.is-dragging\)>button\.hv-archive-action\{\s*visibility:hidden;opacity:0/);
 assert.match(css,/\.hv-swipe-row:is\(\.is-open,\.is-dragging\)>button\.hv-archive-action\{\s*visibility:visible;opacity:1/);
 assert.match(js,/g\.row\.classList\.add\('is-dragging'\)/);
 assert.match(js,/row\.classList\.remove\('is-dragging'\)/);
 assert.match(js,/setHomeVisitSwipe\(g\.row,g\.startedOpen\?dx<42:dx<-43\)/);
 assert.match(css,/@media screen and \(pointer:coarse\)/);
 assert.match(css,/pointer-events:none/);
});

test('Los recursos de la corrección tienen versión nueva sin modificar el servicio push',()=>{
 assert.match(html,/domicilios\.js\?v=20261114-pending1/);
 assert.match(html,/domicilios-archive-swipe\.css\?v=20261114-archive3/);
 assert.doesNotThrow(()=>new Function(js));
});
