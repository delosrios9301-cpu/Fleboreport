(function(){
'use strict';
const samples=new Map(),timers=new Map();
let pollDelay=30000,failures=0;
const MAX_SAMPLES=40,MIN_POLL=30000,MAX_POLL=180000;
function record(name,duration,ok){
 const item=samples.get(name)||{count:0,failures:0,totalMs:0,maxMs:0,lastMs:0,lastAt:null};
 const ms=Math.max(0,Number(duration)||0);
 item.count++;if(!ok)item.failures++;item.totalMs+=ms;item.maxMs=Math.max(item.maxMs,ms);item.lastMs=ms;item.lastAt=new Date().toISOString();
 samples.set(name,item);while(samples.size>MAX_SAMPLES)samples.delete(samples.keys().next().value);
}
async function measure(name,operation){
 const start=performance.now();
 try{const result=await operation();record(name,performance.now()-start,true);return result}
 catch(error){record(name,performance.now()-start,false);throw error}
}
function schedule(key,operation,delay){
 const old=timers.get(key);if(old)clearTimeout(old);
 const id=setTimeout(()=>{timers.delete(key);Promise.resolve().then(operation).catch(error=>console.error('[Flebo Engine]',key,error))},Math.max(0,delay||0));
 timers.set(key,id);return id;
}
function cancel(key){const id=timers.get(key);if(id)clearTimeout(id);timers.delete(key)}
function pollFailure(){failures++;pollDelay=Math.min(MAX_POLL,MIN_POLL*Math.pow(2,Math.min(failures,3)))}
function pollSuccess(){failures=0;pollDelay=MIN_POLL}
function diagnostics(){
 const operations={};
 samples.forEach((v,k)=>{operations[k]={count:v.count,failures:v.failures,averageMs:Math.round(v.totalMs/v.count),maxMs:Math.round(v.maxMs),lastMs:Math.round(v.lastMs),lastAt:v.lastAt}});
 return {engine:'Flebo Engine',version:1,capturedAt:new Date().toISOString(),pollDelayMs:pollDelay,consecutiveFailures:failures,operations};
}
window.FleboEngine={measure,record,schedule,cancel,pollFailure,pollSuccess,nextPollDelay:()=>pollDelay,diagnostics};
})();