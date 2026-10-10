/**
 * Browser-safe seed handling for user-facing simulations.
 *
 * Models remain deterministic when they receive an explicit seed.  The UI can
 * call resolveSimulationSeed() for a new run: blank/auto input receives fresh
 * entropy, while a saved or typed seed is preserved byte-for-byte.
 */

export const SIMULATION_SEED_VERSION = 'swishiq-random-seed-v1';
const SEED_PATTERN = /^[A-Za-z0-9:._-]{1,80}$/;
let fallbackCounter = 0;

function hashText(value) {
  let state = 2166136261;
  for (const character of String(value)) state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  return state >>> 0;
}

function fallbackWords() {
  const now = Date.now();
  const performanceNow = typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : 0;
  const counter = fallbackCounter++;
  let state = hashText(`${now}:${performanceNow}:${counter}:${String(globalThis.location?.href || '')}`);
  const words = [];
  for (let index = 0; index < 4; index += 1) {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    words.push((value ^ (value >>> 14)) >>> 0);
  }
  return words;
}

function entropyWords() {
  const words = new Uint32Array(4);
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    try {
      globalThis.crypto.getRandomValues(words);
      return [...words];
    } catch {
      // A restricted browser context can reject getRandomValues. The bounded
      // time/performance fallback still gives each UI run a fresh seed.
    }
  }
  return fallbackWords();
}

function normalizePrefix(prefix) {
  const value = String(prefix || 'simulation').trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return (value || 'simulation').slice(0, 24);
}

export function isSimulationSeed(value) {
  return typeof value === 'string' && SEED_PATTERN.test(value.trim());
}

export function generateSimulationSeed(prefix = 'simulation') {
  const suffix = entropyWords().map(word => word.toString(16).padStart(8, '0')).join('');
  const seed = `${normalizePrefix(prefix)}-${suffix}`.slice(0, 80);
  if (!isSimulationSeed(seed)) throw new Error('The generated simulation seed was invalid.');
  return seed;
}

export function resolveSimulationSeed(value, prefix = 'simulation') {
  const candidate = typeof value === 'string' ? value.trim() : '';
  const automatic = !candidate || candidate.toLowerCase() === 'auto' || candidate.toLowerCase() === 'random';
  if (!automatic) {
    if (!isSimulationSeed(candidate)) throw new Error('Use a short alphanumeric replay seed.');
    return Object.freeze({ seed: candidate, generated: false, source: 'explicit' });
  }
  return Object.freeze({ seed: generateSimulationSeed(prefix), generated: true, source: 'random-by-default' });
}

