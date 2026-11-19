import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../cedula-ocr.js', import.meta.url), 'utf8');
const start = source.indexOf('function extractQr(raw){');
const end = source.indexOf('// El puente nativo se activa', start);
assert.ok(start >= 0 && end > start, 'No se encontró extractQr');
const {extractQr,extractIdentityQr} = new Function(
  source.slice(start,end) + '\nreturn {extractQr,extractIdentityQr};'
)();

for (const separator of ['|', ';', '\n']) {
  const raw = ['8-123-456', 'ANA MARIA', 'PEREZ LOPEZ', 'F', '23/05/1998'].join(separator);
  assert.deepEqual(extractQr(raw), {
    doc: '8-123-456', name: 'ANA MARIA', last: 'PEREZ LOPEZ',
    birth: '1998-05-23', sex: 'Femenino'
  });
}
const complete = extractQr('8-123-456|LUIS|GONZALEZ|M|03-04-1990|EXTRA');
assert.equal(complete.birth, '1990-04-03');
assert.equal(complete.sex, 'Masculino');
assert.throws(() => extractQr('https://example.org'), /fue leído/);
assert.throws(() => extractQr('1-abc-3|ANA|PEREZ|F|23/05/1998'), /validar/);
console.log('Pruebas QR: 5 campos, 6 campos, separadores y rechazos correctos');


// Casos sintéticos de campos públicos de una licencia: el formato exacto
// del QR de Sertracen debe validarse con un documento real autorizado.
const identity={doc:'8-123-456',name:'ANA MARIA',last:'PEREZ LOPEZ',birth:'1998-05-23',sex:'Femenino'};
assert.deepEqual(extractIdentityQr('8-123-456|ANA MARIA|PEREZ LOPEZ|F|23/05/1998'),identity);
assert.deepEqual(extractIdentityQr('LICENCIA|CÉDULA: 8-123-456|NOMBRES: ANA MARIA|APELLIDOS: PEREZ LOPEZ|SEXO: F|FECHA NACIMIENTO: 23/05/1998|NÚMERO LICENCIA: 90001'),identity);
assert.deepEqual(extractIdentityQr('8-123-456|NOMBRES: ANA MARIA|APELLIDOS: PEREZ LOPEZ|SEXO: F|FECHA NACIMIENTO: 23/05/1998'),identity);
assert.throws(()=>extractQr('8-123-456|NOMBRES: ANA MARIA|APELLIDOS: PEREZ LOPEZ|F|23/05/1998'),/etiquetas/);
assert.deepEqual(extractIdentityQr(JSON.stringify({
  emisor:'Sertracen',cedula:'8-123-456',nombres:'ANA MARIA',apellidos:'PEREZ LOPEZ',
  fechaNacimiento:'1998-05-23',sexo:'F',numeroLicencia:'ABC123'
})),identity);
assert.deepEqual(extractIdentityQr('https://example.org/validar?cedula=8-123-456&nombres=ANA%20MARIA&apellidos=PEREZ%20LOPEZ&sexo=F&fechaNacimiento=23%2F05%2F1998'),identity);
assert.throws(()=>extractIdentityQr('https://example.org/validar?folio=90001'),/no proporciona una cédula/);
assert.throws(()=>extractIdentityQr('LICENCIA|NÚMERO LICENCIA: 90001|NOMBRES: ANA MARIA|APELLIDOS: PEREZ LOPEZ'),/no proporciona una cédula/);
assert.throws(()=>extractIdentityQr('LICENCIA|CÉDULA: 8-123-456|CÓDIGO DE CONTROL: ABC123'),/datos personales suficientes/);
assert.throws(()=>extractIdentityQr(''),/vacío/);
assert.deepEqual(extractIdentityQr('LICENCIA|CEDULA: 8-123-456|NOMBRES: ANA MARIA|APELLIDOS: PEREZ LOPEZ'),{
  doc:'8-123-456',name:'ANA MARIA',last:'PEREZ LOPEZ',birth:'',sex:''
});
assert.match(source,/Volver a escanear QR/);
assert.match(source,/Escanear cédula o licencia/);
console.log('Licencias: campos legibles, JSON, URL local, datos parciales y QR restringidos correctamente diferenciados');
