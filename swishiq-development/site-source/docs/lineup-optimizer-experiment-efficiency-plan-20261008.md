# Faster experimentation for Lineup Lab and the optimizer

Date: October 8, 2026

Status: implementation continues in the isolated `prototypes/lineup-experiment-tools/` directory. The runner, receipts, prepared workload scoring, shared bootstrap modules, and native fit/prediction caches are implemented. The prepared native design now has a worker-local, one-entry cache with exact cross-task tuning parity and reuse verified on one 2025–26 split. Synthetic workload parity, representative 15-player source-affinity/task-parallel optimizer output parity on Minnesota 2021–22 and San Antonio 2018–19 rosters, one graceful interruption/resume cycle, one controlled SIGINT-event/resume check, and one controlled worker-crash replacement check have passed. The older native interruption manifest still does not identify its triggering signal; the new isolated check records a programmatically emitted SIGINT and does not test OS-delivered signal semantics. Scheduler timing remains exploratory and does not establish a stable general speed improvement. A hash-manifested copy of the optimizer's ten-module ESM dependency closure now supports a prototype-only one-pass rank screen for historical five-player weight sweeps. Its expanded six-case benchmark receipt passes 647 checks, including exact ranked-screen parity, deterministic output replay, source/closure identity, and paired finalist-prefix parity. In this matrix, seven-pair median screen/full-sweep time ratios ranged from 1.19× to 2.97×; screen plus F=1 or F=3 finalist completion beat the paired full-sweep control on this 15-player workload, while finalizing all 20 was slower. These are fixture-specific in-memory results with uncontrolled CPU/cache conditions, not general or production speedup claims. No optimizer objective, basketball model, production wiring, package, or validation threshold changed. Controlled first-access/pre-read timing, broader crash/cancellation stress, real reconciled-workload parity, rotation reuse, and wider optimizer-fast-path validation remain pending. See the implementation README for current evidence and next stages.

## 1. Scope and priorities

Improve how quickly we can test Lineup Lab objective weights, constraints, player inputs, workload settings, and conditional lineup-model settings while retaining reproducible results and the existing correctness requirements.

The three workloads have different requirements:

| Workload | What it evaluates | What must be preserved |
| --- | --- | --- |
| Starting-five and rotation optimizer experiments | Best feasible roster and, for rotations, assigned player/role minutes under the chosen objective | Exact search, hard rules, full objective, deterministic ties, correct top alternatives, and every returned rotation's on-court proof |
| Player/workload calibration | Conditional player production at supplied exposure | Paired metric denominators, missing-data exclusions, chronological selection, and subgroup definitions |
| Native conditional lineup-model evaluation | Scoring rates for specified opposing five-player groups | Prior fitting cutoffs, possession weights, sparse ridge convergence, baseline comparisons, and paired uncertainty |

A conditional scoring-model receipt does not establish that the optimizer's hypothetical rotation produces more wins. Keep the reports and acceptance criteria specific to their task.

### Recommended implementation order

1. Add a local batch runner, stage timings, immutable configuration receipts, and resumable output.
2. Share unchanged roster preparation across optimizer scenarios.
3. Prepare workload evaluation rows once and score all settings and subgroups in batches.
4. Share conditional-model sparse designs across ridge fits; reuse baselines and paired resampling plans.
5. Introduce verified starting-five rescoring and safe rotation incumbents where profiling justifies them.
6. Add independent CPU workers, compact artifacts, and more advanced pruning only after numerical and exact-search parity are established.

This order provides useful improvements before attempting deeper solver changes.

## 2. Evidence from the current implementation

- `prototypes/basketball-lineup-optimizer/` is the canonical source. The public `lineup-lab/` release is generated from it. Experiment tooling should use the canonical modules and record their hashes.
- `optimizeLineups()` validates players/configuration, establishes eligible and objective-reference pools, constructs normalized metrics, projection tables, and impact context, then performs the search.
- `analyzeWeightSensitivity()` runs the baseline and each supplied weight scenario as independent full optimizations.
- `analyzeLineupInputStability()` runs a baseline and two perturbation solves per eligible, unfixed player. At its current 24-player limit, that can mean 49 optimizations for one input scale, when every perturbation is supported.
- The browser worker already accepts several objective scenarios in one message, but invokes `optimizeLineups()` separately for each. Batching exists; preparation reuse remains an opportunity.
- Rotation search already has production feasibility bounds, a two-pass ranking strategy, constrained-search certificates, and explicit incomplete-search handling. These are existing capabilities to preserve and profile.
- Detailed scoring and the 48-minute, five-distinct-player unit proof are already generated for retained alternatives. They are not performed for every enumerated roster.
- `benchmark-lineup-workload.mjs` uses eight metrics and 30 prior/strength settings per metric: 240 tuning evaluations. It then evaluates projected, raw, and shrink-only methods over the full test set, an expanded-role slice, and five training-defined subgroups: up to 168 test-side evaluations. Player histories are already fitted only twice, and only the selected settings are evaluated on test data.
- The native conditional-lineup runner fits three ridge settings per season, then refits the selected player model and a team-context baseline on train+tune. It currently processes four seasons sequentially.
- The retained native receipts show 89–94 conjugate-gradient iterations at lambda 100, 61–65 at 300, and 38–40 at 1000 for the tuning fits. All four seasons selected 1000. These are existing receipts, not a new benchmark or a reason to skip the declared selection grid.
- Native prediction already caches player indexes. Native uncertainty already aggregates losses into whole-local-date clusters before resampling. Extend these mechanisms rather than duplicate them.

## 3. Optimizer experimentation improvements

### 3.1 Prepare an immutable roster context once per compatible experiment group

**Current repeated work:** repeated scenarios reconstruct player maps, evidence eligibility, metric normalization, and source/projection context.

