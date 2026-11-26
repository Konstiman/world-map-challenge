(() => {
  const menu = document.getElementById('main-menu');
  const retry = document.getElementById('retry-load');
  let translate = () => 'Failed to load the map. Check your connection and retry loading.';

  function showError(error) {
    console.error(error);
    document.getElementById('status').textContent = translate('loadError');
    document.getElementById('menu-status').textContent = translate('loadError');
    retry.hidden = false;
    if (!menu.open) menu.showModal();
  }

  retry.addEventListener('click', () => {
    const url = new URL(location.href);
    url.searchParams.set('reload', Date.now());
    location.replace(url.href);
  });
  menu.addEventListener('cancel', event => event.preventDefault());

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${src}`));
      document.head.append(script);
    });
  }

  // This runs outside the module graph, so even failed imports get a visible retry action.
  const timer = setTimeout(() => showError(new Error('Map startup timed out')), 10000);
  Promise.all([
    loadScript('https://cdn.jsdelivr.net/npm/d3@7'),
    loadScript('https://cdn.jsdelivr.net/npm/topojson-client@3'),
    import('./i18n.js?version=7').then(module => { translate = module.t; }),
  ])
    .then(() => import('./app.js?version=7'))
    .then(module => module.ready)
    .then(() => {
      clearTimeout(timer);
      retry.hidden = true;
    })
    .catch(error => {
      clearTimeout(timer);
      showError(error);
    });
})();
