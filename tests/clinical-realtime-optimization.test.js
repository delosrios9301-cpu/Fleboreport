import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../clinical-cloud-sync.js',import.meta.url),'utf8');
const start=source.indexOf('function scheduleClinicalIncrementalRefresh(){');
const end=source.indexOf('let clinicalPollTimer=',start);
assert.ok(start>=0 && end>start,'Clinical realtime scheduler must be present');

function harness(overrides={}){
 let callback;
 const calls={load:0,render:0};
 const context={
  ready:true,navigator:{onLine:true},document:{visibilityState:'visible'},
  clinicalRealtimeTimer:null,clinicalRealtimeRunning:false,clinicalRealtimeAgain:false,
  clinicalFullRefreshRunning:false,syncPromise:null,clinicalUiIsBusy:()=>false,
  setTimeout(fn){callback=fn;return 1},clearTimeout(){},
  async loadRemoteSamples(){calls.load++;return true},
  refreshClinicalViewSafely(){calls.render++},console,
  ...overrides
 };
 runInNewContext(source.slice(start,end),context);
 return {calls,context,async run(){context.scheduleClinicalIncrementalRefresh();await callback()}};
}
for(const [name,overrides] of [
 ['signed out',{ready:false}],
 ['offline',{navigator:{onLine:false}}],
 ['hidden',{document:{visibilityState:'hidden'}}],
 ['editing',{clinicalUiIsBusy:()=>true}],
 ['full refresh',{clinicalFullRefreshRunning:true}],
 ['configuration sync',{syncPromise:Promise.resolve()}]
]){
 test('clinical realtime skips '+name,async()=>{
  const h=harness(overrides);await h.run();
  assert.deepEqual(h.calls,{load:0,render:0});
 });
}
test('clinical realtime renders a changed snapshot',async()=>{
 const h=harness();await h.run();assert.deepEqual(h.calls,{load:1,render:1});
});
test('clinical realtime does not render an unchanged snapshot',async()=>{
 const h=harness({loadRemoteSamples:async()=>false});await h.run();
 assert.equal(h.calls.render,0);
});
test('clinical realtime coalesces concurrent notifications',async()=>{
 const h=harness({clinicalRealtimeRunning:true});await h.run();
 assert.equal(h.context.clinicalRealtimeAgain,true);
 assert.deepEqual(h.calls,{load:0,render:0});
});
