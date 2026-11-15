import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const get=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [page,fix,base,auth,worker,manifest]=await Promise.all([
 get('index.html'),get('fleboreport-login-layout-fix.css'),get('fleboreport-v2.css'),
 get('supabase-auth.js'),get('service-worker.js'),get('manifest.webmanifest')
]);

test('El acceso a PC no conserva dos columnas cuando la ilustración está oculta',()=>{
 assert.match(base,/#fleboAuthPanel\{display:grid!important;grid-template-columns:minmax\(220px,\.85fr\) minmax\(320px,1fr\)/,
  'Regresión: el estilo heredado es de dos columnas');
 assert.match(auth,/\.flebo-login-art\{display:none!important\}/,
  'El acceso luminoso ya oculta la ilustración');
 assert.match(fix,/#fleboAuthGate:not\(\[hidden\]\) #fleboAuthPanel\s*\{[\s\S]*?display:flex!important;[\s\S]*?grid-template-columns:none!important;/,
  'El modal debe pasar a una columna efectiva');
 assert.match(fix,/#fleboAuthGate:not\(\[hidden\]\) \.flebo-login-card\s*\{[\s\S]*?width:min\(100%,470px\)!important;[\s\S]*?min-width:0!important;/);
 assert.match(fix,/#fleboAuthGate:not\(\[hidden\]\) #fleboAuthMount\s*\{[\s\S]*?width:min\(100%,520px\)!important;/);
});

test('El formulario y sus entradas mantienen ancho completo y sin modificar sus acciones',()=>{
 assert.match(fix,/#fleboAuthGate:not\(\[hidden\]\) :is\(\.flebo-login-heading,#fleboAuthForm,\.flebo-input-row,\.flebo-login-options,\.flebo-login-help\)\s*\{[\s\S]*?width:100%!important;/);
 assert.match(fix,/\.flebo-input-row input\s*\{[\s\S]*?flex:1 1 auto!important;[\s\S]*?min-width:0!important;/);
 assert.match(fix,/#fleboAuthSignIn\s*\{[\s\S]*?width:100%!important;/);
 assert.match(auth,/form\.addEventListener\('submit',e=>\{e\.preventDefault\(\);signIn\(\)\}\)/);
 assert.match(auth,/id="fleboAuthUsername"/);
 assert.match(auth,/id="fleboAuthPassword"/);
 assert.match(auth,/id="fleboRememberMe"/);
 assert.match(auth,/id="fleboPasswordToggle"/);
});

test('Responsive: móvil, tablet, PC y sesiones ocultas sin fuga de formularios',()=>{
 assert.match(fix,/@media \(max-width:760px\)/);
 assert.match(fix,/@media \(max-width:380px\)/);
 assert.match(fix,/#fleboAuthGate:not\(\[hidden\]\)/);
 assert.match(auth,/#fleboAuthSession\[hidden\],#fleboAuthForm\[hidden\],#fleboAuthPanel \[hidden\]\{display:none!important\}/);
 assert.doesNotMatch(fix,/\b(?:auth\.signInWithPassword|localStorage\.|fetch\(|MutationObserver)\b/);
});

test('El correctivo va después de la propuesta F en pantalla y en caché PWA',()=>{
 const theme='fleboreport-theme-f-final.css?v=20261114-f1',patch='fleboreport-login-layout-fix.css?v=20261114-login1';
 assert.ok(page.indexOf(theme)>0&&page.indexOf(patch)>page.indexOf(theme));
 assert.match(page,/<link rel="stylesheet" href="\.\/fleboreport-login-layout-fix\.css\?v=20261114-login1" media="screen">/);
 assert.ok(worker.includes("'./fleboreport-login-layout-fix.css'"));
 assert.match(page,/<meta name="theme-color" content="#2B3137">/);
 const m=JSON.parse(manifest);
 assert.equal(m.theme_color,'#2B3137');
 assert.equal(m.background_color,'#E9EEF2');
});

test('La nueva regla CSS está equilibrada y no modifica módulos ni reportes impresos',()=>{
 let depth=0;
 for(const c of fix){if(c==='{')depth++;else if(c==='}')depth--;assert.ok(depth>=0)}
 assert.equal(depth,0);
 assert.ok(fix.startsWith('/* FleboReport'));
 assert.match(fix,/@media screen\s*\{/);
 for(const forbidden of ['#view-home','#view-domicilios','#view-journey','#view-patients','#view-clinical-processing','--permission','\.delete\(']){
  assert.ok(!fix.includes(forbidden),forbidden);
 }
});
