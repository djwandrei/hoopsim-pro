# V4 experiment efficiency tools

Date: 2026-10-09

This is a separate implementation of the experiment infrastructure from the model-testing efficiency plan. It reads the existing feature, forecast and model artifacts. New caches and receipts go into this folder's `runs/` directory by default. It does not edit model definitions, Game Lab, packages, public site files, or deployment configuration.

**Status:** batch execution, checkpoint composition, append-only feature/design extension and an experimental shared full-inference plan are implemented. Indexed source-history and sparse SRS helpers are available as separate groundwork. Mean parity is bit-for-bit on both a fixed fixture and the full 2020–26 source corpus; worker parity is bit-for-bit on the fixed fixture. A 6,150-game 2021–25 Candidate 100 screen found the fast and canonical uncertainty scorers structurally identical and within the declared numeric tolerance, but not parsed-value or file-byte identical. Six-repetition screen worker benchmarks on 2022–26 (4,920 games) and 2021–25 (6,150 games) found byte-identical artifacts at 1, 2, and 3 workers; the median paired wall ratios versus serial were 0.723 and 0.698, respectively, while using about 1.9× the peak RSS. Eight-pair full-corpus mean benchmarks on four ridge settings found exact parity at 1, 2, and 4 workers; median paired wall ratios versus the original runner were 1.043, 0.713, and 0.518, with paired CPU ratios 0.867, 1.019, and 1.240. A separate player-hustle feature artifact covers 2020 warmup plus 2021–25 development rows, but has not been aliased into Candidate 100 or scored. These timing and feature results are scoped to their documented workloads; the screen comparison/bootstrap stage was excluded from timing. The prior-season play-type feature screen and four player-tracking feature-family screens found no additions that pass the current paired development gate; none are retained. The passing feature's zero-pass anomaly was verified as excluded from rate aggregation and covered by the builder's league-rate fallback, then screened; it did not pass the predictor-retention gate. A separate 2021–25 ablation of exact/linear duplicate Candidate 100 predictors found only very small metric shifts, with all paired primary-metric intervals including zero; no representation is promoted. Exact real-source parity between original and planned inference was verified for a representative 2,460-row 2021–23 subset; full-cohort inference parity and source-family checkpoint parity remain unproven. No existing runner has been replaced.

## What is implemented

### Current development entrypoint (2026-10-10)

Use `node scripts/swishiq-experiment.mjs run <plan.json>` from the workspace root.
Its `prepare`, `status`, and `resume` commands use the same pinned stage caches.
Candidate100's recent-season mean batches start with four workers and its
uncertainty grids with three workers when the plan omits those settings.

For independent candidate screens, the combined experiment plan can opt into
`"maxConcurrentScreens": 2`. Each external screen uses one internal worker.
The default is one in-process screen at a time. Identical complete screen plans
share one dispatch, and candidate summaries preserve plan order. Plans containing
an in-screen `comparison` stay serial because their resampling cache is shared.
Comparisons across completed mean candidates still run through
`compare-mean-screens.mjs` with one shared paired resampling plan.

During the external screen phase, the first SIGINT/SIGTERM stops new dispatch
and drains active children before recording `interrupted.json`; a second signal
terminates owned children. Earlier stages retain normal process signal behavior.
Completed stage caches remain reusable after an interruption. Normal completion
and failure await active screens, and signal/exit handlers are removed afterward.
Abrupt OS termination cannot run JavaScript cleanup handlers; a force stop on
Windows must terminate the owned process tree. Fixture parity establishes the
screen contract, while throughput claims require repeated workload measurements.

The planned shared-draw inference implementation also matched the original
exactly on a representative 2,460 real paired rows from 2021–22 and 2022–23,
using 40 draws at the existing 7- and 14-day block lengths. This is source-data
method parity for that subset, not full-cohort parity or a performance claim;
the original implementation remains the production reference. See
`docs/swishiq-inference-source-data-parity-20261010.md`.

The opponent-adjusted pace screen uses
`candidate100-adjusted-pace-plan-20261010.json` and the existing box-score
artifact/preparation tools. Its formula is declared in
`lib/opponent-adjusted-pace-context.mjs`; it adds one named total-head feature
and preserves the pinned original source model and Candidate100 configuration.

