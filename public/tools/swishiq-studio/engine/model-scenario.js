// Thin consumer surface for the reusable role/pool/scenario/solver layer.
// Existing model engines may import this file without coupling to each other.

export * from './scenario-contract.js?v=20260920c&rev=swishiq-engine-v1';
export * from './role-taxonomy.js?v=20260920c&rev=swishiq-engine-v1';
export * from './seeded-pool.js?v=20260920c&rev=swishiq-engine-v1';
export * from './scenario-compiler.js?v=20260920c&rev=swishiq-engine-v1';
export * from './constraint-solver.js?v=20260920c&rev=swishiq-engine-v1';
// Keep the public contract pieces on the same browser-safe import surface so
// each lab uses the identical registry, question, and capability gates.
export * from './challenge-definition-registry.js?v=20260920c&rev=swishiq-engine-v1';
export * from './question-bank-pipeline.js?v=20260920c&rev=swishiq-engine-v1';
export * from './static-package-capability-resolver.js?v=20260929b&rev=swishiq-engine-v1-registry-v3-2a6-20260929b';
// The orchestration contract keeps UI state and input vocabulary separate from
// the package-bound model contracts exported above.
export * from './game-architecture.js?v=20260920c&rev=swishiq-game-architecture-v1';
