import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const dom=await readFile(new URL('../domicilios.js',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const sw=await readFile(new URL('../service-worker.js',import.meta.url),'utf8');

test('Domicilios has exactly one Nuevo domicilio button in generated markup',()=>{
 assert.equal((dom.match(/id="hvRefNew" class="hv-ref-new" hidden>＋ Nuevo domicilio<\/button>/g)||[]).length,1);
 assert.doesNotMatch(dom,/id="hvPremiumCreate"|id="hvCreateTab"/);
 assert.doesNotMatch(dom,/>\s*＋ Crear domicilio<\/button>/);
 assert.equal((dom.match(/Nuevo domicilio<\/button>/g)||[]).length,1);
});
test('the single New button keeps the existing authorized create flow',()=>{
 assert.match(dom,/if\(target\.id==='hvRefNew'\)\{setTab\('create'\);return\}/);
 assert.match(dom,/if\(createRef\)createRef\.hidden=!manager\|\|technician/);
 assert.match(dom,/if\(tab==='create'&&!['"]?\[/);
 assert.match(dom,/id="hvCreatePanel"/);
 assert.match(dom,/onclick="hvCreate\(\)"/);
 assert.doesNotThrow(()=>new Function(dom));
});
test('other sections and export remain navigable without a redundant Create tab',()=>{
 for(const section of ['Agenda y seguimiento','Historial','Calendario','Exportar CSV','Filtros y opciones'])
  assert.ok(dom.includes(section),section);
 assert.match(dom,/appendChild\(tabs\)/);
 assert.match(dom,/appendChild\(actions\)/);
 assert.doesNotMatch(dom,/hvPremiumCreate|hvCreateTab/);
});
test('version v291 delivers updated Domicilios code, not stale PWA markup',()=>{
 assert.match(html,/domicilios\.js\?v=20261112-reference3/);
 assert.match(sw,/fleboreport-shell-v315/);
});