| Capability | Implementation | Effect |
|---|---|---|
| Existing artifact inventory | `index-artifacts.mjs` | Identifies reusable source/mean manifests and reports missing or changed hashes. |
| Immutable cache stages | `lib/artifacts.mjs` | Keys stages by inputs, code and settings; verifies every recorded output before reuse. |
| Chronological indexes | `lib/chronology.mjs` | Builds date batches and season offsets once, validates targets and strictly prior-date cutoffs. |
| Append-only feature source | `extend-features.mjs` | Preserves the base JSONL bytes and appends strictly later dates under a pinned feature contract. |
| Append-only design extension | `lib/design-cache.mjs` | Copies verified earlier Float64 vectors and standardization, transforms only the appended raw rows. |
| Checkpoint design transfer | `lib/design-cache.mjs` | Proves identical complete-date prefixes before continuing a fit on an extended design. |
| Indexed history groundwork | `lib/source-context.mjs` | Provides prior team/season/venue lookups, exact integer league aggregates and portable history snapshots. |
| Indexed sparse SRS groundwork | `lib/strength-context.mjs` | Selects eligible prior games and preserves the ordered nonzero normal-equation additions and existing solver. |
| Shared feature loading | `run-means.mjs` | Parses one source file per batch rather than once per configuration. |
| Reusable design vectors | `lib/mean-batch.mjs` | Stores Float64 head designs by feature/policy/warmup signature; ridge or refit changes reuse those designs. |
| Mean configuration deduplication | `lib/configuration.mjs` | Separates numerical mean settings from version labels and uncertainty settings. |
| Season checkpoints | `lib/mean-batch.mjs` | Saves normal equations, fitted coefficients and residual state after complete local-date batches. |
| Complete checkpoint replay input | `compose-forecasts.mjs` | Joins pinned prefix forecasts with resumed forecasts and verifies exact design coverage for residual warmup. |
| Mean-path acceptance | `run-mean-acceptance.mjs` | Runs the original runner, cold/warm optimized full path, prefix/resume path and composition in isolated directories, then records exact forecast parity and local timings. |
| Isolated play-type feature generation | `build-playtype-feature-family.mjs` | Pins 22 complete regular-season team panels, joins by prior season/team, and appends compact matchup efficiency features to a copied source artifact. It does not edit or run a model. |
| Candidate 100 play-type alias adapter | `build-candidate100-playtype-alias-adapter.mjs` | Verifies the Candidate 100 config and unused feature slots, maps prior-season play-type measures into isolated total/margin inputs, and emits pinned one-batch plans without changing model files. |
| Isolated player-tracking feature generation | `build-player-tracking-feature-family.mjs` | Uses a verified season/team/name source crosswalk (provider IDs are row evidence, not join keys), weights season-lagged NBA tracking rates by strictly prior team-game roles, logs unresolved identities and zero-denominator rows, and writes a copied source artifact. It does not edit a model. |
| Isolated player-hustle feature generation | `build-player-hustle-feature-family.mjs` | Uses per-36 NBA.com prior-season hustle rates weighted by each player's share of team minutes over ten strictly prior games; requires regular-season team attribution, excludes invalid source rows from player and league rates, and records fallback provenance. It does not score or edit a model. |
| Candidate 100 tracking screen adapters | `prepare-candidate100-tracking-*-screen.mjs` | Maps one semantic tracking feature at a time into an unused, allowlisted experiment slot; verifies pinned baseline features and chronology; emits isolated total-only, margin-only and combined plans without changing model or Game Lab files. |
| Bounded parallel batches | `lib/worker-pool.mjs` | Runs unique mean/screen jobs in managed worker threads and awaits worker termination on completion/failure. |
| Shared forecast loading | `run-screen.mjs` | Parses and indexes one immutable mean file per uncertainty grid. |
| Full screen-output parity | `compare-screen-parity.mjs` | Verifies each result receipt, output hash, settings and ordered target cohort before comparing full scored rows, forecast ledgers, metrics and settings; reports parsed-value equality, byte identity and tolerance results separately. |
| Cross-run paired screen comparison | `compare-mean-screens.mjs` | Verifies pinned full screens and their forecast/label/team joins, then compares multiple mean candidates against one baseline with shared same-season date-block draws and separate raw total/margin point-error summaries. |
| Existing optimized scorers | `lib/uncertainty-batch.mjs` | Uses the existing Gaussian/empirical paths only under their supported settings; otherwise uses the configurable distribution. |
| Compact receipts | `run-screen.mjs` | Writes metrics and compressed paired losses by default; complete scored rows and ledger only for requested variants. |
| One-pass metrics | `lib/screen-metrics.mjs` | Accumulates pooled and season metrics together; optional calibration slope uses the existing calculation. |
| Reusable screen draws | `lib/resampling-plan.mjs` | Stores deterministic date-cluster counts once and applies common draws across paired losses. |
| Cached paired comparisons | `run-screen.mjs` | Reuses completed comparisons for an identical result set and resampling plan. |
| Exact inference reuse | `run-inference.mjs` | Calls the existing calendar-block/shared-team/maxT inference and caches its result for identical inputs/settings. |
| Shared full-method draw plans | `lib/canonical-plan.mjs` | Saves reusable calendar and shared-team counts; an experimental port applies them with the original loss arithmetic. |
| Resumable mean-to-screen plan | `run-plan.mjs` | Reuses completed hash-matching stages after interruption and records stage completion/failure. |
| Stage-level workflow timing | `run-plan.mjs` | Records monotonic wall time and process CPU for feature extension, mean batches, each composition, and screening; timing stays outside cache/result signatures. |
| Source-family union | `union-feature-families.mjs` | Joins separately prepared tracking and hustle fields to the same ordered source rows, preserving base fields and requiring matching row identities. |
| Candidate 100 hustle aliases | `build-candidate100-hustle-alias-adapter.mjs` | Maps four hustle features into isolated excluded input slots and emits total/margin variants without editing the Candidate 100 definition. |
| Screen-setting cost matrices | `prepare-screen-cost-matrix.mjs`, `execute-screen-cost-matrix.mjs` | Prepares separate same-scorer fast-Gaussian and configured-canonical matrices with independent controls, serial execution, per-attempt receipts, and cache preflight. |
| Matrix result summary | `summarize-screen-cost-matrix.mjs` | Verifies run receipts and reports raw wall/CPU/RSS timing observations, missing/failed attempts, and within-repetition comparisons; current output has no completed timings. |
| Plan timing summary | `summarize-plan-timings.mjs` | Summarizes workflow-stage times by pinned workload identity, including interrupted runs; it does not report speedup ratios. |
| Synthetic inference parity | `verify-inference-synthetic-parity.mjs` | Compares the experimental shared-draw inference path with the original on a compact deterministic fixture; it is not candidate scoring or predictive validation. |
| Runtime telemetry | `lib/telemetry.mjs` | Records wall/CPU time, RSS/heap snapshots, process high-water RSS, cache hits and workload counters. |

The mean runner retains the original ridge solver, decay order and ordered per-row Gram additions. It does not aggregate or reorder those additions. Cached design dot products still require numerical parity against the original runner before use for a final model decision.

The in-place decay update in `lib/mean-batch.mjs` changes how the experimental runner scales its existing normal-equation arrays while preserving the multiplication and accumulation order. The small fixture before/after receipts are `runs/phase0-inplace-decay-before-20261009/acceptance-receipt.json` and `runs/phase0-inplace-decay-after-20261009/acceptance-receipt.json`. The full-corpus before/after receipts are `runs/phase1-full-recent-profile-20261009/acceptance-receipt.json` and `runs/phase1-inplace-decay-full-acceptance-20261009/acceptance-receipt.json`. The full run matched **6,824** forecasts and **27,296** prediction values exactly. Its single, order-uncontrolled optimized/reference timing ratio moved from 1.725 before to 1.756 after, so these runs do not demonstrate a speed improvement.

## Latest efficiency tooling work (2026-10-09)

