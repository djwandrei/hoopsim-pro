# Candidate100 Cycle 5 uncertainty tuning queue — 2026-10-10

Purpose: record completed comparable uncertainty screens, distinguish scored results from validated-but-unrun schedules, and define a compact follow-up against the selected Candidate101 mean forecast.

**Evidence boundary:** the available screens use opened labels and are development evidence, not independent validation. Candidate101 (total blend 0.95, total offset 0.00) is the provisional mean finalist. Its uncertainty receipt scored only the current uncertainty settings; that does not count as tuning the uncertainty settings. Keep mixed evidence provisional. A small useful point gain can be retained without requiring an exploratory interval to exclude zero, provided the other primary metrics and seasons do not show repeated harm.

## Completed and planned settings

Candidate100 uncertainty reference: 2,500 residual games; full pool; total and margin residual scales 1.00; total/margin correlation retention 0; variance adaptation blend 0 with 200-game window; Gaussian blend 1; conditional variance blend 0 (ridge 500, score heads); total bias retention 0.20; margin bias retention 0; bias window 190; rolling residual calendar; integer score support off.

| Setting | Comparable scored evidence | Existing plans that did not score | Disposition |
|---|---|---|---|
| Residual window | 1,000 and 1,500, versus 2,500, were scored on the same 4,920 targets with the existing fast-Gaussian scorer. Brier/log loss moved slightly worse at both settings. Distribution changes were mixed: 1,000 raised home and margin CRPS while lowering away CRPS; 1,500 raised all three slightly. No paired comparison interval was emitted. | 500 and 3,500 were scheduled in the fast cost matrix. | Do not repeat 1,000/1,500 as Candidate100 screens. The 500/3,500 settings remain unscored. Use them only in the finalist-focused compact grid below. |
| Total/margin residual scales | Only 1.00/1.00 is scored in the comparable receipts. | The cost-matrix plans explicitly left scalar scales out; no non-1.00 values were scheduled. | Both scales remain unresolved. |
| Total/margin correlation retention | Only 0 was scored in the comparable receipts. | Retention 1 was scheduled in the fast cost matrix. | Retention 1 remains unscored. |
| Variance adaptation | Blend 0 / 200-game window is the scored reference. | Blend 1 / 200-game window was scheduled in the fast cost matrix. | Blend 1 remains unscored; changing only the window while blend is 0 would not activate this calculation. |
| Gaussian/distribution blend | Only Gaussian blend 1, conditional variance blend 0, is scored as the comparable reference. Candidate101 also has one uncertainty screen at those settings, with unchanged Brier/log loss and mixed small home/away distribution changes. | Gaussian blend 0 and 0.5, and conditional variance blend 1, were scheduled in the configured-canonical matrix. Those matrix revisions end at `matrix-validated; scoring-not-run`; they are not results. | These settings remain unscored. Gaussian blend 0 must be paired with `integerScoreSupport: true` to satisfy the documented configuration constraint. |

The fast worker benchmark receipt reports six repetitions at worker counts 1, 2, and 3, but explicitly omits the paired comparison/bootstrap stage. Its residual-window metrics are useful exploratory point results, not interval evidence. The cost-matrix rev3 validation receipt reports 8 cases × 4 repetitions and 32 validated plans with empty caches and scoring not run.

## Compact next grid

Use the Candidate101 mean forecast already produced at `prototypes/swishiq-package-v4/experiment-tools/runs/candidate100-postmean-calibration/run-1791653769918/total-blend-095-offset-000-forecast-means.jsonl`, with its matching configuration and source manifest. Hold the forecast file fixed across all rows; do not rerun or retune the mean model inside this comparison.

| Row | Change from finalist uncertainty reference |
|---|---|
| Reference | All settings below at Candidate100 reference values. |
| Residual window 500 | `residualWindowGames: 500` |
| Residual window 3,500 | `residualWindowGames: 3500` |
| Total scale low / high | `totalResidualScale: 0.95` / `1.05`, one row per value; margin scale remains 1.00. |
| Margin scale low / high | `marginResidualScale: 0.95` / `1.05`, one row per value; total scale remains 1.00. |
| Correlation retention | `totalMarginCorrelationRetention: 1` |
| Variance adaptation | `varianceAdaptationBlend: 1`, `varianceWindowGames: 200` |
| Gaussian blend 0.5 | `gaussianBlend: 0.5` |
| Empirical distribution | `gaussianBlend: 0`, `integerScoreSupport: true`; preserve the configured tie mode. |
| Conditional variance | `conditionalVarianceBlend: 1`; keep ridge 500 and score heads. |

This is 11 alternatives plus the reference. Each row changes one active uncertainty factor; the empirical-distribution row also enables the required integer-support mode. Keep every other setting at the reference values, including full pooling, 2,500 residuals unless a row changes the window, bias settings, rolling calendar, and 0.95/+0.00 Candidate101 means.

## Reference cutoff and acceptance record

- Targets: 2022–23 through 2025–26, 4,920 games (1,230 per season). The existing chronology has 6,824 rows including 2020 warmup and target identity SHA-256 `882f0fefac210cd093c1ef44404a312a21d7c4f4b7e64b239b3162088a6dd9ef`.
- Preserve prediction-before-feedback: features and residuals for each target may use only earlier dates; exclude same-date outcomes. Require identical ordered target identities and complete coverage for every grid row.
- Report paired changes for Brier/log loss, home/away/margin CRPS, interval score and coverage, plus per-season point results. Include paired date-block intervals as uncertainty context; do not make interval exclusion a promotion gate. A small useful gain may be retained when other primary metrics and seasons do not show repeated harm. Mark mixed directions or metric tradeoffs provisional.
- This remains an opened-label tuning screen. Any selected uncertainty change still needs the planned canonical assessment and a readable settings specification before it is treated as accepted.

## Receipts and plans

- [Candidate100 worker benchmark receipt](../prototypes/swishiq-package-v4/experiment-tools/runs/phase1-candidate100-screen-workers-20261009/benchmark-receipt.json) and a representative [scored screen index](../prototypes/swishiq-package-v4/experiment-tools/runs/phase1-candidate100-screen-workers-20261009/rep-01/workers-1/output/run-1791548931758-18404/screen-index.json)
- [Candidate101 post-mean calibration summary](../prototypes/swishiq-package-v4/experiment-tools/runs/candidate100-postmean-calibration/run-1791653769918/summary.md), [uncertainty screen index](../prototypes/swishiq-package-v4/experiment-tools/runs/candidate100-postmean-calibration/run-1791653769918/uncertainty-screen/run-1791653846146-24896/screen-index.json), and [paired full-comparison index](../prototypes/swishiq-package-v4/experiment-tools/runs/candidate100-postmean-calibration/run-1791653769918/paired-full-comparison/run-1791653865214-24376/comparison-index.json)
- [Fast cost-matrix example](../prototypes/swishiq-package-v4/experiment-tools/examples/candidate100-screen-cost-matrix-fast-20261009-rev3.json), [canonical cost-matrix example](../prototypes/swishiq-package-v4/experiment-tools/examples/candidate100-screen-cost-matrix-canonical-20261009-rev3.json), and [canonical rev3 validation receipt](../prototypes/swishiq-package-v4/experiment-tools/runs/candidate100-screen-cost-matrix-canonical-20261009-rev3/validation-only-result.json)
