import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../cedula-ocr.js', import.meta.url), 'utf8');
const start = source.indexOf('function extractQr(raw){');
const end = source.indexOf('// El puente nativo se activa', start);
assert.ok(start >= 0 && end > start, 'No se encontró extractQr');
const extractQr = new Function(source.slice(start, end) + '\nreturn extractQr;')();

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

const nativeScanner=readFileSync(new URL('../native/android/FleboQrCameraActivity.java',import.meta.url),'utf8');
const nativePlugin=readFileSync(new URL('../native/android/FleboIdScannerPlugin.java',import.meta.url),'utf8');
const androidConfig=readFileSync(new URL('../native/android/configure_android.py',import.meta.url),'utf8');
assert.match(nativeScanner,/Leer QR de la cédula/);
assert.doesNotMatch(nativeScanner,/TextRecognizer|Leer texto impreso|licencia/i);
assert.doesNotMatch(nativePlugin,/scan_mode|DOCUMENT_TEXT/);
assert.match(source,/Escanear cédula/);
assert.doesNotMatch(source,/extractIdentityQr|extractPrintedIdentity|Escanear cédula o licencia/);
// Verificar la configuración actual frente a la última versión publicada,
// sin fijar el número a una versión histórica del lector.
const ota=JSON.parse(readFileSync(new URL('../android-update.json',import.meta.url),'utf8'));
const buildCode=Number(androidConfig.match(/replace\('versionCode 1','versionCode (\d+)'\)/)?.[1]);
const buildName=androidConfig.match(/replace\('versionName "1\.0"','versionName "([\d.]+)"'\)/)?.[1];
assert.ok(Number.isInteger(buildCode)&&buildCode>=15&&buildCode>=ota.versionCode);
assert.match(buildName||'',/^\d+\.\d+(?:\.\d+)?$/);
if(buildCode===ota.versionCode)assert.equal(buildName,ota.versionName);
assert.match(androidConfig,/com\.google\.mlkit:barcode-scanning:/);
assert.equal(extractQr('8-123-456|ANA|PEREZ|F|31/02/1998').birth,'');
assert.equal(extractQr('8-123-456|ANA|PEREZ|F|29/02/2000').birth,'2000-02-29');
assert.equal(extractQr('8-123-456|ANA|PEREZ|F|23/05/1998|01/01/2026').birth,'1998-05-23');
assert.doesNotMatch(androidConfig,/text-recognition:16/);
console.log('Restauración del lector QR de cédula comprobada sin soporte de licencia');
