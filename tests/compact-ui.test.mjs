import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../fleboreport-compact-unified.css',import.meta.url),'utf8');
const code=readFileSync(new URL('../fleboreport-compact-ui.js',import.meta.url),'utf8');
const targets={
 'Inicio':'#view-home',
 'Jornada':'#view-journey',
 'Domicilios':'#view-domicilios',
 'Pacientes':'#view-patients',
 'Catálogo':'#view-catalog',
 'Registro de sujetos':'#view-clinical-studies',
 'Procesamiento de muestras':'#view-clinical-processing',
 'Historial':'#view-audit',
 'Reportes':'#view-reports',
 'Notificaciones':'#frNotifPanel',
 'Configuración':'#view-settings',
 'Menú':'#sidebar'
};
test('Diseño compacto habilitado después de estilos anteriores',()=>{
 const all=[...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m=>m[1]);
 assert.match(html,/fleboreport-compact-unified\.css\?v=20261119-density1/);
 assert.match(html,/fleboreport-compact-ui\.js\?v=20261119-density1/);
 assert.ok(html.lastIndexOf('fleboreport-compact-unified.css')>html.lastIndexOf('fleboreport-v2.css'));
 assert.ok(html.lastIndexOf('fleboreport-compact-unified.css')>html.lastIndexOf('domicilios-seguimiento-exacto.css'));
 assert.ok(html.lastIndexOf('fleboreport-compact-ui.js')>html.lastIndexOf('domicilios-seguimiento-exacto.js'));
 assert.ok(all.length>=47,'Los estilos previos se conservan hasta completar la revisión visual en dispositivos');
});
test('Los doce módulos tienen ajustes de densidad con límites de accesibilidad',()=>{
 for(const [name,selector] of Object.entries(targets)){
  assert.ok(css.includes(selector),name+' no tiene una regla de diseño');
 }
 assert.match(css,/min-height:44px!important/);
 assert.match(css,/@media screen and \(max-width:760px\)/);
 assert.match(css,/@media screen and \(min-width:761px\)/);
 assert.match(css,/@media print/);
 assert.match(css,/100dvh/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/env\(safe-area-inset-bottom/);
 assert.match(css,/\.hv-ref-visit/);
 assert.match(css,/\.fr2-catalog-item\.cpr-row/);
 assert.match(css,/#clinicalQueueRows>tr>td:nth-child\(8\)/);
 assert.match(css,/#frNotifPanel \.fr-notif-item strong/);
 assert.match(css,/#view-settings\s+\.sr-setting-card/);
 assert.match(css,/\.rhr-banner>.rhr-report-art\{display:none!important/);
 assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length,'Llaves CSS equilibradas');
});
test('No se ocultan controles de seguridad ni se alteran datos o permisos desde la capa visual',()=>{
 assert.doesNotMatch(css,/\.hv-ref-actions\{[^}]*display:none/);
 assert.doesNotMatch(css,/#clinicalQueueRows>tr>td\{[^}]*display:none/);
 assert.doesNotMatch(css,/#frNotifPanel\{[^}]*display:none/);
 assert.doesNotMatch(code.replace(/\/\*[\s\S]*?\*\//g,''),/(?:localStorage|sessionStorage|supabase|\.from\(|\.insert\(|\.delete\(|\.update\()/i);
 assert.doesNotMatch(code,/\.innerHTML\s*=/);
 assert.doesNotMatch(code,/window\.(?:save|reset|delete|approve|changeStatus)\s*=/);
});
test('Títulos y paneles originales siguen en el DOM y funcionan con los mismos identificadores',()=>{
 assert.match(code,/window\.dispatchEvent\(new Event\('resize'\)\)/);
 assert.match(code,/classList\.toggle\('frc-hidden',!matches\)/);
 assert.match(code,/setAttribute\('aria-hidden'/);
 assert.match(code,/button\.setAttribute\('aria-selected'/);
 assert.match(code,/button\.addEventListener\('keydown'/);
 assert.match(code,/enhanceProcessing/);
 assert.match(code,/searchField\.classList\.add\('frc-processing-search'\)/);
 assert.match(code,/filter\.replaceWith\(details\)/);
 assert.match(code,/enhanceJourney/);
 assert.match(code,/new MutationObserver\(update\)\.observe\(originalCount/);
 assert.match(code,/window\.addEventListener\('flebo:auth-changed'/);
 assert.doesNotThrow(()=>new Function(code));
});
