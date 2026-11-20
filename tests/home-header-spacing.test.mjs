import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('index.html');
const css=read('fleboreport-home-header-gap.css');
const legacy=read('fleboreport-forest-dashboard.css');

test('La corrección de Inicio se carga después de los temas anteriores y en el APK PWA',()=>{
 const suffix='fleboreport-home-header-gap.css?v=20261119-homegap2';
 assert.ok(html.includes(suffix));
 assert.ok(html.lastIndexOf(suffix)>html.lastIndexOf('fleboreport-menu-minimal.css'));
 assert.ok(html.lastIndexOf(suffix)>html.lastIndexOf('fleboreport-forest-dashboard.css'));
 assert.match(css,/@media screen/);
 assert.equal((css.match(/\{/g)||[]).length,(css.match(/\}/g)||[]).length);
});
test('El antiguo alto mínimo de 72px no genera franja vacía antes de Panel principal',()=>{
 assert.match(legacy,/\.hp-home-heading\s*\{[\s\S]*?min-height:0!important/);
 assert.doesNotMatch(legacy,/min-height:72px!important/);
 assert.match(css,/#view-home\.hp-layout-ready \.hp-dashboard-flow>\.hp-home-heading\s*\{[\s\S]*?min-height:0!important/);
 assert.match(css,/#view-home\.hp-layout-ready \.hp-dashboard-flow\s*\{[\s\S]*?padding-top:0!important/);
 assert.match(css,/\.content:has\(> #view-home\.active\)\s*\{[\s\S]*?padding-top:10px!important/);
});
test('Separaciones específicas en teléfono vertical y horizontal, sin alterar los demás módulos',()=>{
 assert.match(css,/@media screen and \(max-width:760px\)/);
 assert.match(css,/@media screen and \(orientation:landscape\) and \(max-height:700px\)/);
 assert.match(css,/\(pointer:coarse\)/);
 assert.match(css,/padding-top:5px!important/);
 assert.match(css,/padding-top:4px!important/);
 assert.doesNotMatch(css,/#view-journey|#view-domicilios|#view-patients|#view-settings/);
 assert.doesNotMatch(css,/(?:\.delete\(|\.insert\(|localStorage|supabase|indexedDB|display:none)/i);
});

test('La barra superior de Inicio deja de reservar 80px en el teléfono y mantiene la campana',()=>{
 assert.match(html,/fleboreport-forest-dashboard\.css\?v=20261119-homegap2/);
 assert.match(css,/#view-home\.active\)[\s\S]*?\.app-shell \.topbar\s*\{[\s\S]*?height:58px!important;min-height:58px!important;max-height:58px!important/);
 assert.match(css,/\.app-shell \.content:has\(> #view-home\.active\)\s*\{\s*padding-top:2px!important;/);
 assert.match(css,/\.topbar \.fr2-topbar-inner\s*\{[\s\S]*?height:100%!important;min-height:0!important/);
 assert.match(css,/height:54px!important;min-height:54px!important;max-height:54px!important/);
 assert.doesNotMatch(css,/\.topbar #frNotifBell\s*\{[\s\S]*?display:none/);
});
