import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('Las acciones autorizadas están visibles en las tarjetas sin exigir deslizamientos', async () => {
 const js = await read('domicilios.js');
 const css = await read('domicilios-archive-swipe.css');
 assert.ok(js.includes('hv-ref-manage-edit'));
 assert.ok(js.includes('✎ Corregir fecha y hora'));
 assert.ok(js.includes('canEditVisit(v)?'));
 assert.ok(js.includes('hv-ref-manage-archive'));
 assert.ok(js.includes('canArchiveVisit(v)?'));
 assert.ok(js.includes('.hv-ref-manage,input'));
 assert.ok(css.includes('hv-ref-manage>button'));
});

test('La validación de horas Android acepta valores de 12 y 24 horas', async () => {
 const js = await read('domicilios.js');
 const match = js.match(/function canonicalHomeVisitTime\(value\)\{[\s\S]*?\n\}/);
 assert.ok(match, 'Existe un normalizador de hora');
 const normal = new Function(match[0] + '; return canonicalHomeVisitTime;')();
 assert.equal(normal('6:45 a. m.'), '06:45');
 assert.equal(normal('6:45 p. m.'), '18:45');
 assert.equal(normal('18:45'), '18:45');
 assert.equal(normal('12:00 a. m.'), '00:00');
 assert.equal(normal('12:00 p. m.'), '12:00');
});

test('Persistencia y autorización se comprueban antes de confirmar el guardado', async () => {
 const js = await read('domicilios.js');
 const sql = await read('supabase/migrations/20261122095000_allow_authorized_accepted_home_visit_schedule_correction.sql');
 assert.ok(js.includes('canonicalHomeVisitDate(date.value)'));
 assert.ok(js.includes('canonicalHomeVisitTime(time.value)'));
 assert.ok(js.includes('.update(changes)'));
 assert.ok(js.includes('loadCloudVisits({forceFull:true})'));
 assert.ok(sql.includes("old.status = 'accepted'"));
 assert.ok(sql.includes("private.has_workspace_permission(old.workspace_id, 'domicilios', 'edit')"));
 assert.ok(sql.includes("private.has_workspace_permission(old.workspace_id, 'domicilios', 'manage')"));
 assert.ok(sql.includes("to_jsonb(new) - 'scheduled_at' - 'address' - 'updated_at'"));
});

test('Android 2.7 entrega assets renovados, versión 18 y firma verificada', async () => {
 const html = await read('index.html');
 const sw = await read('service-worker.js');
 const android = await read('native/android/configure_android.py');
 const workflow = await read('.github/workflows/android-release-2-5.yml');
 assert.ok(Number(html.match(/domicilios\.js\?v=(\d{8})-[^"']+/)?.[1])>=20261122);
 assert.ok(Number(html.match(/domicilios-archive-swipe\.css\?v=(\d{8})-[^"']+/)?.[1])>=20261122);
 assert.ok(Number(sw.match(/const CACHE_NAME='fleboreport-shell-v(\d+)(?:-|')/)?.[1])>=325);
 const ota=JSON.parse(await read('android-update.json'));
 const code=Number(android.match(/replace\('versionCode 1','versionCode (\d+)'\)/)?.[1]);
 const name=android.match(/replace\('versionName "1\.0"','versionName "([\d.]+)"'\)/)?.[1];
 assert.ok(code>=18&&code>=ota.versionCode);
 assert.match(name||'',/^\d+\.\d+(?:\.\d+)?$/);
 if(code===ota.versionCode)assert.equal(name,ota.versionName);
 assert.match(ota.sha256,/^[a-f0-9]{64}$/i);
 // El flujo de publicación conserva los dos alias compatibles y comprueba
 // el certificado original, la versión y el hash antes de anunciar la APK.
 assert.equal(ota.apkUrl,'https://github.com/delosrios9301-cpu/Fleboreport/releases/download/android-v'+ota.versionName+'/FleboReport-'+ota.versionName+'.apk');
 assert.ok(workflow.includes('TALCSYS-Lab-'+ota.versionName+'.apk'));
 assert.ok(workflow.includes('FleboReport-'+ota.versionName+'.apk'));
 const verify=workflow.indexOf('apksigner" verify --verbose --print-certs');
 const guard=workflow.indexOf('test -n "$CERT" && test "$CERT" = "$ORIGINAL_CERT_SHA256" ||',verify);
 const upload=workflow.indexOf('gh release upload android-v'+ota.versionName,guard);
 assert.ok(verify>=0&&guard>verify&&upload>guard,'La firma original debe verificarse antes de publicar');
 assert.ok(workflow.includes("versionCode='"+ota.versionCode+"'"));
 assert.ok(workflow.includes("versionName='"+ota.versionName+"'"));
 assert.ok(workflow.includes('sha256sum "$ASSET"'));
});