**Proposed change:** introduce a diagnostic preparation stage that returns immutable normalized player records, eligible IDs, objective-reference IDs, available metric evidence, normalized metric tables, and reusable model inputs. Each scenario supplies its own effective weights and settings to the remaining stages.

**Example:** twenty weight settings on the same team-season and evidence policy can share the unchanged preparation instead of starting the full pipeline twenty-one times, including the baseline. This does not remove twenty-one searches where the objectives require them.

**Required cache inputs:** source bytes/hash, team, season/phase or pooled scope, player identities, missing-data policy, exclusions and selection restrictions, minimum sample filters, model mode, evidence version/hash, scoring basis, rate-stability policy, projection parameters, and input perturbations. Include the set of production metrics requiring evidence: changing a floor can change the eligible pool.

**Correctness requirements:** immutable snapshots; no scenario mutates another's inputs; same eligible and objective-reference pools as the current path; preserve missing-metric disabling and weight renormalization. Replacement exclusions intentionally preserve the original objective universe and must retain that distinction. Share immutable impact inputs rather than scenario-mutated model objects: impact-objective construction assigns risk-related fields to its model context.

**Priority:** highest optimizer priority. It benefits weights, rule sensitivity, replacements, and input-stability work.

### 3.2 Evaluate compatible starting-five weight sweeps over one complete candidate table

**Current repeated work:** a new weight setting starts another enumeration of the same five-player groups.

**Proposed change:** for a declared compatible cohort, enumerate legal fives once and retain compact IDs plus reusable metric components, production totals, and structural role feasibility. Rescore that complete table for each weight vector. Alternatively, stream the complete enumeration once, evaluate every scenario for each group, and maintain a separate top-K per scenario; this avoids materializing a large candidate table.

**Example:** for 15 eligible players there are 3,003 possible fives before locks or rules. Twenty settings can potentially share one structural enumeration, then apply twenty score calculations to each legal group.

**Important limits:** retain the complete candidate set for the declared cohort, not only the old top alternatives. A winner under new weights may have ranked poorly before. Recompute every weight-dependent role-complementarity, impact, interaction, risk, or normalization term. Enable the fast path only for objective forms whose dependency rules have been demonstrated.

**Correctness requirements:** same selected IDs, unrounded objective, deterministic tie order, top-K membership, hard-rule results, and failure status as independent exact solves. Use the current objective comparison tolerance; do not introduce rounded-score sorting.

**Priority:** high for repeated starting-five weight sweeps; conditional on the objective's dependencies and measured cohort size.

### 3.3 Reuse rotation preparation while solving minutes for every changed objective

**Current repeated work:** roster preparation, bounds, player-to-role graph structure, and calibrated projection tables can be reconstructed repeatedly. Minute allocation itself depends on the scenario.

**Proposed change:** cache immutable bounds and graph topology, role eligibility, source-derived rate curves, and per-player/per-metric workload tables where unchanged. Compose the scenario's utility from those components, rebuild mutable residual graph state, and solve its minute allocation.

**Example:** an offense/defense weight grid shares the source evidence and structural role graph; each setting receives a new exact allocation of player and G/F/C minutes.

**Important limits:** do not reuse the previous winning minutes as the new optimum. Weight changes can alter role-conditioned utility and historical guidance. The cache key must distinguish fixed role demands, automatic role ranges, minute bounds, responsibility/risk policy, projection settings, caller allocation scores, and production rules.

**Correctness requirements:** same 240-minute total, role-range optimum, workload guardrails, hard production constraints, exact top-K status, and simultaneous-unit proof. Cached graphs must not retain capacities or flow from another scenario.

**Priority:** high where profiling shows preparation/graph construction dominates; the largest constrained-search cost can remain unavoidable.

### 3.4 Speed up constraint sweeps with structural reuse and fresh feasibility checks

**Proposed change:** reuse candidate membership and immutable structural feasibility for experiments that vary a points floor, rebounding floor, turnover ceiling, locks, or exclusions. For starting fives, cached complete candidate totals can support inexpensive threshold filtering. For rotations, use bounds and admissible unconstrained objective values to prioritize the required constrained solves.

**Example:** testing several points floors can share the roster/source preparation while retaining exact production-constrained allocation at each floor.

**Important limits:** a rotation that fails a floor under its unconstrained allocation can still pass after reallocation. A relaxed rule can make previously rejected candidates relevant. Changing evidence-required rules may also change eligibility and normalization. Reuse only under matching fingerprints; otherwise rebuild the affected stages.

**Correctness requirements:** all reintroduced candidates considered after relaxation; no cached infeasibility reused beyond its validity; unchanged exact-search/incomplete-search semantics. The current two-pass bounds already exist and should be extended only with evidence.

### 3.5 Use nearby solutions as incumbents, with complete optimality proof

**Proposed change:** the best feasible lineup/rotation from a nearby setting can seed the next setting's search. Re-evaluate its full objective and every rule under the new setting before using it as an incumbent.

**Benefit:** a good early incumbent can improve pruning and constrained-search ordering without changing the candidate space.

**Requirements:** use an attainable lower bound from a freshly feasible solution and a valid upper bound for the current full objective. Preserve equality/tie handling and prove all contenders that could enter the requested top-K. Cancellation or a watchdog stop remains incomplete, even when a feasible seed exists.

**Priority:** medium. Existing constrained allocation already uses seeds/certificates; measure the incremental value of cross-scenario seeds before expanding this work.

### 3.6 Make input-stability experiments share invariant stages

**Proposed change:** reuse source decoding, stable identity/role information, and compatible candidate structure across plus/minus perturbations. Rebuild the metric and model components affected by each perturbation.

**Example:** a 24-player plus/minus starting-five report can share one roster decode and structural candidate table across up to 49 solves.

**Important limits:** changing one player's statistic can change cohort percentiles and therefore other players' normalized scores. Recomputing only the changed player's percentile would be incorrect. An impact perturbation can alter risk-sensitive candidate value as well.

