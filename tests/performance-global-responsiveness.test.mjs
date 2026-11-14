import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('Guardar desde otro módulo conserva el guardado inmediato sin recalcular gráficos ocultos',async()=>{
 const html=await read('index.html');
 const start=html.indexOf('function save(){');
 const end=html.indexOf('\nwindow.FleboAppState=',start);
 assert.ok(start>=0&&end>start,'Se encuentra la función real de guardado');
 const saveSource=html.slice(start,end);
 const home={classList:{contains:()=>false}};
 const count={textContent:'0'},localCount={textContent:'0'};
 const nodes={'view-home':home,patientCount:count,localPatientsCount:localCount};
 let dashboards=0,saves=0,events=0;
 const createSave=({storage={setItem:()=>saves++},active=false}={})=>{
  home.classList.contains=()=>active;
  return new Function('state','localStorage','STORAGE_KEY','refreshDashboard','$','window','Event','toast',saveSource+';return save;')(
   {patients:[{id:'p1'}]},storage,'fleboReport',
   ()=>dashboards++,id=>nodes[id],{dispatchEvent:()=>events++},Event,()=>{}
  );
 };
 assert.equal(createSave()(),true);
 assert.equal(saves,1);
 assert.equal(events,1);
 assert.equal(dashboards,0);
 assert.equal(count.textContent,'1');
 assert.equal(localCount.textContent,'1');
 assert.equal(createSave({active:true})(),true);
 assert.equal(dashboards,1);
});

test('La PWA responde con recursos versionados en caché mientras revalida sin bloquear',async()=>{
 const worker=await read('service-worker.js');
 const listeners={};
 const cached={source:'cache'};
 let resolveNetwork;
 const network=new Promise(resolve=>{resolveNetwork=resolve});
 const writes=[];
 const context={
  self:{location:{origin:'https://example.org'},addEventListener:(type,fn)=>{listeners[type]=fn}},
  caches:{match:async()=>cached,open:async()=>({put:async(req,response)=>{writes.push({req,response})}})},
  fetch:()=>network,
  URL,console,Response
 };
 vm.runInNewContext(worker,context);
 assert.equal(typeof listeners.fetch,'function');
 let responsePromise,completion;
 const request={method:'GET',url:'https://example.org/example.js?v=20261114',destination:'script'};
 listeners.fetch({request,respondWith:p=>{responsePromise=p},waitUntil:p=>{completion=p}});
 assert.equal(await responsePromise,cached,'El recurso cacheado no espera a la red');
 resolveNetwork({ok:true,clone:()=>({source:'new'}),source:'network'});
 await completion;
 assert.equal(writes.length,1,'La nueva versión se guarda para el siguiente uso');
 assert.equal(writes[0].req,request);
 assert.equal(writes[0].response.source,'new');
});

test('La caché conserva la estrategia de autenticación y las escrituras no son interceptadas',async()=>{
 const worker=await read('service-worker.js');
 assert.match(worker,/const CACHE_NAME='fleboreport-shell-v334'/);
 assert.match(worker,/if\(request.method!=='GET'\)return/);
 assert.match(worker,/url.pathname.endsWith\('\/supabase-auth.js'\)/);
 assert.match(worker,/request.mode==='navigate'/);
});
