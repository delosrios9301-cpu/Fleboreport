import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../fleboreport-palette-2026.css',import.meta.url),'utf8');
test('La paleta se aplica al final después de compactación en Android/PWA/PC',()=>{
 const palette='./fleboreport-palette-2026.css?v=20261119-palette1';
 assert.ok(html.includes(palette));
 assert.ok(html.lastIndexOf(palette)>html.lastIndexOf('fleboreport-compact-unified.css'));
 assert.ok(html.lastIndexOf(palette)>html.lastIndexOf('fleboreport-theme-f-final.css'));
 assert.match(css,/@media screen/);
 assert.equal((css.match(/\{/g)||[]).length,(css.match(/\}/g)||[]).length);
});
test('Cambios visibles de la paleta para la navegación y módulos sin perder contraste',()=>{
 for(const view of ['#view-home','#view-journey','#view-domicilios','#view-patients',
 '#view-catalog','#view-clinical-studies','#view-clinical-processing',
 '#view-audit','#view-reports','#view-settings']){
   assert.ok(css.includes(view),'Falta '+view);
 }
 for(const token of ['.app-shell .topbar','#sidebar.bubble-navigation',
 '#cmMobileDock','.hv-ref-visit','.journey-entry-panel',
 '.pp-directory-card','.fr2-catalog-item.cpr-row','.sr-setting-card',
 '#frNotifPanel']){
  assert.ok(css.includes(token),'Falta '+token);
 }
 assert.match(css,/#203947/i);
 assert.match(css,/#355D73/i);
 assert.match(css,/#FFFFFF/i);
});
test('La capa de color no cambia datos, visibilidad ni dimensiones ni alerta clínica',()=>{
 assert.doesNotMatch(css,/display\s*:\s*none/i);
 assert.doesNotMatch(css,/\b(?:min-height|max-height|height|padding|gap|font-size|grid-template|position)\s*:/i);
 assert.doesNotMatch(css,/(?:localStorage|supabase|indexedDB|\.insert\(|\.delete\(|\.update\()/i);
 assert.doesNotMatch(css,/(?:colorName|capColor|tubeColor|vesselColor|data-status=|\.status-danger|\.status-warning)/i);
 assert.doesNotMatch(css,/@media\s+print\s*\{/i);
});
