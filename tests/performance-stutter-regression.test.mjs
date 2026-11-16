import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const cut=(source,begin,end)=>{
 const a=source.indexOf(begin),b=source.indexOf(end,a+begin.length);
 assert.ok(a>=0&&b>a,'Se encontró el fragmento '+begin);
 return source.slice(a,b);
};

test('La actualización global sólo repinta el módulo visible después del montaje inicial',async()=>{
 const html=await read('index.html');
 const src=cut(html,'var frFullRenderPrimed=false;','/* v325');
 let active='view-home',calls=[];
 const methodNames=['renderCatalog','renderJourneyPatientChoices','renderJourneyPatients','renderJourney','renderReport','renderPatients','renderCompanies','refreshDashboard'];
 const mockMethods=methodNames.map(name=>()=>calls.push(name));
 const document={querySelector:()=>({id:active})};
 const renderAll=new Function(...methodNames,'document',src+';return renderAll;')(...mockMethods,document);
 renderAll();
 assert.deepEqual(calls,methodNames);
 calls=[];
 active='view-journey';renderAll();
 assert.deepEqual(calls,['renderJourneyPatientChoices','renderJourneyPatients','renderJourney']);
 calls=[];
 active='view-patients';renderAll();
 assert.deepEqual(calls,['renderPatients']);
 calls=[];
 active='view-settings';renderAll();
 assert.deepEqual(calls,['renderCatalog']);
 calls=[];
 active='view-home';renderAll();
 assert.deepEqual(calls,['refreshDashboard']);
});

test('Jornada agrupa cambios de escritura y fuerza guardado al abandonar la pantalla',async()=>{
 const html=await read('index.html');
 const src=cut(html,'var frJourneyTypingTimer=0,frJourneyTypingPending=false;','function init(){');
 let saves=0,reports=0,nextTimer=0;
 const handlers=new Map();
 const document={
  addEventListener:(type,fn)=>handlers.set(type,fn),
  querySelector:()=>({id:'view-journey'}),
  visibilityState:'visible'
 };
 const window={addEventListener:(type,fn)=>handlers.set(type,fn)};
 const pending=new Map();
 const setTimeout=(fn,delay)=>{const id=++nextTimer;pending.set(id,fn);assert.equal(delay,240);return id};
 const clearTimeout=id=>pending.delete(id);
 const instance=new Function('save','renderReport','document','window','setTimeout','clearTimeout',src+';return {queueJourneyTypingSave,flushJourneyTypingSave};')(
  ()=>{saves++;return true},()=>reports++,document,window,setTimeout,clearTimeout
 );
 instance.queueJourneyTypingSave();instance.queueJourneyTypingSave();instance.queueJourneyTypingSave();
 assert.equal(saves,0,'El tecleo no serializa todo el estado en cada pulsación');
 assert.equal(pending.size,1);
 instance.flushJourneyTypingSave();
 assert.equal(saves,1);
 assert.equal(reports,0,'No reconstruye un reporte oculto');
 assert.equal(pending.size,0);
 instance.queueJourneyTypingSave();
 document.visibilityState='hidden';
 handlers.get('visibilitychange')();
 assert.equal(saves,2,'Un cambio a segundo plano conserva el último valor');
 assert.equal(instance.flushJourneyTypingSave(),true);
 assert.equal(saves,2,'El guardado no se duplica');
 assert.ok(handlers.has('pagehide'));
 assert.ok(handlers.has('focusout'));
});

test('El indicador de almacenamiento evita serializar nuevamente el estado al dibujar Inicio',async()=>{
 const html=await read('index.html');
 assert.match(html,/var bytes=frStoredStateBytes;if\(bytes==null\)/);
 assert.doesNotMatch(html,/new Blob\(\[JSON\.stringify\(state\)\]\)\.size/);
 assert.match(html,/localStorage\.setItem\(STORAGE_KEY,JSON\.stringify\(state\)\);\s*frStoredStateBytes=null;/);
 assert.match(html,/flebo-engine\.js\?v=20261114-engine2/);
});

test('El motor detecta bloqueos del hilo principal con métricas locales sin información del paciente',async()=>{
 const src=await read('flebo-engine.js');
 let callback;
 class FakePerformanceObserver{
  constructor(handler){callback=handler}
  observe({type}){assert.equal(type,'longtask')}
 }
 const window={};
 const context={
  window,Map,Date,Math,Number,String,Array,Promise,setTimeout,clearTimeout,
  console,performance:{now:()=>2},
  PerformanceObserver:FakePerformanceObserver,
  document:{querySelector:()=>({id:'view-patients'})}
 };
 vm.runInNewContext(src,context);
 callback({getEntries:()=>[{duration:70},{duration:35},{duration:150}]});
 const d=window.FleboEngine.diagnostics();
 assert.equal(d.mainThread.supported,true);
 assert.equal(d.mainThread.count,2);
 assert.equal(d.mainThread.maxMs,150);
 assert.equal(d.mainThread.averageMs,110);
 assert.equal(d.mainThread.recent[0].module,'patients');
 assert.deepEqual(Object.keys(d.mainThread.recent[0]).sort(),['durationMs','module']);
});