- The plan runner now records completed and failed stage timings without adding runtime measurements to cache keys. A bounded 697-row fixture exercised the mean and screen path; its screen covered 147 targets. This is a smoke check, not a full model run.
- A feature-family union artifact combines the prepared player-tracking and hustle fields for **7,230** ordered rows. Its **16** added predictors (**115,680** values) matched the family source values exactly, and base fields/order were preserved. This is data preparation only; no union candidate was scored.
- The hustle adapter audit confirmed eight unique alias slots, the intended total/margin settings, and the matching 6,150-game 2021–25 target identity. The adapter has not been scored or promoted.
- The original mixed 15-case × 3-repetition matrix remains preserved and unscored at `runs/candidate100-screen-cost-matrix-20261009/`. It is retained as an audit artifact; the executor now rejects it because its cases use different scorer implementations against a fast-Gaussian-only control. The first separated pair's matrices, schedules and plans are preserved and marked superseded by revision 2. Their original definition bodies were not recoverable byte-for-byte: the reconstructed files at the original definition paths do not match the v1 receipt pins (fast expected 3,369 bytes/SHA-256 `11904f0b…`, actual 3,349 bytes; canonical expected 3,472 bytes/SHA-256 `9199aee6…`, actual 3,448 bytes). Treat v1 as a preserved audit artifact, not a reproducible preparation.
- Revision-2 fast-Gaussian and configured-canonical matrices remain preserved and unscored at their `runs/*-rev2/` paths. Each has 8 cases × 3 repetitions = 24 plans, a scorer-matched control, the pinned 4,920-game 2022–26 cohort, one worker, and unique per-plan output/cache roots. Their generator pins became stale when the opt-in counterbalanced order builder changed; keep rev2 as an audit artifact and do not execute it.
- The revision-2 validation-only results are historical; the generator pin change means those matrices now fail current executor integrity validation. No rev2 scoring ran.
- Revision-3 fast-Gaussian and configured-canonical matrices are at `runs/candidate100-screen-cost-matrix-fast-20261009-rev3/` and `runs/candidate100-screen-cost-matrix-canonical-20261009-rev3/`, defined by matching `examples/*-rev3.json` files. Each has 8 cases × 4 repetitions = 32 plans, a scorer-specific control, the same pinned 4,920-game cohort, one worker, and unique plan paths. The seeded-reverse-pairs-v1 schedule uses P, reverse(P), Q, reverse(Q), so each case pair appears in both orders twice. Both passed `--validate-only` with 32 empty caches each; the saved results are `validation-only-result.json` in their matrix directories. No scorer job ran. Counterbalancing balances planned order only; host load remains uncontrolled and observed execution order is not independently verified. Timing is full run-screen cost, not a pure inner-loop measure or general speedup claim.
- The executor was hardened after review: its signal handlers cover lock setup/release, its child runs detached from the parent console signal group, and completed receipts verify elapsed-time arithmetic plus metrics path/hash/byte pins. Focused fixtures and validation-only checks passed. The original 45-plan matrix and both rev2 and rev3 pairs remain unscored.
- The plan-timing summarizer now groups across paths only when stable result/source/configuration and target identity evidence match. A fixture confirmed equivalent runs at different paths group together, while same-count runs with changed pins or target identity split; missing identity is isolated with a warning.
- The original and experimental shared-inference implementations matched exactly on a synthetic **56-row, two-season** fixture across **337 numeric outputs** and both recorded sample hashes. This verifies that fixture only; source-data inference parity remains unproven.
- This experiment-tools work did not change Candidate definitions, Game Lab model files, package artifacts or deployment files. Separate local Composite Forge v22 source fixes are outside this experiment-tools section and have not been deployed.

## Running a plan

Use the workspace Node runtime (currently Node 26). No packages need to be installed. Relative paths in a plan resolve against the directory containing that plan.

From the workspace root:

```powershell
# Inventory only; choose a new output filename on each invocation.
node .\prototypes\swishiq-package-v4\experiment-tools\index-artifacts.mjs `
  .\prototypes\swishiq-package-v4\diagnostics\game-lab-candidate100-pruned-total-model-blend090-v1-20261008 `
  .\prototypes\swishiq-package-v4\experiment-tools\runs\my-artifact-index.json

# Development uncertainty grid using existing mean predictions.
node .\prototypes\swishiq-package-v4\experiment-tools\run-screen.mjs `
  .\prototypes\swishiq-package-v4\experiment-tools\examples\candidate100-screen.json

# Rebuild/reuse an isolated mean cache without editing the source configuration.
node .\prototypes\swishiq-package-v4\experiment-tools\run-means.mjs `
  .\prototypes\swishiq-package-v4\experiment-tools\examples\candidate100-means.json

# Reproduce the bounded full/resume mean-path acceptance check. Choose a new
# output directory; the runner refuses to overwrite an existing one.
node .\prototypes\swishiq-package-v4\experiment-tools\run-mean-acceptance.mjs `
  .\prototypes\swishiq-package-v4\experiment-tools\examples\candidate100-phase0-acceptance.json `
  --output ..\runs\my-mean-acceptance

# Build a pinned prior-season team play-type feature artifact for an isolated screen.
node .\prototypes\swishiq-package-v4\experiment-tools\build-playtype-feature-family.mjs `
  .\prototypes\swishiq-package-v4\experiment-tools\examples\candidate100-playtype-feature-family.json

# Build season-lagged, prior-role player-tracking features for an isolated screen.
node .\prototypes\swishiq-package-v4\experiment-tools\build-player-tracking-feature-family.mjs `
  .\prototypes\swishiq-package-v4\experiment-tools\examples\candidate100-player-tracking-feature-family.json

# Build per-36, minutes-role-weighted hustle features for Candidate 100's 2021-25 development cohort.
# Includes 2020 as model warmup; this is feature preparation only, not a model score.
node .\prototypes\swishiq-package-v4\experiment-tools\build-player-hustle-feature-family.mjs `
  .\prototypes\swishiq-package-v4\experiment-tools\examples\player-hustle-feature-family-2021-25.json

# Compare the fast and configured-canonical scorer on the five-season 2021–25 cohort.
# The run records its declared numeric tolerance; this is not predictive validation.
node .\prototypes\swishiq-package-v4\experiment-tools\run-screen.mjs `
  .\prototypes\swishiq-package-v4\experiment-tools\examples\candidate100-score-parity-2021-25.json
node .\prototypes\swishiq-package-v4\experiment-tools\compare-screen-parity.mjs `
  .\prototypes\swishiq-package-v4\experiment-tools\runs\screens\<screen-run>\screen-index.json `
  fast-gaussian canonical

# Combined mean and uncertainty stages.
node .\prototypes\swishiq-package-v4\experiment-tools\run-plan.mjs `
  .\prototypes\swishiq-package-v4\experiment-tools\examples\candidate100-pipeline.json
