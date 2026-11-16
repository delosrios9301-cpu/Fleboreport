/* FleboReport · Lectura conservadora de órdenes médicas.
   Autoseleccionar únicamente coincidencias únicas y fiables.
   Las sugerencias por texto aproximado NUNCA se agregan sin revisión. */
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
 const canonical=value=>normalize(value).replace(/[+./-]/g,' ').replace(/\s+/g,' ').trim();
 const cleanLine=value=>String(value||'').trim()
  .replace(/^[\s□☐✓✔•·*#-]+/,'')
  .replace(/^\d{1,4}\s*[).:\-]\s*/,'')
  .replace(/^(?:pruebas?\s+solicitadas?|examen(?:es)?\s+solicitados?|analisis\s+solicitados?|laboratorio\s+clinico|pruebas?\s+de\s+laboratorio)\s*:\s*/i,'')
  .replace(/^\s*(?:examen(?:es)?|prueba(?:s)?|determinacion(?:es)?)\s*:\s*/i,'')
  .replace(/\s{2,}/g,' ').trim();
 const irrelevant=/^(?:paciente|identificacion|cedula|edad|sexo|medico|doctor|orden|fecha|folio|referencia|direccion|firma|telefono|email|notas|diagnostico|observaciones|laboratorio|solicitud|muestras|indicar|indicaciones|resultados|valor de referencia|hora|preparacion|informacion|asegurado|poliza|historia clinica)(?:\s|:|$)/;
 const reject=/\b(?:no\s+(?:solicitar|realizar|tomar|procesar)|descartar|anulado|cancelado|rechazado|negativo|no\s+indicado|suspendido)\b/;
 // Los sinónimos son únicamente para reconocer una orden, no para inferir
 // recipientes, colores, volúmenes ni características de la muestra.
 const aliases={
  'hemograma completo':['hemograma','cbc','biometria hematica','cuadro hematico'],
  'tiempo de protrombina':['tp','pt','tiempo de protrombina tp','pt inr'],
  'tiempo de tromboplastina parcial activada':['tpt','ttpa','aptt','ptt','tiempo parcial de tromboplastina'],
  'hemoglobina glicosilada':['hba1c','hemoglobina glicada','glicohemoglobina','hemoglobina glucosilada'],
  'hemoglobina a1c':['hba1c'],
  'hormona estimulante de la tiroides':['tsh','tirotropina'],
  'tsh ultrasensible':['tsh'],
  'glucosa':['glicemia','glucemia'],
  'examen general de orina':['ego','uroanalisis','urinalisis','orina completa'],
  'uroanalisis':['ego','examen general de orina','urinalisis'],
  'urocultivo':['cultivo de orina','cultivo urinario'],
  'aspartato aminotransferasa':['ast','tgo','transaminasa glutamico oxalacetica'],
  'alanina aminotransferasa':['alt','tgp','transaminasa glutamico piruvica'],
  'proteina c reactiva':['pcr cuantitativa','crp'],
  'trigliceridos':['tg'],
  'colesterol hdl':['hdl'],
  'colesterol ldl':['ldl'],
  'antigeno prostatico especifico':['psa'],
  'eritrosedimentacion':['vsg','velocidad de sedimentacion globular'],
  'velocidad de sedimentacion globular':['vsg','eritrosedimentacion'],
  'gonadotropina corionica humana':['hcg']
 };
 function variants(name){
  const n=canonical(name),s=new Set([n]);
  // No retirar partes clínicas como «libre», «total» o «cuantitativa».
  // Quitar ÚNICAMENTE abreviaturas aisladas entre paréntesis.
  s.add(n.replace(/\b(?:cbc|tp|pt|hba1c|tsh|tpt|ttpa|inr|vsg|psa)\b$/,'').trim());
  for(const [key,values] of Object.entries(aliases)){
   const isThis=n===key||n.startsWith(key+' ')||n.endsWith(' '+key);
   if(isThis)for(const a of values)s.add(canonical(a));
  }
  const parts=String(name||'').match(/\(([a-zA-Z0-9]{2,8})\)/g)||[];
  for(const a of parts){const token=canonical(a.slice(1,-1));if(token.length>=2)s.add(token);}
  return [...s].filter(Boolean);
 }
 function candidateRows(text){
  const rows=String(text||'').split(/\r?\n/);
  const all=[];
  for(const line of rows.slice(0,3500)){
   const clean=String(line||'').trim();
   if(clean)all.push(clean);
   // Sólo dividir listas con separadores explícitos, no frases largas arbitrarias.
   if(/[;,|]/.test(clean)){
    const pieces=clean.split(/\s*[;|]\s*|,\s+(?=[A-ZÁÉÍÓÚ0-9])/);
    if(pieces.length>1&&pieces.length<=18)all.push(...pieces);
   }
   // Líneas tabuladas o con separadores largos en formularios de varias columnas.
   const chunks=clean.split(/\t+|\s{3,}/).map(x=>x.trim()).filter(Boolean);
   if(chunks.length>1&&chunks.length<=10)all.push(...chunks);
  }
  return all;
 }
 function findCandidates(text,catalog){
  const tests=(Array.isArray(catalog)?catalog:[])
   .filter(x=>x&&x.active!==false&&x.id&&x.name).map(x=>({
    id:String(x.id),name:String(x.name),code:String(x.code||x.codigo||x.testCode||''),
    n:canonical(x.name),c:canonical(x.code||x.codigo||x.testCode||''),
    variants:variants(x.name)
   }));
  const index=new Map();
  const add=(term,test)=>{
   if(!term||term.length<2)return;
   let entries=index.get(term);
   if(!entries){entries=new Map();index.set(term,entries);}
   entries.set(test.id,test);
  };
  for(const t of tests){
   for(const key of t.variants)add(key,t);
   if(t.c.length>=3||['tp','pt','tpt','cbc','bh','tgo','tgp','tsh','hcg','psa'].includes(t.c))add(t.c,t);
  }
  const found=new Map(),ambiguous=[],unmatched=[],suggestions=[],seen=new Set();
  for(const raw of candidateRows(text)){
   const candidate=cleanLine(raw);
   const n=normalize(candidate),cn=canonical(candidate);
   if(n.length<2||n.length>130||irrelevant.test(n)||reject.test(n)||/^\d+$/.test(n)||seen.has(cn))continue;
   seen.add(cn);
   // 1) nombre o sigla exacta única; 2) código + nombre en una misma línea.
   const possibilities=new Map(index.get(cn)||[]);
   if(!possibilities.size){
    const exactPieces=cn.split(/\s*[-:]\s*/).filter(Boolean);
    for(const part of exactPieces)if(index.has(part))for(const [id,item] of index.get(part))possibilities.set(id,item);
   }
   if(!possibilities.size){
    // Formato habitual «TP - Tiempo de protrombina», «HEM Hemograma».
    for(const t of tests){
     if(t.c&&(cn===t.c+' '+t.n||cn===t.n+' '+t.c||
      t.variants.some(v=>cn===t.c+' '+v||cn===v+' '+t.c))){
      possibilities.set(t.id,t);continue;
     }
     // Sigla a la izquierda y nombre exacto (p. ej. TP - Tiempo de protrombina),
     // aun cuando el código registrado sea diferente.
     const parts=cn.split(' ');
     if(parts.length>1&&t.variants.includes(parts.slice(1).join(' '))&&
        t.variants.includes(parts[0])){possibilities.set(t.id,t);continue;}
     const sample=/^(?:sangre|sangre total|suero|plasma|orina|heces|saliva|lcr|hisopado)$/;
     if(cn.startsWith(t.n+' ')&&sample.test(cn.slice(t.n.length+1)))possibilities.set(t.id,t);
    }
   }
   const unique=[...possibilities.values()];
   if(unique.length===1){
    const t=unique[0];
    if(!found.has(t.id))found.set(t.id,{id:t.id,name:t.name,line:candidate,
     confidence:index.has(cn)?'exacta':'combinada'});
   }else if(unique.length>1){
    ambiguous.push({line:candidate,names:unique.slice(0,6).map(x=>x.name)});
   }else if(candidate.length>=3&&!/\b(?:https?:|www\.|@|\/\d{2,4}\/)/i.test(candidate)){
    unmatched.push(candidate);
    // No autocargar variantes de OCR dudoso; mostrar como revisión opcional.
    if(cn.length>=7&&!/\d{3,}/.test(cn)){
     const starts=tests.filter(t=>t.n.length>=6&&(t.n.startsWith(cn)||cn.startsWith(t.n))
      &&Math.abs(t.n.length-cn.length)<=8).slice(0,4);
     if(starts.length===1)suggestions.push({line:candidate,name:starts[0].name,id:starts[0].id});
    }
   }
   if(found.size>=240)break;
  }
  return {matches:[...found.values()],ambiguous:ambiguous.slice(0,35),
   unmatched:unmatched.slice(0,60),suggestions:suggestions.slice(0,25),examined:seen.size};
 }
 function matchText(text,catalog,limit=240){
  const r=findCandidates(text,catalog);
  r.matches=r.matches.slice(0,limit);return r;
 }
 return {normalize,canonical,cleanLine,matchText};
});