**Requirements:** retain eligibility rules, input support, scale/clamping policy, constraints, and baseline membership semantics. Include the perturbation in affected-stage cache keys. Do not represent these deterministic sensitivity cases as calibrated probabilities of selection.

## 4. Player/workload calibration improvements

### 4.1 Prepare metric-specific evaluation rows once

**Current repeated work:** `evaluate()` validates game collections, checks chronology, looks up player histories, applies eligibility/exclusions, calculates denominators, and tests subgroup membership for each setting and slice.

**Proposed change:** create an immutable prepared evaluation structure for each metric and split. Each row retains player/game identity, target value, paired exposure, training mean, league prior, training workload, supplied target workload, evidence count, and subgroup flags.

Then evaluate the 30 prior/strength settings using those prepared numeric values. Prepare train-to-tune and train+tune-to-test structures separately.

**Benefit:** the existing 240 tuning evaluations still calculate each prediction, but avoid 240 repeated validation and lookup passes. For the final three methods, accumulate whole-test, expanded-role, and five subgroup losses in the same traversal, retaining per-game sufficient statistics for paired uncertainty.

**Requirements:** identical eligible rows and exclusion counts per metric; missing values never become zero; preserve numerator/denominator pairing, minimum appearances, supplied-exposure interpretation, and the explicitly outcome-conditioned expanded-role slice. Overlapping subgroup membership is retained. Precompute input-related exclusions, but continue checking parameter-dependent invalid predictions separately for each method. Preserve one sufficient-statistics record per original game, including zero-exposure records required by the current paired population contract.

**Priority:** highest workload-calibration priority because the repeated work is directly visible in the runner.

### 4.2 Extract reconciled appearance data once per archive version

**Current repeated work:** the CLI decompresses each eligible game and independently reconciles official summary rows with parsed play-by-play before each benchmark run.

**Proposed change:** preserve a verified local appearance cache and reconciliation receipt, keyed by archive manifest/game bytes and extraction/reconciliation code. Parameter-only experiments consume that prepared cache.

**Requirements:** identical publication/phase eligibility; duplicate-player rejection; complete official fields and player-level reconciliation; source hash changes invalidate the cache. Do not bypass reconciliation or reuse a receipt for changed archives.

**Priority:** high when repeated runs otherwise reload the archive; minimal benefit for a single already-prepared run.

## 5. Native conditional lineup-model efficiency

### 5.1 Prepare one sparse design per season and fitting partition

**Current repeated work:** every lambda fit validates dated rows, constructs fitting inputs, maps player IDs to columns, builds directional sparse rows, and constructs the normal-equation vector and diagonal.

**Proposed change:** prepare the player-column index, sparse rows, possession weights, response vector, unregularized-column metadata, source receipt, and fitting cutoff once for a fixed training partition. Reuse the same design for lambda 100, 300, and 1000, changing only penalized diagonal terms and the matching preconditioner.

Prepare train+tune separately for the final refit. Team-context baseline designs remain separate from player designs.

**Requirements:** identical column order, row weights, targets, model definition, training IDs, and cutoffs. The intercept and venue effect remain unpenalized. Preserve the sparse matrix-free approach rather than constructing a dense player-by-player matrix by default.

**Priority:** highest conditional-model priority, particularly as the ridge grid expands.

### 5.2 Warm-start ridge solves and reduce repeated allocation

**Proposed change:** use a converged nearby lambda's coefficients as the initial guess for the same training design, after recomputing the new system residual `b - A_lambda * beta_initial`. Reuse numeric work buffers and evaluate flat sparse/typed-array storage if profiling shows matrix-vector allocation is costly.

**Requirements:** identical declared solver tolerance, maximum-iteration policy, penalty scale, intercept/venue treatment, and convergence failure behavior. Recompute the final residual against the requested system; record convergence, iteration count, and numerical differences from the cold path. A warm start may change the numerical path, so assess forecasts, selected lambda, and gate decisions as well as coefficients. If the grid is reordered or evaluated in parallel, apply an explicit `(tuning MSE, lambda)` comparator so a true tie still selects the smaller lambda; current serial selection relies on the grid's ascending order.

**Priority:** medium after shared designs. Do not assume that every lambda order or warm start is faster.

### 5.3 Cache fits, baselines, predictions, and interval inputs separately

**Proposed change:** separate dependency keys for:

1. Verified dataset and chronological split.
2. Player fit: training membership, source/design code, lambda, weights, and model options.
3. Team/league baselines: their own fitting inputs and settings.
4. Point predictions: frozen fit and evaluation-row identities.
5. Interval calibration: selected tuning predictions, residual method, exposure scaling, levels, and calibration cutoff.
6. Assessment: point predictions, targets, metrics, slices, cluster membership, and uncertainty protocol.

**Example:** comparing interval quantile rules can reuse point fits and predictions, then rebuild interval calibration and coverage assessment. Changing lambda requires a different fit and tuning residuals. Changes to training membership invalidate downstream stages.

**Requirements:** all cache hits carry hashes and cutoff evidence. Retain tuning predictions from the selected train-only fit for residual quantiles; predictions on those same tuning rows from the final train+tune refit would be in-sample and cannot substitute for them. Do not calibrate an interval on test residuals. A past held-out result inspected during further tuning becomes development evidence; caching does not restore independence.

### 5.4 Reuse paired resampling plans and cluster summaries

**Current good behavior:** the native bootstrap already aggregates weighted errors by whole local game date.

**Proposed change:** for comparisons with the same ordered cluster membership, generate deterministic cluster draws once and reuse them across candidate/baseline contrasts. Compute cluster weight, squared-error sums, absolute-error sums, and coverage quantities once per candidate; evaluate multiple contrasts in a batch.

**Requirements:** preserve the exact cluster grain, date order, seed, 2,000 repetitions, weighting, and percentile definition of the current native protocol. Workload's whole-game bootstrap remains a distinct protocol; do not silently replace it with the native local-date scheme. Different eligible cluster sets need distinct plans or a declared common comparison cohort.

