# Cycle 4: canonical shared starting-five weight-sweep contract

Read-only implementation context, 2026-10-10.

## Integration boundary

Put the shared path in `prototypes/basketball-lineup-optimizer/optimizer-core.js`, beside the existing `optimizeLineups()` / `analyzeWeightSensitivity()` APIs. The core already owns normalization, eligibility and evidence gates, normalized metrics, exact candidate ordering, and public result construction. Add one high-level batch entry point (or refactor `analyzeWeightSensitivity()` to use one); keep low-level helpers private. The worker and experiment runner should call that entry point rather than reproduce the solver.

The shared fast path is valid only when every normalized scenario is a five-player lineup and all normalized inputs except `weights` are equal. Share one preparation pass and one complete candidate enumeration, but keep one independent scoring context and top-K list per scenario. Reuse the same canonical candidate scoring and result finalization as `optimizeLineups()`. If a caller's scenarios are not compatible with the shared path, preserve the existing independent-solve behavior instead of silently dropping fields or returning a screen-only result.

## Existing boundaries and symbols

| Location | Current contract |
| --- | --- |
| `optimizer-core.js:272-372` `normalizePlayers()`; `:587-890` `normalizeConfig()` | Canonical player and config normalization. These helpers are private in the canonical source; the isolated experiment copy appends exports for them. |
| `optimizer-core.js:6919-7094` `optimizeLineups()` | Validates the inputs, establishes the hard/data eligibility pool, and emits canonical validation, evidence, and setup failures. |
| `optimizer-core.js:7048-7078`, `:7142-7247` | Separates `objectivePlayers` from selection candidates, forms the locked/available sets, prepares projection parameters, and builds normalized metrics. `:7248+` records available/unavailable metric evidence and effective weights. |
| `optimizer-core.js:7604-7770` and `:8000-8214` | Builds candidate model adjustments and evaluates feasible lineups with the canonical `calculateObjectiveScore()` path. Preserve this scorer; do not substitute the prototype's `scoreCandidate()` formula (`weight-sweep.mjs:318-340`). |
| `optimizer-core.js:6819-6849`, `:7931-7946`, `:8217-8237` | `alternativeSort()` ranks by unrounded objective then stable ID key; `insertTopAlternative()` retains top-K; `enumerate()` performs the exact composition search after locks/preflight. |
| `optimizer-core.js:8373-8493`, `:8495-8613` | Builds exactness diagnostics, failure results, and full ranked alternatives with score decomposition and constraint audits. This is the result contract the batch path must retain. |
| `optimizer-core.js:8757-8797` `analyzeWeightSensitivity()` | Existing public wrapper: one baseline plus scenario comparisons; each successful or failed comparison carries the full `optimizeLineups()` `result`. Today these are independent solves. Preserve this shape if upgrading it. |
| `optimizer-worker.js:45-80` | The `scenarioConfigs` branch currently loops through full configs and calls `optimizeLineups()` separately, then wraps each full result with `id`, `label`, `ok`, `status`, and `objectiveMetadata`. Keep the worker as a thin caller/adapter. |
| `weight-sweep.mjs:1-25`, `:54-60`, `:62-161`, `:251-479` | Imports internal helpers from a copied core; screens up to 64 historical five-player scenarios; rejects SwishIQ modes and player-game evidence; returns ranked membership/objective summaries with `status: "screened"`, not full public results. Its normalized config signature and one-pass loop are useful prototype evidence, not the canonical boundary. |

The repo plan records that the isolated screen is compared against its copied core and does not yet provide the full public result contract or canonical-source parity (`docs/lineup-optimizer-experiment-efficiency-plan-20261008.md:325-336`; `prototypes/lineup-experiment-tools/README.md:176-198`). The canonical source remains the source of truth; the copy's appended exports and manifest do not make it a shared production module.

## Shared read-only state and per-scenario state

| Shared once for a compatible sweep (read-only) | Private to each weight scenario (mutable) |
| --- | --- |
| Normalized player rows and the normalized invariant config, excluding weights. Validate every scenario before sharing; compare all normalized fields, not raw JSON. | A copied requested-weight vector, `effectiveObjective`, normalized/effective weights, and derived family weights. |
| Canonical hard-rule and data eligibility result, `objectivePlayers`, rejection/evidence diagnostics, sorted locked and available player lists, and the common exact combination count. | Scenario strategy-score maps and any weight-derived model context. In particular, keep a fresh `buildSwishIQImpactModel()` context per scenario where that model is used; the prototype notes that minute-objective construction mutates its model. |
| One `buildNormalizedMetrics()` result, its evidence/availability maps, and the `buildLineupRoleModel()` derived from those metrics. | One independent top-K queue, raw objective values, scenario metadata, per-scenario result/failure object, and progress label. |
| Candidate positions, observed totals, and other feasibility calculations whose inputs are identical across scenarios. | The final score decomposition, constraint audit, best/alternatives, and `objectiveMetadata`, assembled for that scenario from the canonical result builder. |