```

The bounded fixture acceptance, full 2020–26 mean acceptance, five-season scorer comparison, play-type feature build and crosswalk-backed player-tracking and player-hustle feature builds have been executed. Candidate 100's play-type alias adapter and isolated variants plus the drive, catch-and-shoot and pull-up tracking screens have also been run; the results are documented below. The inventory and other example grids remain usage examples; they do not change Candidate 100's settings.

## Mean-path acceptance

`run-mean-acceptance.mjs` is an infrastructure check, not a model decision. Its
versioned plan pins one feature JSONL, one configuration, and the original mean
runner. It runs all of the following into a new isolated output directory:

1. The unchanged original mean runner.
2. A cold optimized full mean run, followed by a warm cache-reuse invocation.
3. An optimized prefix run, a checkpoint-resumed tail, and deterministic
   forecast composition.
4. Forecast parity for original versus optimized full output and optimized full
   versus composed output.

The fixed 2026-10-09 fixture has 697 raw feature rows (a selected 2020 prefix
and 20 observed 2025 local dates). Original-versus-optimized, optimized
full-versus-composed, and original-versus-two-worker comparisons each covered
291 forecast rows and 1,164 total/margin/home/away prediction values, with zero
prediction differences and no compared metadata differences. The reusable
acceptance receipt is at
`runs/phase0-reusable-acceptance-20261009-rerun/acceptance-receipt.json`;
worker parity is recorded separately at
`runs/phase0-acceptance-20261009/parity-workers.json`.

The full-corpus run used the complete 2020–26 Candidate 100 source feature file.
Original-versus-optimized and optimized-full-versus-resumed-composition each
matched **6,824 forecasts and all 27,296 prediction values exactly**, with no
missing/extra rows, metadata differences, or nonzero prediction deltas. Its
receipt is at
`runs/phase1-full-recent-acceptance-20261009/acceptance-receipt.json`.

The fixture timings remain local evidence only. Two full-corpus receipts have
these wall-time samples:

| Receipt | Original runner | Optimized cold | Warm cache replay |
|---|---:|---:|---:|
| `phase1-full-recent-acceptance-20261009` | 4.89 s | 17.13 s | 3.83 s |
| `phase1-full-recent-profile-20261009` | 2.05 s | 3.54 s | 0.44 s |

Both cold optimized samples were slower; their magnitudes vary substantially
and are not controlled benchmark repetitions. The warm cache replays skip
fitting and are not compute-speed comparisons. The resumed routes add prefix
fitting and composition, so they demonstrate recovery/reuse, not a faster way
to produce the same completed full run. These exploratory cold-path receipts
do not establish a stable speed ratio; the separate controlled worker studies
below provide workload-specific measurements. The five-season Candidate 100 scorer comparison is recorded
at `runs/screens/run-1791541483954-5576/parity-fast-gaussian-vs-canonical-3.json`.
Its parsed rows, ledger and summary metrics are not exact or byte-identical;
all numeric differences are within the predeclared absolute tolerance `1e-9`
and relative tolerance `1e-12`, with no structural, nonfinite or out-of-range
differences. The maximum absolute differences are `1.9796e-11` in scored rows,
`7.9581e-13` in the forecast ledger and `1.3501e-13` in metric summaries.
A separate summary comparison found that all 59 shared canonical screen
metrics per 2021–25 season and pooled agreed with Candidate 100's existing
report within the declared absolute `1e-9` / relative `1e-12` tolerances; the
largest absolute difference was `1.35e-13`. The parsed values were not exact
(18–24 of 59 fields were exact per season and 23 of 59 pooled). Candidate 100's
separate total-head metrics are not represented in the screen summary. One matched
screen observed 1.81 s for fast scoring and 72.30 s for canonical scoring;
this single observation is not a repeated timing benchmark. The result supports
tolerance-based scorer parity for this configuration/cohort only. It does not
establish full inference parity, candidate quality or predictive validity.

## Isolated player-tracking feature artifact

The crosswalk-backed builder produced **7,230** augmented rows for target
seasons 2020–25 (2020–21 through 2025–26), using tracking rates from the prior
season. Role weights use player usage loads from each team's last ten regular-
season games strictly before the target local date. Per-game usage load is
`FGA + 0.44 × FTA + turnovers`; minutes are used only when total usage
exposure across the role window is zero. The window can span seasons and
include earlier games from the target season; all target-team rows have ten
prior games. Each team profile is a role-weighted mean of its players'
prior-season rates; the total feature sums home and away profiles, while the
margin feature is home minus away. This is a role profile, not an
opportunity-weighted team rate. The artifact is at
`runs/cache/player-tracking-features/44cf3381ee4112d6f93761c801be0907e5673943b5edd1a0e504e7b5be5ebe0b/feature-rows.jsonl`.

The builder consumes a verified source-row crosswalk using season/team/name
and suffix-insensitive fallbacks; NBA provider IDs are checked as row evidence,
not used as player identity keys. Across the four complete 2017–26 source
tables (20,024 rows), **19,974** rows map to a unique V4 `playerRef`, 50 remain
unresolved, and none are ambiguous. The six source seasons used by target
seasons 2020–25 contain 13,416 rows: 13,394 matched and 22 unresolved. Those
22 rows have no V4 player-season candidate and safely use the prior-season
league-rate fallback. In that six-season window, each table has 49 source-team
label mismatches; they are resolved only when the season-level name match is
unique. The receipt records the remaining unresolved rows and all match rules.
Mean imputed role-load share is roughly 8–11% by metric and season. The upstream
crosswalk receipt retains its historical
`source-crosswalk-ready; feature-integration-not-started` status text; the
downstream feature receipt separately pins the completed isolated artifact.
This does not indicate model or Game Lab integration.

NBA source validation reconstructs catch-and-shoot and pull-up eFG from makes
and attempts. Paired-null three-point makes/attempts are normalized only when
the published eFG corroborates the result within `0.00051`; zero-FGA rows must
have a null published eFG. The receipt records 160 catch-and-shoot and 379
pull-up zero-FGA rows. Zero-denominator rows are excluded from league-rate
aggregation, including the 2024–25 passing row with positive created points
and zero passes. This artifact remains an isolated development input.

## Isolated player-hustle feature artifact

`build-player-hustle-feature-family.mjs` generated **7,230** augmented feature
rows for target seasons 2020–25: **1,080** warmup rows in 2020 and **6,150**
Candidate 100 development-screen rows across 2021–25. The screen identity
matches the pinned Candidate 100 baseline forecast cohort. Source seasons are
2019–24, so the 2020 warmup rows use the completed 2019–20 NBA.com hustle
table.

Each player rate is `36 * count / MIN` for `CONTESTED_SHOTS`, `DEFLECTIONS`,
`DEF_LOOSE_BALLS_RECOVERED`, or `CHARGES_DRAWN`. A target team's profile
weights prior-season rates by each player's share of all team minutes over the
ten most recent regular-season team games strictly before the target local
game date. The total-head feature sums home and away profiles; the margin-head
feature is home minus away. Row provenance records role-window dates,
per-metric fallback shares, and fallback assignments with reasons and source
row references.

Rate-pool rows must be uniquely matched, have crosswalk `teamMatch=true`, and
also match a **regular-phase, season-total** V4 player-season team. This extra
check matters because the crosswalk's `teamMatch` can also match a player's
playoff team. For example, the 2022–23 Shaquille Harrison source `LAL` label
matches his playoff team, while his V4 regular-season team row is POR; the
feature builder excludes the row and substitutes the season fallback. The
league fallback for each metric/season uses only eligible rows:
`36 * sum(count) / sum(MIN)`. Excluded rows contribute to neither total.

| NBA.com source season | Source rows | Eligible positive-minute rows | Team mismatches | Unresolved | Zero-minute rows |
|---|---:|---:|---:|---:|---:|
| 2019–20 | 525 | 515 | 10 | 0 | 0 |
| 2020–21 | 538 | 532 | 5 | 1 | 0 |
| 2021–22 | 596 | 588 | 6 | 1 | 1 |
| 2022–23 | 535 | 527 | 8 | 0 | 0 |
| 2023–24 | 567 | 559 | 7 | 1 | 0 |
| 2024–25 | 567 | 553 | 12 | 2 | 0 |

Across these seasons, 54 rows are excluded: 48 team mismatches (two are
crosswalk all-phase-only matches), five unresolved identities, and one
zero-minute row. No ambiguous rows, aggregate-team rows, or invalid metric
values were found. All **14,460** target-team role windows contain ten games,
and every latest prior player-game date precedes its target date. In the
2021–25 development cohort, **31,502** distinct target player-role assignments
use fallback rates, accounting for 8.77%–11.94% of team player-minutes by
season. The 2020 warmup adds **5,492** fallback assignments at 10.06%; across
all 2020–25 artifact rows, the total is **36,994**. The isolated
artifact is at
`runs/cache/player-hustle-features/439bd6aebb9fe896d70aa96eb1252d986a7439f3101982138a78b135e52ccce7/feature-rows.jsonl`;
the same directory contains the feature receipt and exclusion manifest. No
candidate or model has been scored or promoted.

## Candidate 100 tracking feature screens

Four tracking families have completed isolated fast-Gaussian first-pass screens
on the same opened-label cohort as the pinned Candidate 100 baseline:
**6,150 games**, 1,230 in each 2021–25 season. The screens use three variants
(total-only, margin-only, both), preserve all selected baseline features, and
use a common 1,000-replicate, seven-observed-date circular block plan (seed
`20261009`). Deltas below are candidate minus baseline; negative favors the
candidate for loss/MAE metrics. Signed-error deltas are directional and must be
read relative to the baseline bias and zero; a negative signed delta is not
automatically an improvement. The regenerated comparison receipts include
this per-column direction metadata.

- **Drive points per drive:** total-only increased raw total MAE by `0.012641`
  points (95% screen interval `[0.004005, 0.022112]`). Margin-only changed
  margin MAE by `+0.001151` (interval `[-0.006017, 0.007826]`), Brier by
  `-0.0000533` (interval `[-0.0002414, 0.0001197]`), and log loss by
  `-0.0001272` (interval `[-0.0005346, 0.0002452]`). The combined variant
  inherits both head effects. This does not justify a canonical rerun.
- **Catch-and-shoot eFG:** total-only changed raw total MAE by `+0.002080`
  (interval `[-0.004023, 0.007791]`). Margin-only changed margin MAE by
  `+0.000876` (interval `[-0.004356, 0.005964]`), Brier by `+0.0000239`
  (interval `[-0.0001106, 0.0001507]`), and log loss by `+0.0000438`
  (interval `[-0.0002690, 0.0003198]`). The combined variant reproduces the
  head effects without a demonstrated interaction benefit. This does not
  justify a canonical rerun.
- **Pull-up eFG:** total-only changed raw total MAE by `+0.000414`
  (interval `[-0.013444, 0.014143]`) and increased total signed error by
  `+0.028008` (interval `[0.008021, 0.048939]`). Margin-only changed raw
  margin MAE by `-0.000108` (interval `[-0.004124, 0.004527]`), while Brier
  increased by `+0.0000675` (interval `[-0.0000378, 0.0001844]`) and log loss
  by `+0.0001570` (interval `[-0.0000710, 0.0004207]`). No primary MAE
  interval excludes zero, and the probability changes do not support
  retention. This does not justify a canonical rerun.
- **Created points per pass:** the pinned preflight verified the 2024–25 Isaiah
  Mobley source row (`AST_PTS_CREATED=13`, `PASSES_MADE=0`), its unique season/team/name
  crosswalk match, exclusion from league-rate aggregation, and the builder's
  league-rate fallback for the zero-denominator player row. The preflight
  records `fallbackToLeagueRate:true`. Total-only changed total MAE by
  `-0.005066` (95% interval `[-0.021706, 0.012265]`); margin-only changed margin
  MAE by `-0.008916` (interval `[-0.020625, 0.003112]`); the combined variant
  reproduced those head effects. All primary intervals cross zero, so none
  meets the prespecified gate. Total-only and both also increased signed total
  error by `+0.057604` (interval `[+0.024554, +0.095873]`), increasing the
  baseline's positive total bias. The standard verifier passed all 38 pinned
  items. This does not justify a canonical rerun.

The paired primary-MAE intervals cross zero for catch-and-shoot, pull-up, and
created-points-per-pass; the drive total-head screen shows clear harm. Pull-up
and created-points-per-pass also show positive total-bias changes. No screen
supports adding its tracking feature to Candidate 100. These are opened-label
development screens, not independent validation; candidate-specific canonical
scoring/parity has not been run because no variant passed the finalist gate.
The passing anomaly has a pinned safe treatment and its screen is complete.
Detailed plans, source pins, screens, comparison outputs, and receipts are in
`runs/candidate100-player-tracking-drive-screen/`,
`runs/candidate100-player-tracking-catch-shoot-screen/`, and
`runs/candidate100-player-tracking-pullup-screen/`, and
`runs/candidate100-player-tracking-created-points-per-pass-screen/`.

## Candidate 100 play-type feature screen

`build-candidate100-playtype-alias-adapter.mjs` joins the versioned play-type feature artifact to the Candidate 57-derived source rows by game reference, verifies the Candidate 100 configuration and baseline forecast manifest, checks that the aliased Candidate 57 slots are unselected, and preserves all selected Candidate 100 feature values. It uses the prior-season semantic fields `playtype:matchupEfficiencyEdgeSumPriorSeason` and `playtype:homeAwayEfficiencyEdgeAdvantagePriorSeason` in the unused total and margin slots `c51:meanBoxscoreStealsPer100Possessions20` and `c51:boxscoreStealsRateAdvantage20`. The semantic columns remain present. The generated configurations are isolated artifacts, not a new official candidate.

The adapter ran one batched mean plan with three configurations: total-only, margin-only, and both. It reused the pinned Candidate 100 forecast/screen as the baseline. All four forecast files had 6,824 unique, identity-matched rows, and all four head-isolation comparisons were exactly equal across 6,824 rows. Each variant was scored on the same 6,150 targets (1,230 in each 2021–25 season) using the same canonical uncertainty settings.

The paired opened-label screen found no retention case:

- **Total-only:** raw total MAE increased by `0.00370` points (Candidate minus baseline; 95% exploratory date-block interval `[-0.00127, 0.00853]`). Total MAE increased in all five seasons. Brier, log loss and margin predictions were effectively unchanged, as expected because the margin head was held fixed.
- **Margin-only:** raw margin MAE and distribution margin MAE each increased by `0.00414` points (95% exploratory interval `[0.00014, 0.00754]`). Raw margin RMSE increased by `0.00142`; Brier increased by `0.0000832` and log loss by `0.0001811`, with both probability intervals crossing zero. Margin MAE, Brier and log loss worsened in each of the five seasons.
- **Both:** reproduced the total-only and margin-only effects independently; no added interaction benefit appeared.

The comparison used 1,000 common same-season circular date-block draws with seven observed-date blocks, seed `20261009`. These are opened-label screen intervals only; they have no shared-team resampling or maxT correction and are not independent validation. Per-season point metrics are reported without per-season intervals. Full pinned plans, forecasts, screens, comparison output and receipts are under `runs/playtype-alias-adapters/run-1791542769880-6528-23d98491-e245-4505-b4be-926e351cebeb/`.

For each of the three variant screens, fast-Gaussian versus configured-canonical scorer comparisons were `within-tolerance-not-parsed-exact` on all 6,150 targets. Structural/nonfinite/out-of-tolerance differences were zero; scored-row maximum absolute differences were `1.82e-11`–`1.93e-11`, ledger maxima `7.67e-13`–`1.08e-12`, and metric maxima `1.49e-13`–`1.24e-10`. Parsed values and files were not byte-identical. The paired model comparison uses the canonical results.

## Candidate 100 covariance and correlation audit

The final audit uses Candidate 100's exact selected predictor columns on the
same 6,150 target games from 2021–25 (1,230 per season). It excludes the
intercept, keeps each head's configured transformation, and reports sample
covariance in scaled-design units and Pearson correlation. It does not use
outcomes. The full covariance/correlation matrices, per-season summaries,
cross-head correlations, numerical rank, and source pins are in
`runs/playtype-alias-adapters/run-1791542769880-6528-23d98491-e245-4505-b4be-926e351cebeb/covariance-correlation/candidate100-2021-2025-v3/`.

Pooled, 40 total predictors had 91/780 pairs at `|r| >= 0.5`, 32 at `>= 0.7`,
8 at `>= 0.8`, 5 at `>= 0.9`, and none at `>= 0.95`. The numerical rank was
38/40 at relative pivot tolerance `1e-10`. The two dependencies are the
expected arithmetic overlap between the C51 averages of the two teams'
points-for/against and the pass-6 home/away points-for/against 10-game
columns. The strongest other total-head associations are 10-game versus
20-game scoring/allowance (about `0.91`), the top scorer versus top-usage
load share (`0.90`), and EWMA total versus venue total (`0.84`).

The 39 margin predictors had 106/741 pairs at `|r| >= 0.5`, 31 at `>= 0.7`,
24 at `>= 0.8`, 8 at `>= 0.9`, and 3 at `>= 0.95`. Numerical rank was 36/39.
Three pairs are exact linear duplicates in every season: C51 versus pass-6
10-game points-for advantage, defense-allowance advantage, and win-rate
advantage. Other strong overlaps include 20-game points-for/defense features,
opponent-adjusted strength versus recency strength/Elo, scorer concentration
versus usage concentration, and schedule-density versus five-in-seven
pressure.

Across the 40-by-39 cross-head comparisons, 36/1,560 pairs had `|r| >= 0.5`,
none reached `0.7`, and the maximum was about `0.663`; median absolute
correlation was `0.013`. Per-season rank and the three exact margin duplicates
were stable from 2021 through 2025. VIF and condition estimates are not
reported where the matrix is rank-deficient. Exact duplicates should be
tested with isolated ablations because retaining two copies changes their
effective ridge penalty; this descriptive audit alone is not a reason to
remove a predictor and is not predictive validation.

## Candidate 100 duplicate-feature ablation

Eight opened-label variants were fitted against the pinned Candidate 100
baseline on the same 6,150 games from 2021–25, then compared with the shared
1,000-replicate, seven-date-block paired screen. Variants removed one member of
the two total-head linear dependencies, one member of the three exact margin
duplicate pairs, or both. All variants used the same source rows, chronology,
settings and uncertainty scorer. The run and comparison receipts are under
`runs/candidate100-collinearity-ablation/run-1791544726688-6520/`; the
comparison index is
`runs/candidate100-collinearity-ablation/run-1791544726688-6520/comparisons/run-1791545095289-28972/comparison-index.json`.

The baseline pooled metrics were total MAE `14.64985`, margin MAE `10.84125`,
Brier `0.212410`, and log loss `0.612994`. Retaining the two team-average
10-game total features while removing the four corresponding home/away
pass-6 columns produced the largest total-MAE decrease (`0.00285` points;
95% interval `[-0.00720, 0.00101]`). Removing the two team-average features
instead decreased total MAE by `0.00157` (`[-0.00315, 0.00010]`). Both
intervals include zero. Removing the C51 margin aliases increased margin MAE
by `0.00059` (`[-0.00097, 0.00226]`); retaining the pass-6 aliases increased
it by `0.00067` (`[-0.00097, 0.00243]`). Those intervals also include zero.
Margin-alias removals raised Brier by `0.000023`–`0.000026` and log loss by
`0.000044`–`0.000049`, with both intervals crossing zero. Combined
representations showed the same small effects without a clear interaction.

This screen supports the diagnosis that duplicate columns change ridge
shrinkage, but it does not establish a robust prediction gain or select which
representation to retain. The model definition and Candidate 100 configuration
were not changed. These results are opened-label development evidence, not
independent validation.

## Mean plan

`format`: `swishiq-mean-batch-plan-v1`

Required fields:

- `features`: existing raw feature JSONL, before applying the head feature policy.
- `warmupSeasonStartYear`, `throughSeasonStartYear`: explicit, inclusive season bounds.
- `configurations`: an array of `{ id, configuration }` with unique IDs and versioned configuration paths.

Optional fields:

- `sourceManifest`: a manifest that pins the actual feature file. A manifest that only pins upstream package sources is insufficient.
- `sourcePathMap`: explicit relocation mapping for pinned paths.
- `cacheRoot`, `outputDirectory`: separate experiment output locations.
- `fullCoefficientRefits`: default `false`; compact refit hashes are written unless full coefficient snapshots are requested.
- `maxWorkers`: default `1`; larger values enable parallel fitting of unique mean signatures.
- Per configuration: `resumeCheckpoint` plus its required `resumeManifest` cache receipt.
- Per configuration: `parentDesignManifest` for an append-only extension from a version-2 experiment design receipt.

The example references the existing Candidate 100 mean manifest because its source pins include the exact Candidate 57 feature file. The older feature manifest has no pin for its own output file.

Numerically identical mean configurations share a result even when their version labels or uncertainty settings differ. The output uses a neutral `experiment-mean-signature-...` identifier, while `mean-index.json` records every requested version and configuration hash.

Missing selected total features retain the original warmup-center imputation. Margin predictors retain their existing strict finite-value requirement. The original head policy is applied once to raw rows. Missing blend source fields throw rather than becoming zero.

## Uncertainty plan

`format`: `swishiq-uncertainty-screen-plan-v1`

Required fields:

- `forecasts`: complete mean forecast JSONL including the earlier residual warmup sequence.
- `targetSeasonStartYears`: ascending season start years, such as `[2022, 2023, 2024, 2025]` for 2022–23 through 2025–26.
- `variants`: unique `{ id, settings, forceCanonical? }` records. Each settings object overrides the fixed mean configuration's uncertainty settings.

Optional fields:

- `sourceManifest`, `sourcePathMap`, `configuration`, `baseSettings`.
- `includeCalibrationSlope`: default `false`; other calibration metrics are always included.
- `fullReceiptIds`: variants for which complete scored rows and forecast ledgers are retained.
- `comparison`: `{ referenceId, seed, repetitions, blockLengthDates, includeDistributionLosses }`.
- `maxWorkers`: default `1`; larger values enable parallel scoring of unique setting signatures.

A supplied legacy mean manifest must pin both forecast bytes and the supplied configuration. For a new mean-cache receipt, numerical settings and the neutral signature must match. Mixing mean-model signatures in one file is rejected. Unpinned exploratory inputs are allowed, but receipts explicitly record unverified source provenance.

Default paired comparisons cover Brier, log loss and margin MAE. Set `includeDistributionLosses: true` to also compare home/away/margin MAE, CRPS and equal-weight interval score. Metric summaries always include side MAE/RMSE/bias, CRPS, interval score and 50/80/90/95% interval coverage/width.

## Cache and replay behavior

Cache keys include the source bytes, relevant settings, transitive local code pins, season range and target identity. Forecast parsing and hashing use the same input buffer, preventing a receipt from identifying different bytes than the rows used. Every completed cache output is checked by SHA-256 and byte length before reuse.

Stages use an exclusive lock per key and a unique temporary directory. A completed stage is renamed into place. Rerunning the same plan reuses completed matching caches. A failed or killed stage is recomputed; partial directories are retained for diagnosis, and abandoned locks require an ownership check before manual removal. This is stage-level restart support, not automatic recovery from a mid-date fit.

Checkpoint state is validated against its enclosing receipt, design signature, settings, dimensions, finite values and completed date boundary. A checkpoint resumes fitting on subsequent dates only. Its forecast file therefore contains **only new predictions**. The uncertainty runner rejects this partial sequence by itself. `compose-forecasts.mjs` now joins it with the pinned prefix, verifies every expected game against the design chronology and preserves the prediction values.

For an integrated resumed run, add `resumePrefix: { forecasts, manifest }` alongside `resumeCheckpoint` and `resumeManifest` in the mean configuration request. `run-plan.mjs` composes the complete sequence before scoring. Both sources must have identical mean settings and fitting-code pins. The design can stay identical or extend from the explicitly supplied `parentDesignManifest`, with byte-identical vectors, row metadata and standardization across the earlier prefix. A previously complete composition can supply the prefix for a later extension.

The optional top-level `featureExtension` stage in `run-plan.mjs` prepares a pinned append-only feature source and passes its output/receipt to the mean stage. Source relocation maps are retained in receipts for subsequent verification. See `INCREMENTAL-REUSE.md` for the contract, transfer requirements and limits. Older version-1 design receipts lack the raw-prefix contract required for copying into an extended design; they are preserved and are not silently upgraded.

Every game's feature/coefficient/standardization cutoff must precede its target date. All games on a local date are predicted before outcomes from that date update the fit or residual pool. No separate historical provider-availability proof is introduced.

Existing artifacts are never overwritten. Outputs inside the workspace must remain under `experiment-tools/`; the guard also resolves existing parent links before checking the location. No cleanup, deployment or candidate promotion is performed. Worker execution is limited to explicitly requested local experiment batches.

## Screen inference and full inference

The compact screen plan uses **circular blocks of observed game-date clusters**, separately within each season, with game-weighted paired loss differences. Off days do not form clusters. It has no shared-team resampling and no maxT correction. Its 95% percentile intervals are exploratory screen intervals and cannot replace the final inference. One-replicate and wholly degenerate date designs are rejected.

`run-inference.mjs` accepts a plan with:

```json
{
  "format": "swishiq-canonical-inference-plan-v1",
  "rows": "path/to/existing-canonical-paired-rows.jsonl",
  "sourceManifest": "path/to/manifest-that-pins-those-rows.json",
  "mode": "existing_candidate_mode_key",
  "replicates": 10000,
  "seed": 20261005,
  "blockLengths": [7, 14],
  "cacheRoot": "path/to/isolated/cache",
  "outputDirectory": "path/to/isolated/inference"
}
```

It requires the existing canonical paired-row schema, including opponent/team IDs and baseline side losses. The compressed screen losses are deliberately not substituted for that schema. The original inference retains calendar blocks including off days, shared-team counts, equal-season weighting and simultaneous maxT intervals.

The default `implementation: "original"` calls that method unchanged. The optional `implementation: "planned"` creates/reuses a shared binary draw plan keyed by the ordered game/team/date cohort, seed, replication count and block lengths. It then runs an experimental infrastructure port of the same loss arithmetic. The plan retains the original RNG order (teams, then seasons) and includes off days. Draws can be reused across candidates on an identical ordered cohort. The port refuses to run if the pinned original inference source changes. Its numerical parity has not been established; keep the original path for official receipts.

This wrapper computes inference only. It does not run the full validation gate evaluator or establish independent predictive validity.

## Telemetry interpretation

`telemetry.json` reports elapsed and CPU time, stage samples, memory snapshots and workload/cache counters. `maxRSS` is the process high-water value, not a separately sampled stage peak. Cached metric artifacts exclude runtime measurements; invocation telemetry describes the actual computation or reuse cost. `cacheBytesWritten` counts newly written uncertainty-stage payloads, not every invocation/manifest byte.

Execution defaults to in-process sequencing. Set `maxWorkers` to enable managed worker threads, bounded by the requested count, unique pending jobs and available CPU parallelism. Cache hits are checked before workers start, so a fully cached batch starts no worker threads. Duplicate numerical signatures are dispatched once and mapped back to the requested labels.

Mean workers share Float64 design buffers and parse shared design metadata lazily. Screen workers each parse the shared forecast payload once; the input file itself is read/parsed once in the parent. These worker parse counts are reported separately. Per-worker RSS and CPU readings include process activity and must not be summed as independent peaks/totals.

No RAM reserve or automatic memory gate has been introduced. The worker pool awaits termination on success or failure; the underlying API also accepts an AbortSignal. A forced termination may leave a locked partial cache for review, with PID and thread ID recorded. No servers or background timers are created.

## Mean batch throughput benchmark

`benchmark-mean-pair.mjs` compared the original one-process-per-setting runner
with the optimized batch runner using the full 2020–26 feature file and four
ridge-total settings (λ 150, 175, 200 and 225). Each optimized worker count was
measured in eight pairs. Runner order alternated four times each way, and each
configuration position was tested once under each runner order. Every one of
the 32 variant-by-pair comparisons was exact: 6,824 forecasts and 27,296
prediction values per variant, with no missing, extra, metadata-different or
numerically different predictions.

| Optimized workers | Median wall: original → batch | Paired wall ratio | Median CPU: original → batch | Paired CPU ratio | Median peak RSS: original → batch | Paired RSS ratio |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 4,219 → 4,346 ms | 1.043 | 5,522 → 4,750 ms | 0.867 | 278 → 305 MiB | 1.099 |
| 2 | 4,061 → 3,470 ms | 0.713 | 5,296 → 6,883 ms | 1.019 | 278 → 321 MiB | 1.153 |
| 4 | 3,639 → 1,861 ms | 0.518 | 4,836 → 6,078 ms | 1.240 | 278 → 429 MiB | 1.541 |

For this four-setting grid, one optimized worker saved CPU but did not reduce
wall time. The two-worker median of paired wall ratios was 0.713; the separate
median wall times were 4.061 s original and 3.470 s batched. Its paired CPU
ratio was 1.019 and paired RSS ratio was 1.153. At four workers, the paired ratio was 0.518
and the separate medians were 3.639 s original and 1.861 s batched, with about
24% more CPU and 54% higher peak RSS. Two workers are the balanced choice for
this measured grid; four prioritize elapsed time. These findings do not
establish a general speedup for a single model or another feature family.
Receipts: `runs/phase1-multiconfig-workers1-orthogonal-benchmark-20261009/benchmark-receipt.json`,
`runs/phase1-multiconfig-workers2-orthogonal-benchmark-20261009/benchmark-receipt.json`,
and `runs/phase1-multiconfig-workers4-orthogonal-benchmark-20261009/benchmark-receipt.json`.

## Screen worker scaling benchmark

`benchmark-screen-workers.mjs` reruns a fixed uncertainty-screen plan in a fresh
process and cache for each worker count. It counterbalances the order of worker
counts across repetitions, captures process wall/CPU/peak-RSS telemetry, and
requires byte-identical result artifacts. The paired comparison/bootstrap
stage is omitted so the measurement isolates scoring and screen summaries. The
six repetitions use three cyclic worker-order rotations repeated twice. This
balances each worker count across first, second and third position, though the
same order permutations repeat and predecessor effects remain possible. Parent
wall time covers child-process startup, scoring and captured output; report
validation and parity checks happen afterward, outside that boundary.

Candidate 100's three residual-window settings were measured six times each at
1, 2 and 3 workers:

| Target seasons | Targets | Workers | Median parent wall | Paired wall ratio vs 1 worker | Median CPU | Median peak RSS |
|---|---:|---:|---:|---:|---:|---:|
| 2022–26 | 4,920 | 1 | 994 ms | 1.000 | 1,079 ms | 139 MiB |
| 2022–26 | 4,920 | 2 | 1,021 ms | 1.002 | 1,797 ms | 233 MiB |
| 2022–26 | 4,920 | 3 | 720 ms | 0.723 | 1,915 ms | 265 MiB |
| 2021–25 | 6,150 | 1 | 1,181 ms | 1.000 | 1,313 ms | 154 MiB |
| 2021–25 | 6,150 | 2 | 1,094 ms | 0.855 | 1,915 ms | 249 MiB |
| 2021–25 | 6,150 | 3 | 883 ms | 0.698 | 2,430 ms | 301 MiB |

For these three-setting batches, three workers were fastest in both cohorts,
but used roughly 1.8–1.9 times the CPU and 1.9–2.0 times the peak memory of
serial scoring. Two workers were near serial wall time on 2022–26 and modestly
faster on 2021–25. Use these results only as a starting point for similarly
sized screens; they do not establish a universal worker default. The exact
receipts are `runs/phase1-candidate100-screen-workers-20261009/benchmark-receipt.json`
and `runs/phase1-candidate100-screen-workers-2021-25-20261009/benchmark-receipt.json`.

## Work still required before this replaces the existing workflow

1. Repeat the mean benchmark on another feature/season workload and profile why the single-configuration cold optimized path is slower; the four-setting throughput result is workload-specific.
2. Extend scorer parity across supported settings and distribution variants, and cover selected source-family checkpoints. Mean forecasts match exactly on the full source corpus; the 2021–25 Candidate 100 fast/canonical comparison is within numeric tolerance, not parsed-value exact. Sequential/parallel means and checkpoint composition already match on the bounded fixture.
3. Screen-worker scaling is measured for three settings on two Candidate 100 cohorts; repeat for other scorer/distribution families and shared full-method draw reuse. Establish exact sample-hash parity for the experimental inference port before using it officially.
4. Finish feature-family generation/union orchestration and the complete EWMA/Elo/player-state checkpoints. The play-type family is built and screened through Candidate 100; its tested total/margin additions did not improve 2021–25 results and were not retained. Drive, catch-and-shoot, pull-up and created-points-per-pass tracking features are screened and not retained; the passing screen's preflight verified the zero-pass anomaly exclusion and player fallback. Feature/design append and indexed history/SRS groundwork are implemented; existing source builders still produce the raw feature rows. The new SRS helper does not aggregate floating-point normal equations across seasons or replace the canonical source builder.
5. Integrate the optimized path with the existing canonical final runner only after parity is established. Existing gates and promotion rules continue to govern model decisions.

The status of each phase and the performed checks is recorded in `IMPLEMENTATION-STATUS.md`.