**Priority:** high for many candidates; smaller benefit for a single four-contrast report.

## 6. A reusable local experiment runner

Use one diagnostic entry point with four explicit experiment types: optimizer weight/constraint sweeps, input stability, workload calibration, and native conditional-lineup evaluation. Proposed commands below illustrate the interface; they are not implemented commands.

```text
prepare --source <receipt> --experiment <definition>
screen --experiment <definition> --out <isolated-output>
assess --experiment <definition> --protocol <frozen-protocol>
compare --baseline <receipt> --candidates <receipts>
resume --run <manifest>
```

### Timing and throughput

Record source decoding, preparation, enumeration, ranking-bound allocation, constrained allocation, projection work, unit proofs, model fitting, prediction, bootstrap, and serialization separately. Keep existing solver counters and add stage timings alongside them.

For optimizer experiments report completed exact scenarios per minute, combinations considered, pruned candidates, allocation count, constrained states, and p50/p95 runtime across a fixed mix of rosters. Report cold-cache and warm-cache results separately. Profile the actual bottleneck before choosing deeper changes. Node provides timing APIs for this purpose: [performance hooks](https://nodejs.org/api/perf_hooks.html).

### Independent CPU jobs

Use a reusable worker pool for independent scenarios or season folds, loading modules and immutable source context once per worker. The current native season folds are independently fitted; their pooled assessment follows after all folds finish. Rotation branch partitions require globally correct top-K merging and pruning, so independent whole scenarios are the safer first parallel unit.

Worker count should be selected from measured CPU throughput and system responsiveness, without introducing a fixed reserve-RAM gate. Close workers and owned processes on completion, error, or cancellation. Node recommends worker pools for CPU tasks to avoid repeated startup overhead: [worker threads](https://nodejs.org/api/worker_threads.html).

### Artifacts and resumability

Each run should retain: definition and source hashes, model/code version, split/cutoffs, cache-hit provenance, task status, predictions or sufficient statistics, exactness/convergence status, metrics, runtime counters, and a compact comparison report. Write stage outputs atomically and mark them complete only after their receipts agree. Resume valid completed tasks instead of repeating the entire batch.

Keep large unchanged source data in one verified cache. Keep all scenario summaries; detailed contribution and unit-plan artifacts can be generated once for selected reviewed scenarios when the experiment measures only solver objectives and feasibility. Public results continue to require the complete returned-alternative proofs. Do not add a second dataset or model definition for convenience.

## 7. Quality controls that preserve useful conclusions

### Basic checks on every scenario

- Valid source/scope/configuration and explicit missing-evidence behavior.
- Immutable prepared inputs; identical eligibility/reference pool for paired comparisons that claim it.
- Finite unrounded objective or predictions; explicit failure/incomplete status.
- Returned roster size, locks/exclusions, positions, minutes, active hard rules, and top-K proof status.
- Fitting and calibration cutoffs precede scored target dates, with no target-game reuse.
- Solver convergence and recorded numerical residual for conditional-model fits.

### Differential checks for every new fast path

- Compare against the existing path on identical inputs, including ties, missing evidence, multi-position players, flexible G/F/C ranges, tight production rules, and cancellation.
- Starting five: identical membership, deterministic ordering, objective under the existing tolerance, and constraint outcomes.
- Rotation: identical optimum/feasibility, complete role-range treatment, valid workload limits, exact top-K status, and each retained alternative's 48-minute proof. Use the existing exhaustive fixed-split oracle on small fixtures.
- Workload: identical eligible appearances, exclusions, weighted losses, subgroup definitions, parameter selection, and paired-game sufficient statistics.
- Conditional model: unchanged design/weights, penalty treatment, convergence requirements, fitting cutoffs, forecasts within declared numerical tolerances, and no unexplained selection/gate changes.
- Cache invalidation: independently vary every declared dependency and show that the affected stage is rebuilt.

### Complete assessment after a batch

Run the relevant broader suite after a coherent infrastructure batch instead of running unrelated browser/site suites after every scalar setting. Continue basic checks throughout. A solver or cache change receives correctness assessment before being used to make model-selection decisions.

Native final assessment retains the current directional and net MSE/MAE comparisons, paired whole-date confidence bounds, season guardrail, source/chronology checks, and separately assessed 80%/95% interval coverage. Thresholds and resampling quality do not change to make the process faster.

An exploratory screen can omit full report generation and repeated uncertainty calculation. It must be labeled exploratory and cannot replace full assessment or independent evaluation. Previously inspected seasons remain available for development, with their evidence labeled accordingly.

## 8. Deliverables and completion requirements

| Phase | Deliverable | Completion requirement |
| --- | --- | --- |
| 1 | Timing/resume runner and fixed workload definitions | Reproducible cold/warm baseline, complete receipts, interruption/resume without repeating completed tasks |
| 2 | Prepared roster and workload evaluation caches | Matching eligibility/exclusions and verified invalidation for changed dependencies |
| 3 | Shared sparse designs, fit/baseline caches, resampling reuse | Convergence and numerical parity; unchanged chronological selection and assessment |
| 4 | Compatible fixed-five sweep path and rotation incumbent reuse | Differential exact-search results, ties/top-K, hard rules, unit proofs, and cancellation preserved |
| 5 | Independent worker scheduling and compact reports | Measured batch-throughput improvement, deterministic outputs, all owned processes close |

Accept an optimization only when the relevant outputs agree with the reference and measured end-to-end throughput improves on the target workload. Track where performance regresses as well as where it improves. No speedup multiplier is promised before those measurements.

## 9. Source map

- `prototypes/basketball-lineup-optimizer/README.md`: canonical/generated relationship and supported optimizer modes.
- `prototypes/basketball-lineup-optimizer/optimizer-core.js`: `optimizeLineups`, metric/projection construction, rotation allocation, upper-bound pruning, alternative proofs, weight/constraint/input sensitivity.
- `prototypes/basketball-lineup-optimizer/optimizer-worker.js`: existing serial scenario batching.
- `prototypes/basketball-lineup-optimizer/lineup-cache.js`: existing bounded device dataset cache, separate from the proposed diagnostic-stage caches.
- `scripts/benchmark-lineup-workload.mjs`: reconciled extraction, fitted metric histories, parameter grid, repeated evaluations and subgroup reporting.
- `scripts/lib/lineup-workload-validation.mjs`: current workload split and paired-game bootstrap.
- `scripts/lib/native-lineup-forecast.mjs`: dated-row validation, split, fitting/prediction, weighted losses and local-date bootstrap.
- `scripts/lib/nba-rapm.mjs`: sparse offense/defense designs and matrix-free conjugate-gradient solve.
- `prototypes/lineup-validation-20261008/run-native-validation.mjs`: native grid selection, train+tune refit, baselines, intervals, pooled assessment.
- `prototypes/lineup-validation-20261008/protocol.json`: frozen scope and native acceptance definitions.
- `scripts/tests/lineup-range-optimization-20261008.test.mjs`: existing fixed-split oracle, role ranges, production floor, workload-window and cancellation checks.

## 10. Initial implementation status

Implemented locally on October 8, 2026:

- New isolated batch CLI with prepare/run/resume/status/compare commands.
- Immutable decoded input reuse, identical-task deduplication, source affinity, and reusable worker lifecycle.
- Code/source/result fingerprints, atomic receipts, guarded output paths, run/cache ownership, and source-change detection.
- Prepared metric-specific workload populations and shared paired-bootstrap draws across references.
- Cached native fits, tuning predictions, selected refits, baselines, frozen fit evidence, held-out predictions, and paired assessment.
- Explicit tuning-only native screens and separately labeled historical workload screens.
- Example optimizer and recent-season native plans, timing fields, and compact run comparison output.

The optimizer still uses its current full solve for each distinct configuration. One-pass optimizer enumeration, solver-buffer reuse and warm starts are pending. The first implementation pass had syntax/source-integrity checks only; the later native tuning-only parity check is recorded below and does not establish optimizer parity, real workload parity, held-out predictive validity, or a throughput gain.

### Continued implementation: isolated scoring and preparation

The continued implementation added:

- One-pass workload test scoring for three policies and seven slices per metric. Predictions are computed once per policy/eligible appearance and reused for qualifying slices. Each slice keeps the reference first-failure exclusions, accumulation order and whole-game loss records, including zero-exposure games. Counters distinguish actual traversals/predictions from equivalent independent passes.
- Verified completed-envelope reuse before worker scheduling, including identical-signature aliases. Resume validates fresh plan/task/code/dependency identities; fully completed runs need no workers.
- Stage-key coordination across workers. Content-identical intermediate fits are serialized even when their original input files differ. Waiters reuse the verified completed artifact; a terminated thread releases ownership after exit. Coordination wait/counts are separate from computation timing.
- Physical run/task path containment, serialized stale-lock reclamation with unique owner tokens, worker replacement after a process-level crash, idempotent worker closing and terminal source-verification failure receipts.
- An opt-in `prepared-reference` native backend. Guarded in-memory reference copies expose preparation hooks without changing source files. Identical training contents/context share normalized sparse rows, player columns and the unpenalized normal vector/diagonal; each lambda copies the base arrays and retains the reference penalty and conjugate-gradient sequence. A worker-local one-entry LRU now shares the prepared design across compatible tasks; its key includes source/recipe identity, training-row content hash, and team-context flag, with task-local and worker-cumulative cache receipts.
- Source/recipe hashes and preparation timings outside the model's serialized fields. The unchanged reference backend remains the default. The paired reference/prepared example plan has been executed for the tuning-only screen documented below.

These additions are implementation work, not broadly accepted speedups. Native preparation passed numerical/output parity on two tuning-only grids and verified cross-task design reuse, but parity outside those tuning-only runs remains unestablished and stable throughput improvement is not proven. Synthetic workload scoring parity also passed, while parity on a real reconciled-appearance workload remains open. One graceful interruption/resume cycle passed for a 40-lambda native task with 81 stages; the saved manifest does not identify its triggering signal. One controlled synthetic worker crash led to one replacement and successful completion of the next distinct task, with exactness proofs and no surviving worker threads; broader crash/cancellation stress remains open. The standard experiment runner still performs a full solve for each distinct configuration. A separate isolated weight-only five-player rank screen now enumerates compatible candidates once and passed an expanded six-case benchmark matrix with repeated output and finalist-prefix parity. It still omits the full public result contract and is checked against the isolated copied core only; canonical Lineup Lab parity, other objectives, and rotation mode remain open. All work stays under `prototypes/lineup-experiment-tools/`; no canonical optimizer, generated Lineup Lab, registered model or site file is edited.

### Execution validation: native prepared backend (2026-10-09)

- The first paired run exposed an ambiguous source hook: the solver-option snippet also matched the venue-only fit. The in-memory adapter now anchors the hook to the player-effect dimension; `scripts/lib/nba-rapm.mjs` and the canonical optimizer/Lineup Lab files remain unchanged.
- The paired reference/prepared screen on the 2025–26 regular-season input (31,566 source rows, 1,204 games) completed for lambdas 100, 300, and 1,000. Both runs used the same split, selected lambda 1,000, had converged solver results, and produced identical model hashes and tuning metrics for every lambda. The 6-check parity reviews are recorded in `prototypes/lineup-experiment-tools/runs/native-preparation-parity-20261009-b/parity-review.json` and `prototypes/lineup-experiment-tools/runs/native-preparation-parity-20261009-c/parity-review.json`. The screen scored tuning data only; it did not score held-out targets or establish predictive validity.
- The prepared design was built once and reused twice across the three fits. After completion, `resume` reused both verified task envelopes with `workerCount: 0` and did not start workers, verifying completed-run reuse. Separately, the auditable interruption/resume probe below verifies one graceful interruption/resume cycle; the saved manifest does not distinguish SIGINT from SIGTERM. A corrected controlled one-worker crash/replacement receipt is recorded at `prototypes/lineup-experiment-tools/runs/worker-crash-recovery-20261009-rerun3/worker-crash-recovery-check.json`; it pins the current runner source, harness, crash fixture, plan, input, and recovered result-envelope hashes, records zero completed-task reuse and a stage-cache miss, verifies exactness flags, and confirms both worker threads exited. Earlier v1 crash receipts are preserved as debugging history. This remains one synthetic crash/replacement check, not broad crash or cancellation stress.
- The shallow-container `-c` run took 3,229.6 ms for reference and 3,496.4 ms for prepared (prepared/reference ratio 1.083); the deep-frozen `-b` run took 4,456.5 ms for reference and 10,687.6 ms for prepared (ratio 2.398). These are single sequential measurements of two runs with different container-freezing choices; they do not establish that removing recursive freezing caused the runtime difference. The prepared backend was slower in both, no speedup is accepted, and the reference backend remains the default.
- A worker-local, one-entry LRU now persists prepared designs across native tasks assigned to the same source-affinity worker. The fresh current-code run `prototypes/lineup-experiment-tools/runs/native-cross-task-code-closure-20261009/` used two non-overlapping lambda grids and passed all 16 checks in `cross-task-cache-review-plan-bound-20261009.json`. The review rechecked current source/input/protected-source hashes, plan/task signatures, result envelope identities, backend roles and settings, complete lambda coverage, then confirmed both reference/prepared grids matched in training split, model hashes, tuning metrics and solver outputs; the second prepared task had zero design rebuilds and two cache reuses. The configured capacity was one, with no eviction. The run requested two workers but used one because the four tasks shared one source bucket.
- Timing remains exploratory. Grid A took 2,086.7 ms reference and 3,144.5 ms prepared; grid B took 2,607.2 ms reference and 1,977.0 ms prepared. These are single-run comparisons and do not establish a repeatable throughput gain. The backend remains opt-in and `reference` remains the default.
- The original three-lambda parity screen was rerun after the worker-cache change at `prototypes/lineup-experiment-tools/runs/native-preparation-regression-20261009/parity-review.json`; all 6 checks passed and the design was built once/reused twice. Its single-pass runtime was 2,994.7 ms reference and 4,118.7 ms prepared (1.375x), confirming that exact reuse alone has not yet produced lower end-to-end runtime.
- An opt-in `task-parallel` scheduling mode now splits distinct task signatures across workers even when all tasks share a source; `source-affinity` stays the default to reuse decoded inputs. The synthetic eight-player sweep passed 8/8 output/alias checks in `prototypes/lineup-experiment-tools/runs/worker-scheduler-task-parallel-20261009/worker-scheduling-parity-review-final.json`. The source-affinity run used one worker; the same-source task-parallel run used two, with identical optimizer outputs. Their one-pass times were 1,076 ms and 485 ms; this synthetic comparison is not an accepted speedup.
- A prototype-only repeated paired timing harness is implemented at `prototypes/lineup-experiment-tools/scripts/run-paired-scheduler-timings.mjs`. Its verified artifact reads are bounded (4 MiB manifest, 8 MiB per task envelope, 32 MiB aggregate); both original and staged plans are capped at 256 KiB, and each fresh arm run directory is created and checked beneath the experiment root. It records per-arm CLI wall time, host context and whole-host CPU samples; it does not measure/reset OS cache state or control host contention. The recorded elapsed metric covers execution and arm inspection before receipt finalization. Its optional pre-read timing is separate from child CLI time and does not establish cold-cache timing. Receipt gates check within-pair full-result parity, cache/worker invariants, requested pre-read evidence, and task-result hashes across every arm; OS/page-cache state and host contention remain uncontrolled. Its workload and output bounds are documented in the experiment-tools README.
- The first bounded three-pair run after hardening is recorded at `prototypes/lineup-experiment-tools/runs/paired-scheduler-sas-recheck-20261009-1/scheduler-paired-timings.json`. The harness reported 9/9 summary checks and 264/264 arm checks. Six input variants had distinct byte hashes and identical JSON semantics; every pair had full optimizer-result parity, correct effective workers, zero complete-task reuse and worker replacements, and all exactness checks passed. Ratios (source-affinity time / task-parallel time) were 1.0036, 2.5816 and 2.3189 (median 2.3189); the first pair was effectively even. Whole-host CPU was 43.24–54.57%, so host contention was present and not controlled; OS cache state remains unmeasured. A separate post-run comparison of saved per-task hashes found identical results across all six arms; the current harness now enforces this replay check automatically, though this historical no-pre-read receipt predates that gate. This is another workload-specific exploratory signal, not proof of stable general speedup. The run's pre-finalization interval was 88.0 seconds.
- A later three-pair pre-read run is recorded at `prototypes/lineup-experiment-tools/runs/paired-scheduler-sas-preread-gates-20261010-1/scheduler-paired-timings.json`: 12/12 summary checks and 264/264 arm checks passed. All six pre-reads were recorded; 30 exact cache keys were absent before launch; no task cache was reused; all semantic input hashes matched; all five task result hashes matched across six arms; and source closures were stable. Source-affinity/task-parallel CLI-time ratios were 1.0613, 1.5229 and 1.2576 (median 1.2576). The recorded pre-read intervals ranged from 5.0929 to 27.1295 ms and were excluded from CLI time. This is exploratory single-roster evidence, not a pre-read/no-pre-read comparison or general speedup claim. The final self-contained receipt-gate revision then passed 12/12 summary and 88/88 arm checks in a one-pair verification at `prototypes/lineup-experiment-tools/runs/paired-scheduler-sas-preread-selfcontained-20261010-1/scheduler-paired-timings.json`; this validates gate behavior, not scheduler timing. The prior ineligible cache-hit attempt remains at `prototypes/lineup-experiment-tools/runs/paired-scheduler-sas-preread-20261010-1/scheduler-paired-timings.json` and is not used as timing evidence.
- A representative five-task sweep on the 15-player 2021–22 Minnesota roster was run in three paired source-affinity/task-parallel comparisons. The [hardened review receipt](prototypes/lineup-experiment-tools/runs/worker-scheduler-15p-20261009/parity-throughput-review-hardened.json) passed 74/74 checks. An independent audit prompted stronger binding of plan tasks, manifest identity, result-envelope identity and paths, closure hashes, alias count, worker replacement count, and cross-pair workload identity. All 15 task outputs per schedule matched as complete JSON, with no completed-task cache or resume reuse; all optimizer exactness flags passed. Effective workers were one and two respectively. Paired end-to-end times were 11,861.5/5,847.1 ms, 15,849.1/5,666.3 ms, and 17,719.8/6,641.4 ms (median exploratory ratio 2.668x). This is a workload-specific throughput signal, not stable general speedup evidence: that Minnesota comparison used one stats-backed roster and OS cache/CPU contention were uncontrolled.
- A second representative five-task sweep used 2018–19 regular-season San Antonio rows from `lineup-lab/data/swishiq-all-games-player-seasons-v1.json`. The [82/82 review receipt](prototypes/lineup-experiment-tools/runs/worker-scheduler-15p-sas-2018-19-20261009/parity-throughput-review-v2.json) binds the 15-player fixture to the source dataset and verifies plan/manifest/envelope identities, cache misses, worker counts, full-result parity, exactness flags, and cross-pair consistency. The source filter yielded 16 `teamCode=SAS` records and excluded the single `2TM` source-key row, leaving 15 unique player-seasons with direct fixture-field mapping; the [provenance receipt](prototypes/lineup-experiment-tools/examples/worker-scheduling-15p-sas-2018-19-20261009/roster-provenance.json) records the source hash, source keys, exclusion, and field mapping. Six successful inputs had distinct byte hashes but identical mapped rosters. The three source-affinity/task-parallel end-to-end pairs were 12,659.4/6,220.1 ms, 12,627.6/6,903.8 ms, and 11,155.4/6,054.7 ms (median exploratory ratio 1.8424x); every pair used one versus two workers, and all task-cache stages were uncached with zero envelope reuse. One initial pair-3 task-parallel attempt failed before task execution or worker startup with Windows `EPERM` while atomically renaming the initial manifest. Its failed manifest, with all tasks pending, is preserved under `runs/worker-scheduler-15p-sas-2018-19-20261009/pair-03-task-parallel/`; the one retry used a fresh run path and a seventh, byte-distinct input, and the final review includes only that successful retry. The dataset provides row source keys/URLs and package-level `fetchedAt`, but lacks per-row retrieval timestamps or capture receipts sufficient for independent row-level reconciliation. This is a reconciliation/traceability limitation for the workload, not a point-in-time availability test or PIT gate; PIT evidence is not required. These results remain workload-specific exploratory timing because OS cache and CPU contention were uncontrolled.
- The workload scorer passed exact comparison on a fresh current-code run using a synthetic 120-game fixture and 50 paired-bootstrap replicates: `prototypes/lineup-experiment-tools/runs/workload-parity-code-closure-20261009/workload-parity-review-plan-bound-20261009.json` passed 9/9 checks, including current code/input/protected-source hashes and task-signature/run-identity binding to the hashed plan. Selection, metrics, slices, exclusions and intervals matched exactly; observed work was 8 versus 168 population traversals, 192 versus 4,032 rows visited, and 576 versus 1,728 prediction calls. The prepared run was slower (68.5 ms versus 28.5 ms reference), so no speedup is claimed. V4 2024–25 and 2025–26 packages include per-game player records and schedule reconciliation, but every player-game row has `provenanceComplete: false` and null source-system/version/retrieval fields; no player-stat reconciliation artifact was found. Schedule joins validate game matching, not player-stat reconciliation. The available paired-lineup dataset has a different grain, so real reconciled-appearance parity remains open. Missing per-row retrieval/source provenance is a reconciliation/traceability limitation for this workload, not a point-in-time availability test or PIT gate; PIT evidence is not required.
- The auditable interruption/resume run `prototypes/lineup-experiment-tools/runs/native-interruption-auditable-20261009-b/` used one 40-lambda native task with 81 stages. Its preserved `interrupted-manifest.json` records the run and task as interrupted before resume; final `manifest.json` records both completed with the same identity, plan/code hashes, task definitions and source closure. The run evidence records 22 verified stage-cache hits, unchanged source files and zero active or queued stage locks at completion. A separate controlled event check at `prototypes/lineup-experiment-tools/runs/worker-interruption-signal-20261009-rerun3/worker-interruption-signal-check.json` emitted `SIGINT` programmatically against a stalled synthetic worker, recorded signal/task identity, confirmed worker termination, and resumed the incomplete task with all exactness flags true; the corrected harness also pins its own hash, preserves a separate interrupted-manifest snapshot, and requires an uncached resumption. It verifies the runner's signal-event path, not an OS-delivered signal or broad cancellation stress. The corrected controlled crash/replacement receipt at `prototypes/lineup-experiment-tools/runs/worker-crash-recovery-20261009-rerun3/worker-crash-recovery-check.json` pins runner, harness, fixture, plan, input, and recovered result-envelope hashes, records zero completed-task reuse and a stage-cache miss, and confirms both worker threads exited; earlier v1 receipts remain preserved as debugging history. Broader crash/replacement and cancellation stress remain open. The strengthened verifier rechecks current input, source-closure, protected-source, manifest and result-envelope hashes and binds task signatures and run identity to the hashed plan; its v4 receipt at `prototypes/lineup-experiment-tools/runs/native-interruption-auditable-20261009-b/interruption-resume-review-v4.json` passed and includes the verifier SHA-256. The README links the verifier script and documents its `--run <runs/directory>` usage.
- Continue with a counterbalanced pre-read/no-pre-read comparison across additional stats-backed rosters, recording arm order, process and host conditions; do not call a run cold-cache unless OS cache state is independently verified. Also continue repeated native timings that separate prediction-stage cache provenance, broader crash/replacement and OS-signal cancellation stress, real reconciled-appearance workload parity, and parity for optimizer preparation/search paths. Repeat the scheduler comparison on additional stats-backed rosters under controlled conditions before making a general throughput claim. Do not promote the prepared backend unless repeated end-to-end measurements show a throughput gain without parity loss.

### Execution validation: isolated weight-only rank screen (2026-10-09)

- `prototypes/lineup-experiment-tools/weight-sweep-core/weight-sweep.mjs` now screens up to 64 compatible historical five-player weight scenarios with one shared candidate enumeration. It recomputes scenario-specific scores and role/impact adjustments, preserves the reference candidate ordering, and reports only ranked lineups, objective values, effective weights, and counts. Full finalist explanations and audits still require `optimizeLineups()`.
- Run `prototypes/lineup-experiment-tools/runs/weight-sweep-screen-20261009-6/weight-sweep-screen-check.json` passed **166/166 ranked-screen parity checks and 6/6 safety/preflight checks**. The reference is `optimizeLineups()` from the isolated copied core; the receipt does not claim complete-result or direct canonical-source parity. The copied optimizer file retains the source file as its exact byte prefix and appends helper exports; the refreshed manifest pins both source and working-copy hashes.
- The checks cover a 15-player San Antonio 2018–19 roster across eight supported objectives plus one unsupported objective, locks with positional and production constraints, a synthetic tie case, metric-offset rejection, unknown responsibility IDs, cancellation before validation and after 1 of 56 candidates, plus a feasible points constraint at `max + 0.5e-9` and an impossible one at `max + 2e-9`. The impossible case is proven infeasible by the optimistic bound, skips candidate enumeration, and matches the reference solver's failure. The bound uses `1e-9` tolerance; it does not account for position structure, so it may miss some early-outs but cannot falsely reject a feasible roster.
- Five alternating timing pairs on that single 15-player fixture compare the screen with eight full solves. Median screen time was **152.1 ms**, median full-solve sweep time **223.9 ms**, median paired ratio **1.53×**, and ratio of separate medians **1.47×**. The fifth pair was a substantial outlier. The screen omits full result construction, so this is a narrow exploratory screening signal, not an end-to-end or general optimizer speedup. Test larger searches and more rosters, measure finalist finalization, and repeat under controlled host conditions before deciding whether to extend or promote this path.

### Execution validation: expanded weight-screen benchmark matrix (2026-10-09)

- The run receipt at `prototypes/lineup-experiment-tools/runs/weight-sweep-benchmark-matrix-20261009-1/weight-sweep-benchmark-matrix.json` passed **647 counted parity and replay checks**: 628 screen/reference checks, 12 stable-output-across-repetition checks, and 7 finalist checks. Separate pre-run fail-closed guards verified the 20 distinct normalized weight signatures, source/cohort provenance, and every copied optimizer source/copy hash in the manifest; these guards are not included in 647. The recorded Node PID was confirmed absent after the run.
- The six workload cases vary both candidate count and scenario count: SAS-derived 8-player/20-weight (56 possible fives), 12-player/20-weight (792), 15-player/1-weight and 8-weight (3,003 each), 15-player/20-weight (3,003), and a source-derived 2022–23 Brooklyn 25-player/8-weight cohort (53,130). The smaller SAS rows are labeled subsets. The 25-player cohort is derived directly from the player-season dataset and its filters, mapping, ordered source keys, and roster hash are in the receipt.
- Seven seeded, balanced paired repetitions were measured after one full warmup for both arms; optimizer execution and JSON serialization are timed separately and together. The median screen versus full-solve-sweep totals and paired median full/screen ratios were: 8p/20, **20.7/58.6 ms (2.97×)**; 12p/20, **241.8/368.6 ms (1.54×)**; 15p/1, **64.4/76.8 ms (1.19×)**; 15p/8, **363.4/562.9 ms (1.40×)**; 15p/20, **965.1/1,304.6 ms (1.45×)**; and BKN 25p/8, **5,474.3/8,287.3 ms (1.44×)**. The expanded matrix is still fixture-specific in-memory evidence; fixture parsing and file/CLI writes are excluded, and OS cache and CPU contention were not controlled.
- A separate paired 15p/20-scenario workflow compared the full-sweep control with screen plus complete solves for fixed predeclared prefixes. The control median was **1,304.6 ms**; F=1 took **847.7 ms** (paired control/workflow ratio 1.45×), F=3 **1,001.9 ms** (1.25×), and F=20 **2,174.4 ms** (0.60×). The F scenarios are a fixed prefix, not screen-selected. The four arms were randomized but not counterbalanced across seven repeats, and all F ratios share the same round's full-sweep control; treat these as paired exploratory contrasts, not independent estimates. This supports the specific workflow of screening all configurations and fully finalizing only a small subset; finalizing every configuration after the screen adds overhead. It is not a screen-driven selection trial or a general speedup claim.
- The screen returns ranked alternatives, objective values, effective weights, and counts; it does not return full public optimizer results. Even with these checks passed, complete-result parity is only verified for finalist outputs against the same isolated reference call, not full-output equality for every screen row. Canonical/live parity, rotation support, broader objective support, controlled host conditions, and first-access/cache tests remain open.
