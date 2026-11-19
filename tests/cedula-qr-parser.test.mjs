import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../cedula-ocr.js', import.meta.url), 'utf8');
const start = source.indexOf('function extract(raw){');
const end = source.indexOf('// El puente nativo se activa', start);
assert.ok(start >= 0 && end > start, 'No se encontraron los lectores QR y OCR');
const {extractQr,extractIdentityQr,extractPrintedIdentity} = new Function(
  source.slice(start,end) + '\nreturn {extractQr,extractIdentityQr,extractPrintedIdentity};'
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
assert.throws(()=>extractIdentityQr('https://example.org/validar?folio=90001'),/QR es de control/);
assert.deepEqual(extractIdentityQr('LICENCIA|NÚMERO LICENCIA: 90001|NOMBRES: ANA MARIA|APELLIDOS: PEREZ LOPEZ'),{
  doc:'',name:'ANA MARIA',last:'PEREZ LOPEZ',birth:'',sex:'',_partial:true
});
assert.throws(()=>extractIdentityQr('LICENCIA|NÚMERO LICENCIA: 90001|CÓDIGO DE CONTROL: ABC123'),/QR es de control/);
assert.throws(()=>extractIdentityQr('LICENCIA|CÉDULA: 8-123-456|CÓDIGO DE CONTROL: ABC123'),/datos personales suficientes/);
assert.throws(()=>extractIdentityQr(''),/vacío/);
assert.deepEqual(extractIdentityQr('LICENCIA|CEDULA: 8-123-456|NOMBRES: ANA MARIA|APELLIDOS: PEREZ LOPEZ'),{
  doc:'8-123-456',name:'ANA MARIA',last:'PEREZ LOPEZ',birth:'',sex:''
});
assert.match(source,/Escanear otro QR/);
assert.match(source,/Escanear cédula o licencia/);
console.log('Licencias: campos legibles, JSON, URL local, datos parciales y QR restringidos correctamente diferenciados');


// La nueva alternativa OCR de Android usa únicamente el texto visible, sin
// transmitir fotografías ni registrar el contenido bruto de la licencia.
const printedLicense=[
  'REPÚBLICA DE PANAMÁ','LICENCIA DE CONDUCIR','CÉDULA 8-123-456',
  'NOMBRES','ANA MARIA','APELLIDOS','PÉREZ LÓPEZ',
  'FECHA DE NACIMIENTO 23/05/1998','SEXO F','FECHA VENCIMIENTO 23/05/2030'
].join('\n');
assert.deepEqual(extractPrintedIdentity(printedLicense),{
 doc:'8-123-456',name:'ANA MARIA',last:'PÉREZ LÓPEZ',
 birth:'1998-05-23',sex:'Femenino'
});
assert.deepEqual(extractPrintedIdentity([
 'SERTRACEN PANAMA','CEDULA: 8-123-456','NOMBRE: ANA MARIA',
 'APELLIDOS: PEREZ LOPEZ','BIRTH DATE: 1998-05-23','SEX F'
].join('\n')),identity);
const withoutBirth=extractPrintedIdentity([
 'LICENCIA DE CONDUCIR','CÉDULA 8-123-456','NOMBRES: ANA MARIA',
 'APELLIDOS: PEREZ LOPEZ','VENCE 23/05/2035'
].join('\n'));
assert.equal(withoutBirth.birth,'','La fecha de vencimiento no debe tomarse como nacimiento');
assert.equal(withoutBirth.doc,'8-123-456');
assert.equal(withoutBirth.name,'ANA MARIA');
assert.equal(withoutBirth.last,'PEREZ LOPEZ');

const nativeScanner=readFileSync(new URL('../native/android/FleboQrCameraActivity.java',import.meta.url),'utf8');
const nativePlugin=readFileSync(new URL('../native/android/FleboIdScannerPlugin.java',import.meta.url),'utf8');
const nativeBuild=readFileSync(new URL('../native/android/configure_android.py',import.meta.url),'utf8');
assert.match(nativeScanner,/looksLikeIdentityQr\(value\)/);
assert.match(nativeScanner,/if \(!looksLikeIdentityQr\(value\)\)/);
assert.match(nativeScanner,/Código de verificación detectado/);
assert.match(nativeScanner,/TextRecognition\.getClient\(TextRecognizerOptions\.DEFAULT_OPTIONS\)/);
assert.match(nativeScanner,/result\.putExtra\("ocr", text\)/);
assert.match(nativeScanner,/Leer texto impreso/);
assert.match(nativePlugin,/intent\.putExtra\("scan_mode", mode\)/);
assert.match(nativePlugin,/response\.put\("ocr", value\)/);
assert.match(nativeBuild,/com\.google\.mlkit:text-recognition:16\.0\.1/);
assert.match(nativeBuild,/versionCode 13/);
assert.match(source,/Leer texto impreso/);
assert.match(source,/response\.format==='DOCUMENT_TEXT'/);
assert.match(source,/versionCode\|\|0\)<11/);
assert.match(source,/Leer texto impreso/);
assert.match(nativeScanner,/boolean forced = captureRequested\.getAndSet\(false\)/);
assert.match(nativeScanner,/Texto detectado parcialmente/);
assert.match(nativeScanner,/boolean pairedNames/);
console.log('Lector QR y OCR local de licencia: formatos públicos y salvaguardas verificados');


const releaseWorkflow=readFileSync(new URL('../.github/workflows/android-signed-release.yml',import.meta.url),'utf8');
assert.match(releaseWorkflow,/"\$ZIPALIGN" -P 16 -f -v 4 "\$APK"/);
assert.match(releaseWorkflow,/"\$ZIPALIGN" -c -P 16 -v 4 "FleboReport-\$VERSION\.apk"/);
console.log('APK firmado: bibliotecas alineadas a 16 KiB para Android 15/16');
