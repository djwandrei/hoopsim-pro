import designLayer from '@/lineupLab/lineup-lab/designLayer';

const STYLES = [
  '/styles.css?v=20261001g',
  '/lineup-lab/lineup-lab.css?v=20261002c&rev=data-source-select-full-label-v1-20260930',
  '/tools/fan-tools.css?v=20261002c-fan-tools-readable-text-14px-v1',
];
let pending = null;
let generation = 0;

export async function ensureToolStyles() {
  const version = generation;
  if (!pending) pending = Promise.all(STYLES.map(href => new Promise((resolve, reject) => {
    const link = document.createElement('link');
    const timer = setTimeout(() => reject(new Error('The Lineup Lab styles could not be loaded.')), 20000);
    link.rel = 'stylesheet'; link.href = href; link.dataset.lineupLabCss = 'true';
    link.onload = () => { clearTimeout(timer); resolve(); };
    link.onerror = () => { clearTimeout(timer); reject(new Error('The Lineup Lab styles could not be loaded.')); };
    document.head.appendChild(link);
  }))).then(ensureDesignLayer).catch(error => { if (generation === version) removeToolStyles(); throw error; });
  return pending;
}

// The broadcast design layer must land in the head AFTER every site
// stylesheet, so the previous copy (if any) is dropped and re-appended last.
function ensureDesignLayer() {
  document.querySelectorAll('style[data-lineup-lab-design="true"]').forEach(style => style.remove());
  const style = document.createElement('style');
  style.dataset.lineupLabDesign = 'true';
  style.textContent = designLayer;
  document.head.appendChild(style);
}

export function removeToolStyles() {
  generation += 1;
  document.querySelectorAll('link[data-lineup-lab-css="true"]').forEach(link => link.remove());
  document.querySelectorAll('style[data-lineup-lab-design="true"]').forEach(style => style.remove());
  pending = null;
}

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