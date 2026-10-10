# Cycle 4: canonical optimizer batch refactor map

Read-only implementation map, 2026-10-10. Source references are line numbers in the current `optimizer-core.js` and `optimizer-worker.js`; recheck them before editing. The prepared-context contract remains the controlling design input. This map adds source-level seams and a bounded parity matrix; it does not claim an implementation or test run.

## Current call paths and exact seams

There is no canonical batch API today. `optimizeLineups()` owns normalization through public-result construction in one function. Both current callers repeat full solves:

| Boundary | Current behavior / extraction seam |
| --- | --- |
| `normalizePlayers()` — `optimizer-core.js:272-372` | Canonical row normalization. It shallow-copies rows; nested evidence is not made immutable by that copy. |
| `normalizeConfig()` — `:587-911` | Canonical configuration, requested `weights` and derived `normalizedWeights` included. A compatibility key must be built from normalized objects, not raw config JSON. |
| `buildNormalizedMetrics()` — `:1361-1777`; `buildEffectiveObjectiveWeights()` — `:1779-1799` | Metric statistics/evidence are produced once for an invariant player pool; the effective objective is cheap and must be calculated separately for each requested weight vector. |
| `calculateObjectiveScore()` — `:2868-2902`; `alternativeSort()` — `:6819-6828`; `insertTopAlternative()` — `:6838-6849` | Reuse these canonical scoring and ranking operations. The sorter ranks by the unrounded objective and stable ID key; do not replace it with display-score sorting or prototype scoring. |
| `failureResult()` / `cancelledResult()` — `:6870-6902` | Canonical early/final failure constructors. Preserve their mode, size, category, and diagnostics. |
| `optimizeLineups()` — `:6919-8604` | Monolithic solve. The useful internal cut points are below; keep this function as the independent parity oracle and fallback during the additive batch rollout. |
| `analyzeWeightSensitivity()` — `:8757-8797` | Solves baseline first, then maps scenarios. It returns baseline and full per-scenario `result` objects plus compact summary fields. Invalid scenario weights yield a scenario error row while the baseline is still returned. |
| Worker message listener — `optimizer-worker.js:6-87`; `scenarioConfigs` branch `:45-75` | The stability branch at `:36-44` takes precedence. The scenario branch validates each entry, runs one `optimizeLineups()` per valid config (`:57-59`), and wraps each result with `id`, `label`, `ok`, `status`, and `objectiveMetadata`. It currently forwards progress but has no cancellation message protocol. |

Inside `optimizeLineups()`, these are the practical cut points:

| Lines | Boundary |
| --- | --- |
| `:6938-6949` | Normalize players/config and return canonical validation failures. |
| `:6952-7094` | Hard-rule/data eligibility, lock validation, `objectivePlayers`, selection-only filtering, locked/available lists, and setup failures. Preserve the distinction between ordinary `excludedIds` and `selectionOnlyExcludedIds`. |
| `:7096-7219` | Shared positional/stat preflight, exact combination estimate, common diagnostics, and `maxCombinations` failure. |
| `:7221-7592` | Metric evidence and weight handling, SwishIQ objective/model setup, and objective-reference diagnostics. This block currently interleaves common preparation with scenario-dependent scoring setup. |
| `:7604-7708` | Local `swishiqMinuteScoreUnitsFor()` and `candidateModelAdjustments()` closures. These capture weight-dependent contexts; the latter calls the canonical role-fit and SwishIQ candidate scoring helpers. |
| `:7727-7873` | Rotation score/allocation closures. Keep outside the initial five-player shared-search path. |
| `:7875-7998` | Per-solve mutable search counters, rejection counts, `topAlternatives`, chosen set, progress, candidate retention, and top-K bound check. |
| `:8000-8215` | `evaluateCombination()`: common composition/constraint checks followed by candidate scoring and retention. This is the main shared enumeration seam for the supported fast path. |
| `:8217-8371` | `enumerate()` and completion/cancellation handling, including the rotation constraint proof pass. For the initial batch scope, share only the exact starting-five enumeration and its lineup feasibility checks. |
| `:8373-8421` | Local `buildDiagnostics()` closure over the solve’s mutable counters and normalized config. It is result-specific, even when some input evidence is common. |
| `:8423-8604` | Canonical failure/result assembly, ranked alternative detail, audits, diagnostics, and top-level success fields. Factor only after preserving the full shape. |

## State ownership for a compatible weight sweep

The initial shared fast path should require all scenarios to normalize successfully, use `mode: "lineup"` and `size: 5`, and match in every normalized setting other than `weights` and the derived `normalizedWeights`. If a setting is ambiguous or differs, use the independent solver. Be conservative: false incompatibility only costs performance; false compatibility changes semantics.

