// No-op stand-in for the Base44 SDK, used only by the standalone site build
// (VITE_STANDALONE=true — see vite.config.js). The live site build must never
// ship Base44 runtime: this stub makes every SDK surface an inert value so
// hosted-only features (auth, entities, functions) simply do nothing instead
// of failing to bundle.
const noop = new Proxy(function noopFn() {}, {
  get(_target, prop) {
    if (prop === 'then') return undefined; // never a thenable — safe to await
    if (prop === Symbol.toPrimitive) return () => '';
    if (prop === 'toString' || prop === 'valueOf') return () => '';
    if (prop === 'length') return 0;
    return noop; // property chains keep producing the same inert object
  },
  apply() { return noop; },
});

// Awaited calls resolve to the same inert object; calls stay inert too.
export function createClient() { return noop; }
export function getAccessToken() { return null; }