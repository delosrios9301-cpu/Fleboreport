import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [html,css,js,worker]=await Promise.all([
 read('index.html'),read('inicio-premium.css'),read('inicio-premium.js'),
 read('service-worker.js')
]);
test('La fecha del panel tiene reloj SVG centrado, nunca un glifo desalineado',()=>{
 assert.match(html,/<span class="fr2-home-date-mark" aria-hidden="true"><svg class="hp-date-clock-svg"/);
 assert.match(html,/<circle cx="12" cy="12" r="9"\/>/);
 assert.match(html,/<path d="M12 7v5l3\.5 2\.5"\/>/);
 assert.doesNotMatch(html,/<span class="fr2-home-date-mark" aria-hidden="true">◷<\/span>/);
 assert.match(css,/\.fr2-home-date\.hp-date-pill \.fr2-home-date-mark svg\.hp-date-clock-svg/);
 assert.match(css,/align-items:center!important/);
 assert.match(css,/justify-content:center!important/);
 assert.match(css,/align-self:center!important/);
 assert.match(css,/line-height:0!important/);
 assert.match(css,/width:19px!important/);
 assert.match(css,/b#dashboardToday/);
});
test('El cambio se limita a la fecha en Inicio y preserva el contenido real',()=>{
 assert.match(html,/id="dashboardToday"/);
 assert.match(js,/heading\.appendChild\(date\)/);
 assert.match(html,/inicio-premium\.css\?v=20261114-inicio4/);
 assert.match(worker,/Inicio v303/);
 assert.match(worker,/'\.\/inicio-premium\.css'/);
 assert.match(css,/#view-home/);
 assert.doesNotMatch(css,/\.fr2-home-date\.hp-date-pill\s*\{[^}]*?display:none!important/);
});
