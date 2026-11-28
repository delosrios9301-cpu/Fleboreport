import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [dialogs,visits,html,worker]=await Promise.all([
 read('floating-action-panels.js'),read('domicilios.js'),
 read('index.html'),read('service-worker.js')
]);
test('Las ventanas de todos los módulos no observan ni revisan document.body en cada cambio',()=>{
 new vm.Script(dialogs);
 assert.doesNotMatch(dialogs,/observer\.observe\(document\.body,\{subtree:true/);
 assert.match(dialogs,/observer\.observe\(settingsRoot,\{subtree:true,childList:true\}\)/);
 assert.match(dialogs,/securityRefreshTimer=setTimeout\(refreshSecurityForms,100\)/);
 assert.match(dialogs,/if\(!relevant\|\|securityRefreshTimer\)return/);
 assert.match(dialogs,/closeWhenHidden:true/);
 assert.match(dialogs,/enhanceSecurityForms\(\)/);
});
test('Domicilios solo pinta agenda historial y calendario cuando el usuario los abre',()=>{
 new vm.Script(visits);
 assert.match(visits,/if\(activeTab==='agenda'&&\$\('hvRows'\)\)/);
 assert.match(visits,/if\(historyHost&&activeTab==='history'\)/);
 assert.match(visits,/if\(archiveHost&&cloud\.role==='admin'&&activeTab==='history'\)/);
 assert.match(visits,/if\(activeTab==='calendar'\)renderCalendar\(\)/);
 assert.match(visits,/if\(activeTab==='agenda'\)quickBar\.innerHTML=/);
 assert.match(visits,/if\(activeVisit&&detailOpen&&\['agenda','history'\]\.includes\(activeTab\)\)/);
 assert.match(visits,/window\.hvCreate=create/);
});
test('Pantallas invisibles no reconstruyen el catálogo durante acciones de otras vistas',()=>{
 assert.match(html,/const catalogViewActive=\$\('view-catalog'\)\?\.classList\.contains\('active'\)===true/);
 assert.match(html,/const matching=active\.filter/);
 assert.match(html,/if\(!catalogViewActive\)return false/);
 assert.match(html,/if\(catalogViewActive\)\{/);
 assert.match(html,/const detailsChanged=revision!==catalogDetailRevision/);
 assert.match(html,/function showSettings\(tab\)/);
 assert.match(html,/if\(tab==='catalog'\)renderCatalog\(\)/);
 assert.match(html,/if\(view==='catalog'\)renderCatalog\(\)/);
});
test('RenderAll prepara todas las vistas una vez y limita las reconstrucciones posteriores',()=>{
 assert.match(html,/var frInitialRenderCompleted=false/);
 assert.match(html,/if\(!frInitialRenderCompleted\)/);
 assert.match(html,/if\(view==='view-journey'\)\{/);
 assert.match(html,/if\(view==='view-home'\)refreshDashboard\(\)/);
 assert.match(html,/if\(view==='view-patients'\)renderPatients\(\)/);
 assert.match(html,/if\(view==='view-reports'\)renderReport\(\)/);
 assert.match(html,/if\(view==='view-companies'\)renderCompanies\(\)/);
 assert.match(html,/if\(view==='view-catalog'\|\|view==='view-settings'\)renderCatalog\(\)/);
 assert.ok(Number(worker.match(/const CACHE_NAME='fleboreport-shell-v(\d+)(?:-|')/)?.[1])>=322,'La generación PWA no debe retroceder respecto de v322');
});
