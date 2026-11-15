/* FleboReport: comparación conservadora de órdenes de laboratorio contra
   pruebas ACTIVAS del catálogo central. No adivina pruebas ni envía datos. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.FleboHomeOrderMatch=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase('es').replace(/[\u00a0]/g,' ').replace(/[‐‑–—]/g,'-')
  .replace(/[^a-z0-9ñ+\-/. ]/g,' ').replace(/\s+/g,' ').trim();
 const cleanLine=value=>String(value||'').trim()
  .replace(/^[\s□☐✓✔•·*#-]+/,'')
  .replace(/^\d{1,4}\s*[).:\-]\s*/,'')
  .replace(/^(?:pruebas?\s+solicitadas?|examen(?:es)?\s+solicitados?|analisis\s+solicitados?)\s*:\s*/i,'')
  .trim();
 const irrelevant=/^(?:paciente|identificacion|cedula|edad|sexo|medico|doctor|orden|fecha|folio|referencia|direccion|firma|telefono|email|notas|diagnostico|observaciones|laboratorio|solicitud|muestras|indicar|indicaciones|resultados|valor de referencia|hora|preparacion|informacion)(?:\s|:|$)/;
 const reject=/\b(?:no\s+(?:solicitar|realizar|tomar)|descartar|anulado|cancelado|rechazado|negativo|no\s+indicado)\b/;
 function matchText(text,catalog,limit=240){
  const tests=(Array.isArray(catalog)?catalog:[])
   .filter(x=>x&&x.active!==false&&x.id&&x.name).map(x=>({id:String(x.id),name:String(x.name),code:String(x.code||x.codigo||x.testCode||''),n:normalize(x.name),c:normalize(x.code||x.codigo||x.testCode||'')}));
  const nameMap=new Map(),codeMap=new Map();
  for(const t of tests){
   if(t.n){const a=nameMap.get(t.n)||[];a.push(t);nameMap.set(t.n,a);}
   // Los códigos genéricos demasiado cortos pueden ser ambiguos en una orden.
   if(t.c.length>=3){const a=codeMap.get(t.c)||[];a.push(t);codeMap.set(t.c,a);}
  }
  const lines=String(text||'').split(/\r?\n/).flatMap(row=>row.split(/;\s*/));
  const found=new Map(),ambiguous=[],unmatched=[],seen=new Set();
  for(const raw of lines.slice(0,2500)){
   const candidate=cleanLine(raw);
   const n=normalize(candidate);
   if(n.length<3||n.length>125||irrelevant.test(n)||reject.test(n)||/^\d+$/.test(n)||seen.has(n))continue;
   seen.add(n);
   // 1) Igualdad exacta de nombre, 2) código exacto, 3) código + nombre.
   let matches=[...(nameMap.get(n)||[]),...(codeMap.get(n)||[])];
   if(!matches.length){
    matches=tests.filter(t=>{
     if(!t.n||t.n.length<6)return false;
     const withCode=t.c&&n===t.c+' '+t.n;
     const withNameCode=t.c&&n===t.n+' '+t.c;
     // Formatos habituales "Hemograma completo (sangre)" y "HEM - Hemograma".
     const sample=/^(?:sangre|suero|plasma|orina|heces|saliva|lcr|hisopado)$/;
     const sampleSuffix=n.startsWith(t.n+' ')&&sample.test(n.slice(t.n.length+1));
     return withCode||withNameCode||sampleSuffix;
    });
   }
   const unique=[...new Map(matches.map(t=>[t.id,t])).values()];
   if(unique.length===1){
    const t=unique[0];if(!found.has(t.id))found.set(t.id,{id:t.id,name:t.name,line:candidate,confidence:'exacta'});
   }else if(unique.length>1){
    ambiguous.push({line:candidate,names:unique.slice(0,4).map(x=>x.name)});
   }else{
    // No sugerir como examen una línea entera de identificadores/indicaciones.
    if(candidate.length>=4&&!/\b(?:https?:|www\.|@|\/\d{2,4}\/)/i.test(candidate))
     unmatched.push(candidate);
   }
  }
  return {matches:[...found.values()].slice(0,limit),
   ambiguous:ambiguous.slice(0,35),unmatched:unmatched.slice(0,50),
   examined:seen.size};
 }
 return {normalize,cleanLine,matchText};
});