| Share once as read-only | Allocate or copy for each scenario |
| --- | --- |
| Normalized player rows, common normalized config fields, eligibility and SwishIQ evidence gate, `objectivePlayers`, locked/available player order, common constraints, and exact combination count. | Scenario `weights` / `normalizedWeights`, `buildEffectiveObjectiveWeights()` result (`weights`, `normalizedWeights`, disabled metrics, and renormalization), and weight-derived family weights. |
| One `buildNormalizedMetrics()` result and its evidence/availability maps, plus the common `buildLineupRoleModel()` model. Read its maps as immutable; never let a scenario attach derived state to them. | `basePlayerStrategyScores`, `swishiqMinuteObjective`, `playerStrategyScores`, display scores, objective metadata, and each `objectiveReference`. These are calculated from the scenario’s effective objective. |
| Candidate membership, position assignment, and lineup stat/turnover feasibility, after proving all selection/constraint inputs match. Candidate ID arrays may be reused only as immutable values. | A fresh `buildSwishIQImpactModel()` context where used: the current solve writes `swishiqImpactModel.objectiveWeights` at `:7385`. Also keep candidate adjustments/role-fit output per scenario because `candidateModelAdjustments()` consumes effective weights and the SwishIQ scoring context. |
| Source player rows and nested evidence, normalized metric maps, and common diagnostic evidence may be referenced if no code mutates them. `normalizePlayers()` does not deep-clone nested evidence. | Independent `topAlternatives` arrays, `_rawScore`/`_tieKey` records, diagnostics and rejection counters, result/failure objects, and progress metadata. Never share a top-K queue or a mutable map/object across scenarios. |

`topAlternatives` and all search counters are currently solve-local (`:7875-7895`). `retainFeasibleCombination()` mutates the queue (`:7931-7946`); the same feasible candidate can feed every scenario, but each scenario must call the canonical scorer and retain independently. Normalize or copy the caller’s weight object before scoring and do not mutate caller-owned config or player data.

## Lowest-risk extraction sequence

1. **Add an additive batch entry point.** Accept the same player pool, scenario configs, and one shared runtime; validate each config with the existing normalizer. Keep `optimizeLineups()` unchanged as the reference path and fallback. Preserve original scenario ordering and per-scenario validation failures.
2. **Gate sharing conservatively.** Compare canonical normalized fields, removing only `weights` and `normalizedWeights` from the equality check. Also require `mode === "lineup"` and `size === 5`. Do not infer compatibility from equal raw JSON signatures or from matching candidate counts. Incompatible/invalid scenarios go through `optimizeLineups()` independently.
3. **Extract common preparation without changing result assembly.** First isolate validation, eligibility, common player sets, preflight, and normalized metric evidence. Reuse the existing eligibility gates and `maxCombinations` behavior. Run `buildEffectiveObjectiveWeights()` and retain its diagnostics per scenario; preserve the canonical no-supported-objective failure.
4. **Build isolated scoring contexts.** For each compatible scenario, create its strategy maps, effective/family weights, minute objective, SwishIQ model context, metadata, and diagnostics. Share only proven read-only metric/evidence state and the role model. Keep the model context fresh where mutation is possible.
5. **Share only the exact five-player walk.** Apply the common candidate/constraint checks once. For each feasible candidate, run the existing `calculateObjectiveScore()` path and scenario-specific `candidateModelAdjustments()`, then call `insertTopAlternative()` on that scenario’s own queue. Use full enumeration and current cancellation semantics; do not publish complete flags for partial queues.
6. **Factor canonical per-scenario finalization.** Feed each scenario’s own top-K and context through the same alternative construction, score decomposition, constraint audit, failure constructors, and diagnostics contract as `optimizeLineups()`. Compare each full `result` to a fresh independent solve before changing either existing caller.
7. **Upgrade wrappers last.** `analyzeWeightSensitivity()` can submit its baseline and valid scenario configs together, then reconstruct its existing envelope exactly; keep baseline results even when a scenario’s weights are invalid. Update the worker only after the batch result shape is fixed: preserve its invalid-config rows, wrapper metadata, progress IDs/labels, input-stability precedence, and independent fallback. Add cooperative worker cancellation separately if needed; the current worker cannot relay `cancelled`, `signal`, or `shouldCancel` through messages.

## Bounded differential fixture matrix

Use small deterministic synthetic player pools (about 6–10 rows), no live or product data. For each compatible scenario, deep-compare the complete batch `result` with `optimizeLineups(players, config)`; compare wrappers separately. These are implementation fixtures to add/run during the refactor, not tests executed for this map.

| Fixture | Bounded input variation | Parity target |
| --- | --- | --- |
| Baseline success | Two distinct weight vectors; same five-player pool and config | Full success result, chosen IDs, scores, objective metadata, alternatives, diagnostics. |
| Tie ordering / K | Equal objective candidates plus a near-tie; `alternatives` set to 1 and then 3 | Raw score ordering, stable ID tie key, no rounded-score tie substitution, exact counts. |
| Locks / exclusions | One lock, one ordinary exclusion; separate selection-only exclusion comparison | Same validation, objective-pool evidence, available pool, candidate order, and lock-conflict failures. |
| Evidence support | Partial metric evidence that renormalizes weights; one scenario with no supported requested objective | Same disabled-metric diagnostics and canonical objective-evidence failure. |
| Preflight / constraints | Position minimum and stat/turnover bound, including one preflight-infeasible case | Same preflight/failure result and per-candidate constraint counts. |
| Compatibility fallback | Change one non-weight setting (size, model/source scope, lock/exclusion, or constraint) | Independent result exactly matches `optimizeLineups()`; no field may be silently ignored. |
| Validation / cancellation | Invalid weight/config row plus one valid scenario; cancellation before search and during enumeration | Preserve sensitivity/worker envelopes and invalid row placement; cancelled results remain incomplete and never expose partial queues as exact. |

This is a source map only. No optimizer source, worker, generated asset, test, data, or site file was changed and no broad test suite was run.
