// Bloquea regresiones NUEVAS manteniendo visible la deuda histórica de la suite.
// Origen inmutable de referencia: scripts/legacy-test-failures.json.
// Nunca amplíes el baseline para ocultar un fallo nuevo: corrige la regresión.
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const baseline=JSON.parse(readFileSync(new URL('./legacy-test-failures.json',import.meta.url),'utf8'));
const known=new Set(baseline.known_failure_titles);
const result=spawnSync(process.execPath,['--test'],{
  encoding:'utf8',maxBuffer:64*1024*1024,timeout:180000
});
if(result.error){
 console.error('No pudo ejecutarse la suite:',result.error);
 process.exit(1);
}
const output=(result.stdout||'')+'\n'+(result.stderr||'');
const failureTitles=[...output.matchAll(/^not ok \d+ - (.+)$/gm)].map(m=>m[1].trim());
const passedTitles=new Set([...output.matchAll(/^ok \d+ - (.+)$/gm)].map(m=>m[1].trim()));
const numTests=Number(output.match(/^# tests (\d+)$/m)?.[1]||0);
const reportedFailures=Number(output.match(/^# fail (\d+)$/m)?.[1]??-1);
const newFailures=failureTitles.filter(x=>!known.has(x));
const mandatory=[
 'agenda previa se confirma por backend solo para una fecha futura de Panamá',
 'resguardos de servidor exigen autenticación, permisos y transacción identificada',
 'fecha local estricta diferencia agenda de mañana de los extras de hoy',
 'invitaciones pendientes conservan privacidad y las visitas de agenda muestran ficha completa',
 'avisos distinguen programados y extras y actualización PWA carga script nuevo'
];
const missingMandatory=mandatory.filter(x=>!passedTitles.has(x));
console.log('Total de pruebas:',numTests);
console.log('Fallos heredados ya documentados:',failureTitles.length-newFailures.length);
console.log('Regresiones nuevas:',newFailures.length);
// Conservar un diagnóstico accionable de cada fallo, incluso si es heredado.
// No emitir valores de aserciones completos: pueden incluir el código entero.
const blocks=output.split(/(?=^not ok \d+ - )/m).slice(1);
for(const block of blocks){
 const title=block.match(/^not ok \d+ - (.+)$/m)?.[1]?.trim();
 if(!title)continue;
 const location=block.match(/^\s*location: ['"]?([^\r\n'"]+)/m)?.[1]||'';
 const type=block.match(/^\s*(?:error|code): (.{1,180})$/m)?.[1]||'';
 console.log('[FALLO '+(known.has(title)?'HEREDADO':'NUEVO')+'] '+title+(location?' | '+location:'')+(type?' | '+type:''));
}
console.log('Pruebas de agenda anticipada superadas:',mandatory.length-missingMandatory.length,'/',mandatory.length);
if(newFailures.length){
 console.error('REGRESIÓN: nuevas comprobaciones fallidas:\n'+newFailures.map(x=>' - '+x).join('\n'));
}
if(missingMandatory.length){
 console.error('No aprobaron las comprobaciones obligatorias de domicilios:\n'+missingMandatory.map(x=>' - '+x).join('\n'));
}
if(numTests<577||reportedFailures!==failureTitles.length||newFailures.length||missingMandatory.length||result.signal||(!failureTitles.length&&result.status!==0)){
 console.error('Validación de regresiones RECHAZADA. Consulta la salida de la suite completa.');
 // Emitir detalle solo al fallar: evita saturar el log con millones de caracteres.
 console.error(output.slice(-20000));
 process.exit(1);
}
if(failureTitles.length)console.warn('::warning::Persisten '+failureTitles.length+' fallos conocidos de la suite histórica; no se han ocultado ni resuelto. El despliegue solo se permite porque no hay regresiones nuevas respecto al baseline anterior a esta mejora.');
else console.log('Todas las pruebas aprobaron.');
