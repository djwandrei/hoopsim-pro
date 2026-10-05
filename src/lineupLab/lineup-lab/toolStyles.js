// The site's backend config script (window.DJ_BACKEND_CONFIG) is a live-site
// root file; the workflow's share bridge reads it after boot. Load-once.
let configPromise = null;
export async function ensureSiteConfig() {
  if (!configPromise) configPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/backend-config.js?v=20260930f';
    script.onload = () => { script.remove(); resolve(); };
    script.onerror = () => { script.remove(); reject(new Error('The Lineup Lab configuration could not be loaded.')); };
    document.head.appendChild(script);
  }).catch(error => { configPromise = null; throw error; });
  return configPromise;
}