import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
const [js,css,html,worker,reports]=await Promise.all([
 read('floating-action-panels.js'),read('floating-action-panels.css'),read('index.html'),
 read('service-worker.js'),read('reports-history-reference.js')
]);
test('El controlador modal es JavaScript válido y está conectado a la PWA',()=>{
 new vm.Script(js);
 assert.match(html,/floating-action-panels\.css\?v=20261116-floating1/);
 assert.match(html,/floating-action-panels\.js\?v=20261116-floating1/);
 assert.match(worker,/'\.\/floating-action-panels\.js'/);
 assert.match(worker,/'\.\/floating-action-panels\.css'/);
 assert.doesNotMatch(js,/\.cloneNode\(|\.from\('patients'\)|\.upsert\(|localStorage\.clear/);
});
test('Las ventanas reutilizan formularios originales y conservan su guardado',()=>{
 for(const fn of ['startNewCatalogTest','editTest','editClinicalStudy','editClinicalCatalogItem',
                   'hvSetTab','openAttentionForm','editAttention','closeAttentionForm']){
  assert.ok(js.includes("wrap('"+fn+"'"),fn);
 }
 assert.match(js,/parent\.insertBefore\(anchor,node\)/);
 assert.match(js,/scroller\.append\(node\)/);
 assert.match(js,/anchor\.parentNode\.replaceChild\(node,anchor\)/);
 assert.match(js,/closeWhenHidden:true/);
 assert.match(js,/node\.hidden=wasHidden\|\|node\.hidden/);
 assert.match(js,/dialog\.showModal/);
 assert.match(js,/dialog\.addEventListener\('cancel'/);
 assert.match(js,/viewport\.addEventListener\('resize'/);
 assert.match(js,/window\.FleboFloatingActions=\{open,close/);
});
test('Configuración administrativa tiene editores flotantes sin desplazar páginas',()=>{
 for(const id of ['settings-templates','settings-services','settings-report',
                   'fr-pane-permissions','frCreateSite','frAssignSiteBtn','frSaveSecurity']){
  assert.ok(js.includes(id),id);
 }
 assert.match(js,/makeEntry\(section,panel,'Modificar '/);
 assert.match(js,/makeEntry\(pane,group,'Administrar permisos y cargos'/);
 assert.match(js,/enhanceSecurityForms\(\)/);
 assert.match(css,/fra-create-entry/);
 assert.match(css,/fra-action-dialog \.fra-permissions-content \.fr-config-grid/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/@media\(max-width:380px\)/);
 assert.match(css,/safe-area-inset-bottom/);
});
test('Cada editor del mismo módulo obtiene su propio botón de acceso',()=>{
 assert.match(js,/let entrySerial=0/);
 assert.match(js,/const id=panel\.dataset\.fraEntry\|\|'fra-'\+\(section\.id\|\|'config'\)\+'-entry-'\+\(\+\+entrySerial\)/);
 assert.match(js,/installStaticConfiguration\(\)/);
 assert.match(js,/enhanceSecurityForms\(\)/);
 assert.match(js,/settings-templates','settings-services','settings-report/);
 assert.match(js,/if\(active\.current\?\.anchor&&!active\.current\.anchor\.isConnected\)close\(\)/);
});
test('Reportes usan ventana flotante en lugar de scroll obligatorio',()=>{
 assert.match(reports,/FleboFloatingActions\?\.open/);
 assert.match(reports,/Vista previa del reporte/);
 assert.match(reports,/onClose:\(\)=>\{details\.open=false;\}/);
});
function fakeDom(){
 let doc={readyState:'loading',activeElement:null,addEventListener(){}};
 class Node {
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.parentNode=null;
   this.hidden=false;this.open=false;this.style={setProperty(){}};this.dataset={};
   this.classes=new Set();this._className='';
   Object.defineProperty(this,'className',{get:()=>this._className,set:v=>{
    this._className=String(v||'');this.classes=new Set(this._className.split(/\s+/).filter(Boolean));
   }});
   this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c),contains:c=>this.classes.has(c)};
   this.attributes=new Map();this.listeners=new Map();this.textContent='';this.scrollTop=0;}
  get isConnected(){let n=this;while(n){if(n===doc.body)return true;n=n.parentNode;}return false}
  matches(){return true}
  closest(selector){let n=this;while(n){if(selector==='.view'&&n.classes.has('view'))return n;n=n.parentNode;}return null}
  append(...children){for(const child of children)this.appendChild(child)}
  appendChild(child){if(child.parentNode)child.remove();this.children.push(child);child.parentNode=this;return child}
  insertBefore(child,before){if(child.parentNode)child.remove();const i=this.children.indexOf(before);if(i===-1)throw Error('Missing sibling');
   this.children.splice(i,0,child);child.parentNode=this;return child}
  replaceChild(child,old){const i=this.children.indexOf(old);if(i===-1)throw Error('Missing child');
   if(child.parentNode)child.remove();this.children.splice(i,1,child);child.parentNode=this;old.parentNode=null;return old}
  remove(){if(this.parentNode){const p=this.parentNode,i=p.children.indexOf(this);if(i>=0)p.children.splice(i,1);this.parentNode=null}}
  setAttribute(k,v){this.attributes.set(k,String(v))}
  getAttribute(k){return this.attributes.get(k)||null}
  addEventListener(k,fn){this.listeners.set(k,fn)}
  querySelector(selector){
   const match=n=>(selector==='.fra-modal-scroll'&&n.classes.has('fra-modal-scroll'))||
    (selector==='.fra-modal-close'&&n.classes.has('fra-modal-close'));
   const visit=n=>{for(const child of n.children){if(match(child))return child;const x=visit(child);if(x)return x;}return null};
   return visit(this);
  }
  focus(){doc.activeElement=this}
  scrollTo(){this.scrollTop=0}
  showModal(){this.open=true}
  close(){this.open=false}
 }
 doc.body=new Node('body');
 doc.createElement=tag=>new Node(tag);
 doc.createComment=()=>new Node('#comment');
 doc.getElementById=id=>{
  const walk=n=>{if(n.id===id)return n;for(const child of n.children){const x=walk(child);if(x)return x;}return null};
  return walk(doc.body);
 };
 doc.querySelector=selector=>selector.startsWith('#')?doc.getElementById(selector.slice(1)):null;
 const view=new Node('div');view.id='view-settings';view.classes.add('view');
 const panel=new Node('section');panel.id='catalogForm';panel.classes.add('panel');
 doc.body.append(view);view.append(panel);doc.activeElement=view;
 const window={innerHeight:750};
 vm.runInNewContext(js,{document:doc,window,console},{filename:'floating-action-panels.js'});
 return {doc,window,view,panel};
}
test('Modal real de ejemplo abre arriba, restituye el mismo formulario y mantiene estado oculto',()=>{
 const {window,view,panel}=fakeDom();
 panel.hidden=true;
 assert.equal(window.FleboFloatingActions.open(panel,'Editar prueba',{owner:'view-settings'}),true);
 const dialog=view.children.find(x=>x.tagName==='DIALOG');
 assert.ok(dialog&&dialog.open,'El modal está abierto');
 assert.equal(panel.isConnected,true);
 assert.equal(panel.hidden,false);
 assert.equal(dialog.querySelector('.fra-modal-scroll').children[0],panel);
 assert.equal(window.FleboFloatingActions.activeTitle,'Editar prueba');
 window.FleboFloatingActions.close();
 assert.equal(view.children[0],panel,'Se restaura exactamente el mismo nodo');
 assert.equal(panel.hidden,true,'El panel vuelve a quedar oculto en la página');
 assert.equal(dialog.isConnected,false);
});
test('Si el guardado oculta un formulario, el cierre no lo vuelve a mostrar debajo',()=>{
 const {window,view,panel}=fakeDom();
 assert.equal(window.FleboFloatingActions.open(panel,'Nuevo registro',{owner:'view-settings'}),true);
 panel.hidden=true;
 window.FleboFloatingActions.close();
 assert.equal(view.children[0],panel);
 assert.equal(panel.hidden,true);
});