“Read-only” is a behavioral contract: `normalizePlayers()` shallow-copies rows, so nested evidence objects can still be shared with caller data. Do not mutate normalized players, nested analytics, shared maps, or the caller's weights while scoring another scenario. Do not share a mutable impact model or a top-K array across scenarios.

## Risk cases the implementation must preserve

| Case | Required behavior |
| --- | --- |
| Locks and exclusions | Keep the core's checks for unknown, excluded, ineligible, or over-capacity locked IDs. Never silently drop a lock. Ordinary `excludedIds` remove rows before the metric/evidence pool is built; `selectionOnlyExcludedIds` constrain selection after the objective pool is formed, so those rows still contribute to normalization/evidence. A locked row conflicting with either exclusion remains an error. |
| Constraints and incompatible scenarios | A shared pass may evaluate feasibility once only when the normalized constraints, size, selection rules, source scope, model mode, risk, and alternative count match. Preserve the core's `maxCombinations` preflight and constraint diagnostics. If any non-weight setting differs, route through the established per-config solve path. |
| Missing or mixed evidence | Reuse the exact core evidence gate and metric result after canonical eligibility filtering; do not normalize on an earlier or broader pool. Call `buildEffectiveObjectiveWeights()` separately for each requested vector against the shared available metrics. Preserve disabled/incomplete-metric diagnostics and renormalization. A scenario with no positive supported objective must get the canonical optimizer failure result; do not mark it merely `unsupported` or score missing data as neutral. |
| Ties and top-K | Maintain a separate queue per scenario and use `alternativeSort()` / `insertTopAlternative()`: exact unrounded objective values decide, then the stable player-ID key. Display rounding occurs after retention and must not create ties. Enumerate the full configured combination set; finding a provisional top-K is not completion. |
| Cancellation | Accept the canonical runtime lifecycle (`cancelled`, `signal`, `shouldCancel`; callback errors count as cancellation). Check it during preparation and enumeration. A cancelled shared pass invalidates exactness for every scenario; return canonical cancelled results and never label partial queues complete. `optimizer-worker.js` currently forwards progress only and has no cancel-message protocol, so worker cancellation must be wired explicitly or use termination with no partial result claim. |
| Public output | Each scenario's `result` must be structurally the current `optimizeLineups()` output, including success/failure status, `best`, full `alternatives`, score fields, effective weights, objective metadata, eligibility/evidence diagnostics, constraint audits, and exactness flags. The screen's compact `screened` alternatives are not a substitute. Preserve `analyzeWeightSensitivity()` baseline/scenario envelopes and current scenario error behavior; its existing wrapper does not impose the prototype's 64-case or duplicate-ID restrictions. |

## Stepwise implementation approach

1. Add a high-level canonical batch entry point in `optimizer-core.js`. Normalize all scenario configs with `normalizeConfig()` and verify that only normalized weights vary. Keep the initial shared-search scope to `mode: "lineup"`, `size: 5`; use the existing independent solver for incompatible configs so the current API remains correct.
2. Factor preparation out of `optimizeLineups()` at the boundary after player/config validation and common evidence eligibility. Reuse the same lock checks, `buildSwishIQImpactModel()` gate, `objectivePlayers` ordering, projection parameters, `buildNormalizedMetrics()`, evidence diagnostics, and role model. Do not export those internals solely for experiment tooling.
3. Build isolated scenario scoring contexts from the shared metrics. A shared DFS applies the canonical position and production constraints once per candidate, then scores each feasible candidate in every supported scenario using the canonical candidate adjustment and objective functions. Retain each scenario's top-K independently with the core tie comparator. Report complete counts only after the shared enumeration finishes.
4. Factor or reuse canonical finalization so each scenario receives the same full `optimizeLineups()` result shape. Keep per-scenario early failures (invalid config, unavailable priorities, or evidence failure) equivalent to an independent call. Upgrade `analyzeWeightSensitivity()` to include its baseline as another score context when compatible, while preserving its current response envelope.
5. Update the worker's compatible `scenarioConfigs` path to call the batch API once and map its full results into the current worker envelope. Keep independent `optimizeLineups()` calls for non-weight scenario comparisons. Add a cancellation transport if the UI needs cooperative cancellation; progress should identify the scenario while sharing candidate-enumeration progress.
6. Compare the batch output to independent `optimizeLineups()` results for every scenario with deep structural equality, including result failures. Cover locks, ordinary and selection-only exclusions, evidence-complete/partial/missing metrics, exact ties and near-ties, alternative counts, constraint preflight, invalid scenarios, and cancellation before and during enumeration. Then regenerate the experiment closure from canonical source and synchronize any affected generated Lineup Lab files and cache/version references before a release review.

This contract specifies the integration seam; it does not claim Cycle 4 implementation or verification has occurred.
