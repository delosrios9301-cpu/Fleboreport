import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../journey-report-letter-export.js',import.meta.url),'utf8');
const printed=[],calls=[];
const canvas=()=>{
 const values=[];
 const ctx={
  scale(){},fillRect(){},drawImage(){},save(){},restore(){},
  fillText(v){values.push(String(v))},
  measureText(v){return{width:String(v).length*6}}
 };
 const c={
  width:0,height:0,values,
  getContext(){return ctx},
  toDataURL(){return 'data:image/jpeg;base64,QUJDRA=='},
  toBlob(callback){callback(new Blob([new Uint8Array(256)],{type:'image/png'}))}
 };
 printed.push(c);
 return c;
};
const window={
 Capacitor:{isNativePlatform:()=>true,Plugins:{TalcsysDownloads:{
  share:async payload=>{calls.push(payload);return{shared:true}}
 }}}
};
const document={
 createElement:tag=>{assert.equal(tag,'canvas');return canvas()},
 getElementById:()=>null
};
runInNewContext(source,{window,document,Blob,atob,btoa,console});
const sample={
 clientName:'GRUPO TOVA',journeyDate:'2026-11-16',
 start:'10:00',end:'16:30',responsible:'Responsable de prueba',
 totalPatients:88,totalTests:88,includePatientList:true,
 tests:[{name:'HCG CUALITATIVO',count:50},{name:'ANTIDOPING',count:38}],
 patientList:Array.from({length:88},(_,i)=>({
  name:'Paciente ficticio '+(i+1),tests:['HCG CUALITATIVO']
 }))
};
for(const type of ['pdf','png']){
 const start=printed.length;
 await window.talcsysShareReport(sample,type);
 const pages=printed.slice(start).filter(c=>c.values.some(v=>v.startsWith('Página ')));
 assert.ok(pages.length>=2,'Debe haber varias páginas de '+type);
 for(const page of pages){
  assert.ok(page.values.includes('REPORTE DE JORNADA'),'Título perdido en '+type);
  assert.ok(!page.values.some(v=>/TALCSYS(?:[-\\s]*Lab)?|FleboReport/i.test(v)),
   'Aparece la marca de la app en una página de '+type);
  assert.ok(page.values.some(v=>v.startsWith('Página ')),'Falta numeración');
 }
}
assert.equal(calls.length,2);
for(const [i,type] of ['pdf','png'].entries()){
 assert.equal(calls[i].filename,'Reporte-de-jornada-2026-11-16.'+type);
 assert.equal(calls[i].mime,type==='pdf'?'application/pdf':'image/png');
 assert.ok(calls[i].base64.length>100);
}
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const patientPrint=html.split('function indReportHtml(p,only)')[1]?.split('function indPrint(')[0];
assert.ok(patientPrint,'Se encontró la plantilla del reporte de paciente');
assert.doesNotMatch(patientPrint,/TALCSYS(?:\\s*Lab)?|FleboReport/i);
assert.ok(html.includes("function archivedFileName(r,format){return'Reporte-de-jornada-"));
assert.doesNotMatch(source,/TALCSYS Lab · REPORTE DE JORNADA|TALCSYS Lab · '\\+\\(s.journeyDate/);
console.log('Correcto: páginas PDF/PNG, encabezado, pie, nombres, compartir y reporte individual sin marca.');
