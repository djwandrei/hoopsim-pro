import { RATING_MODEL } from './bapSkills.js';
import { decodeForgeBuild, forgeBuildQuery } from './forgeReceipt.js';
const PREFIX = 'djhc:forge:v2:';
export const sessionKey = (mode, source) => `${PREFIX}${mode}:${source.entry?.packageVersion}:${RATING_MODEL}`;
export function readForgeSession(key) {
  try {
    const legacy = key.replace(RATING_MODEL, 'djhc-forge-observed-skills-v2');
    const value = JSON.parse(localStorage.getItem(key) || localStorage.getItem(legacy));
    return value?.v === 2 ? value : null;
  } catch { return null; }
}
export function saveForgeSession(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...value, v: 2 }));
    const keys = Object.keys(localStorage).filter(k => k.startsWith(PREFIX) && k !== `${PREFIX}library`);
    for (const old of keys.slice(0, Math.max(0, keys.length - 12))) if (old !== key) localStorage.removeItem(old);
  } catch { /* Drafting remains usable when browser storage is full or blocked. */ }
}
export function readForgeLibrary() {
  try { const rows = JSON.parse(localStorage.getItem(`${PREFIX}library`)); return Array.isArray(rows) ? rows.filter(r => typeof r.query === 'string' && decodeForgeBuild(`?${r.query}`)).slice(0, 20) : []; } catch { return []; }
}
export function saveForgeBuild(payload, label) {
  const query = forgeBuildQuery(payload), rows = readForgeLibrary().filter(r => r.query !== query);
  rows.unshift({ query, label: String(label || 'Forge build').slice(0, 80), at: new Date().toISOString(), year: payload.year, mode: payload.mode });
  try { localStorage.setItem(`${PREFIX}library`, JSON.stringify(rows.slice(0, 20))); return true; } catch { return false; }
}
export function newForgeSeed() {
  return globalThis.crypto?.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 4294967296);
}
