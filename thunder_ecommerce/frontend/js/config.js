(() => {
  const localHosts = new Set(['localhost', '127.0.0.1']);
  const apiOrigin = localHosts.has(window.location.hostname)
    ? 'http://localhost:5000'
    : 'https://shopease-ecommerce-pbl-project.onrender.com';

  window.SHOP_EASE_CONFIG = Object.freeze({
    apiOrigin,
    apiBaseUrl: `${apiOrigin}/api`
  });
})();
