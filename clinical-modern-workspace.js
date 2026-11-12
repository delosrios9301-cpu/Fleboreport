/* Clinical Modern Workspace 6.0
 * Presentación únicamente. Reutiliza los botones originales para respetar
 * los permisos, los controladores, los registros y la sesión activa.
 */
(function () {
  'use strict';
  const labels = {
    home:'Inicio',journey:'Jornada',patients:'Pacientes',domicilios:'Domicilios',
    catalog:'Catálogo', 'clinical-studies':'Estudios clínicos',
    'clinical-processing':'Procesamiento',reports:'Reportes',audit:'Historial',
    companies:'Empresas',settings:'Configuración'
  };
  const icons = {
    home:'<path d="m3 10 9-7 9 7v10H3zM9 20v-7h6v7"/>',
    journey:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18M8 14h3m-3 3h7"/>',
    patients:'<circle cx="12" cy="8" r="3.5"/><path d="M4.5 21c.4-4.1 2.9-6.2 7.5-6.2s7.1 2.1 7.5 6.2"/>',
    domicilios:'<path d="m3 11 9-8 9 8v10H3zM9 21v-7h6v7M9 10h6"/>',
    more:'<path d="M4 6h16M4 12h16M4 18h16"/>'
  };
  // Variante C: cuatro accesos fijos; Pacientes sigue disponible en «Más».
  const dockItems = [
    ['home','Inicio'],['journey','Jornada'],['domicilios','Domicilios'],['more','Más']
  ];
  const $ = (selector, root) => (root || document).querySelector(selector);
  function navSource(key) {
    return $('#sidebar [data-nav="' + key + '"]');
  }
  function isPermitted(key) {
    const source = navSource(key);
    if (!source) return false;
    for (let node = source; node && node.id !== 'sidebar'; node = node.parentElement) {
      if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
      if (window.getComputedStyle(node).display === 'none') return false;
    }
    return true;
  }
  function icon(type) {
    return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">' + icons[type] + '</svg>';
  }
  function go(key) {
    if (key === 'more') return;
    if (!isPermitted(key)) return;
    // Pulsar la pestaña actual no vuelve a recalcular gráficos ni listas.
    // La navegación original sigue resolviendo permisos y acciones.
    const current = activeView();
    if (current && current.id === 'view-' + key) {
      window.scrollTo(0, 0);
      return;
    }
    const original = navSource(key);
    if (original) original.click();
  }
  function toggleMenu() {
    if (typeof window.toggleDrawer === 'function') {
      window.toggleDrawer();
      return;
    }
    // Fallback al controlador original; nunca se muestra un segundo abridor.
    $('#moduleFab')?.click();
  }
  function mountDock() {
    if ($('#cmMobileDock')) return;
    const dock = document.createElement('nav');
    dock.id = 'cmMobileDock';
    dock.className = 'cm-mobile-dock no-print';
    dock.setAttribute('aria-label','Navegación principal móvil');
    dockItems.forEach(function (entry) {
      const key = entry[0], label = entry[1];
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.cmNav = key;
      button.className = 'cm-dock-button';
      button.setAttribute('aria-label', key === 'more' ? 'Abrir todos los módulos' : 'Ir a ' + label);
      if (key === 'more') {
        button.setAttribute('aria-controls','sidebar');
        button.setAttribute('aria-expanded','false');
      }
      button.innerHTML = '<span class="cm-dock-icon">' + icon(key) + '</span><span class="cm-dock-label">' + label + '</span>';
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (key === 'more') toggleMenu();
        else go(key);
        requestAnimationFrame(sync);
      });
      dock.appendChild(button);
    });
    document.body.appendChild(dock);
  }
  function mountContext() {
    const content = $('.app-shell .content');
    if (!content || $('#cmContextBar')) return;
    const bar = document.createElement('div');
    bar.className = 'cm-context-bar no-print';
    bar.id = 'cmContextBar';
    bar.innerHTML = '<div class="cm-context-glyph" aria-hidden="true">✦</div>' +
      '<div class="cm-context-titlebox"><span class="cm-context-eyebrow">FLEBOREPORT / ESPACIO CLÍNICO</span><strong id="cmContextTitle">Inicio</strong></div>';
    content.insertBefore(bar, content.firstChild);
  }
  function mountHomeLaunchpad() {
    const home = $('#view-home'), hero = home && $('.fr2-home-hero', home);
    const existingActions = hero && $('.fr2-home-actions', hero);
    if (!home || !hero || !existingActions || $('.cm-launchpad',home)) return;
    const section = document.createElement('section');
    section.className = 'cm-launchpad no-print';
    section.innerHTML = '<div class="cm-launchpad-head"><div><span>ACCESOS DIRECTOS</span><h2>¿Qué necesitas hacer?</h2></div><small>Selecciona un módulo para continuar</small></div><div class="cm-launchpad-body"></div>';
    hero.insertAdjacentElement('afterend',section);
    section.querySelector('.cm-launchpad-body').appendChild(existingActions);
    [['domicilios','Visitas a domicilio','Asignaciones y seguimiento','⌂'],
     ['clinical-processing','Procesamiento','Estado de las muestras','◫']].forEach(function (data) {
       const button = document.createElement('button');
       button.type = 'button';
       button.className = 'fr2-home-action cm-launchpad-extra';
       button.dataset.cmLaunch = data[0];
       button.innerHTML = '<span class="fr2-home-action-icon" aria-hidden="true">' + data[3] + '</span><span><b>' + data[1] + '</b><small>' + data[2] + '</small></span>';
       button.addEventListener('click',function(){go(data[0])});
       existingActions.appendChild(button);
     });
  }
  function activeView() {
    return $('.app-shell .view.active');
  }
  function sync() {
    const active = activeView();
    const key = active ? active.id.replace(/^view-/,'') : 'home';
    const label = labels[key] || key;
    const context = $('#cmContextTitle');
    if (context) context.textContent = label;
    const bar = $('#cmContextBar');
    if (bar) bar.setAttribute('data-area',key);
    document.querySelectorAll('[data-cm-nav]').forEach(function(button){
      const item = button.dataset.cmNav;
      const selected = item === key && item !== 'more';
      button.classList.toggle('is-active',selected);
      if (selected) button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
      button.hidden = item !== 'more' && !isPermitted(item);
    });
    document.querySelectorAll('[data-cm-launch]').forEach(function(button){
      button.hidden = !isPermitted(button.dataset.cmLaunch);
    });
    const onlyMenuOpener = $('#cmMobileDock [data-cm-nav="more"]');
    if (onlyMenuOpener) onlyMenuOpener.setAttribute('aria-expanded',String(!!$('#sidebar.open')));
  }
  let queued = false;
  function queueSync() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function(){queued=false;sync()});
  }
  function start() {
    if (!$('.app-shell .content') || !$('#sidebar')) return;
    // El acceso al panel en móvil vive exclusivamente en «Más» (barra inferior).
    // El botón del encabezado se elimina del DOM, no solo se esconde.
    $('#fr2MenuToggle')?.remove();
    mountContext();
    mountDock();
    mountHomeLaunchpad();
    document.body.classList.add('cm-workspace');
    queueSync();
    const content = $('.app-shell .content');
    new MutationObserver(function(changes){
      if (changes.some(function(change){return change.target.classList && change.target.classList.contains('view')})) queueSync();
    }).observe(content,{subtree:true,attributes:true,attributeFilter:['class']});
    new MutationObserver(queueSync).observe($('#sidebar'),{subtree:true,attributes:true,attributeFilter:['hidden','style','aria-hidden']});
    new MutationObserver(queueSync).observe(document.body,{attributes:true,attributeFilter:['class']});
    document.addEventListener('click',function(event){
      if (event.target.closest('#sidebar [data-nav]')) queueSync();
    });
    window.addEventListener('flebo:auth-changed',queueSync);
    window.addEventListener('resize',queueSync,{passive:true});
    window.setTimeout(queueSync,650);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
