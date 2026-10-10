# Candidate100 opponent-adjusted pace screen — 2026-10-10

## Decision

Do not add this formulation to the selected model. Its intended pooled total MAE worsened slightly, two seasons improved and two worsened, and margin and probability predictions did not improve. The small total RMSE improvement does not justify a combination screen. This decision applies to the tested formula, not to every possible pace feature.

These are development results from already inspected seasons, not independent predictive confirmation. Candidate100 remains the comparison reference and current retained configuration.

## Feature and chronological construction

The addition was `c21:meanOpponentAdjustedPace20` in the total head only. Candidate100's other features and settings were fixed: total/margin ridge 200/400, 720-day training half-life, three-day refit cadence, total-model blend 0.90, total offset +0.20, margin scale 1.025, and its 2,500-game Gaussian residual configuration.

1. Estimate each team's possessions from its player-game rows: `FGA + 0.44 × FTA − OREB + TOV`.
2. Let game pace `p` be the mean of the paired home and away estimates.
3. Before any results from the target date enter state, estimate each team's expected pace `P` from its last 20 adjusted observations, with eight prior-equivalent games at the earlier league pace.
4. Append the home observation `2p − Paway` and the away observation `2p − Phome` after all snapshots for that date are fixed.
5. Use the average of the two pregame `P` values as the total-head predictor.

History carries across season boundaries. The initial league pace anchor is 100; afterward the anchor uses earlier eligible paired games. Invalid or missing paired possession denominators fail closed. The original box-score context and source model stay unchanged, and the adjustment is implemented in a separate versioned helper. Source-manifest verification passed all 12 pins.

This is possessions per game, without a regulation-minute adjustment for overtime. It is not a direct measurement of possession duration.

## Results

The comparison uses 4,920 identical targets, 1,230 in each season from 2022–23 through 2025–26. Differences are candidate minus Candidate100; lower loss values are better.

| Metric | Candidate100 | Adjusted pace | Difference |
|---|---:|---:|---:|
| Total MAE | 14.639368 | 14.640000 | +0.000631 |
| Total RMSE | 18.465540 | 18.465308 | −0.000232 |
| Signed total error | +0.037000 | +0.054776 | +0.017775 |
| Margin MAE | 10.801747 | 10.801747 | 0 |
| Brier | 0.211223 | 0.211223 | Floating-point noise only |
| Log loss | 0.610192 | 0.610192 | Floating-point noise only |

The paired total-MAE 95% percentile interval is **[−0.004142, +0.005711]**. The signed-error change has interval **[+0.004042, +0.032572]**. Home and away CRPS changes were small, mixed, and had intervals spanning zero.

| Season | Total MAE difference |
|---|---:|
| 2022–23 | −0.000976 |
| 2023–24 | +0.006235 |
| 2024–25 | +0.000860 |
| 2025–26 | −0.003594 |

The screen used 1,000 paired, same-season circular resamples with seven-local-date blocks and seed 20261010. Predictions were aligned by target identity before comparing losses. These intervals do not include shared-team resampling or a correction for selecting among many experiments.

## Reuse and checks

- The artifact covered 7,230 source games and 228,883 eligible player rows; the recorded duplicate count and invalid same-date count were zero.
- The baseline reused its existing mean forecasts. Only uncertainty scoring was refreshed after the scorer source pin changed; the refreshed baseline summary and settings matched its earlier receipt exactly.
- The paired date-resampling plan was reused from the existing cache.
- The context harness passed three cases covering same-date snapshots, shrinkage, season carryover, the 20-game tail, immutable baseline contexts, and invalid possession rejection.
- This screen changed no production model, Studio asset, package, or live site file.

## Receipts

- [Compact result receipt](swishiq-candidate100-adjusted-pace-screen-summary-20261010.json)
- [Feature artifact](../prototypes/swishiq-package-v4/experiment-tools/runs/adjusted-pace-artifacts/run-1791658872936-28916-c6fed473-1340-49ca-ba72-4d61b0aec873/run.json)
- [Candidate completion receipt](../prototypes/swishiq-package-v4/experiment-tools/runs/adjusted-pace-screen/run-1791658905689-84f85e75-992e-4070-8666-6110798f1cfe/candidate-pipeline/run-1791658911186-29060/complete.json)
- [Baseline scoring parity](../prototypes/swishiq-package-v4/experiment-tools/runs/adjusted-pace-screen/run-1791658905689-84f85e75-992e-4070-8666-6110798f1cfe/baseline-rescore-parity.json)
- [Paired comparison](../prototypes/swishiq-package-v4/experiment-tools/runs/adjusted-pace-screen/run-1791658905689-84f85e75-992e-4070-8666-6110798f1cfe/comparison/run-1791659169752-28232/comparison-index.json)
