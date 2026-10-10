# Candidate100 Cycle 5 tuning ledger — 2026-10-10

Purpose: keep completed Candidate100 tuning work from being repeated after the adjusted-pace screen completed.

**Evidence status:** opened-label development screens, not independent predictive validation. The fit and ridge receipts cover 4,920 games from 2022–23 through 2025–26 (1,230 per season), with 1,000 same-season, circular seven-date-block paired resamples. Screen intervals do not account for shared-team clustering or multiple-comparison selection. No artifact literally named “Cycle 5” was found under `docs/` or `experiment-tools/runs/`; this ledger reconciles the completed October 10 calibration, fit-setting, and ridge grids in the receipts below.

| Screen | Completed grid against Candidate100 | Result and disposition |
|---|---|---|
| Post-mean calibration | Anchor: total-model blend 0.90, total offset +0.20, margin scale 1.025. Tested blend weights 0.85/0.95; margin scales 1.000/1.050; total offsets 0.00/0.40; and the combined 0.95 blend with offsets 0.00/0.05/0.10/0.15. | **Provisional mean-score lead only:** blend 0.95 + offset 0.00, margin scale unchanged, gives total MAE Δ −0.00696; all four seasons have a negative point delta. The calibration interval is [−0.01437, +0.00111]; the later paired full-comparison interval is [−0.01539, +0.00110]. Candidate101's paired uncertainty comparison leaves Brier/log loss unchanged and shows mixed home/away distribution changes whose intervals cross zero. Receipts remain `not-promoted`, `promotionAllowed: false`, and require a canonical final rerun. Keep Candidate100 as the retained setting; do not repeat this grid. |
| Fit settings | Anchor: half-life 720 days, refit every 3 days. One-at-a-time alternatives: half-life 360 or 1,080 days; refit every 1 or 5 days. | **No retained win.** Refit every day has the best total MAE point change (−0.00219), but margin MAE rises +0.00050 and all pooled intervals cross zero. Retain 720 days / 3 days; reopen only if a later selected feature or calibration change gives a concrete reason. |
| Ridge by head | Anchor: total/margin ridge 200/400. One-head alternatives: total ridge 150/250; margin ridge 300/500. | **No retained win.** Total ridge 250 gives total MAE Δ −0.000697, but its interval crosses zero and 2025–26 regresses. Margin ridge 500 gives margin MAE Δ −0.001021 and slightly better probability point estimates, but intervals cross zero and margin MAE worsens in both latest seasons. Retain 200/400; do not repeat this grid. |

## Completed pace comparison and next action

The distinct opponent-adjusted pace total-head screen is complete and rejected: total MAE Δ +0.000631, paired interval [−0.004142, +0.005711], with two improving and two worsening seasons. Margin predictions were unchanged; Brier and log loss differed only by floating-point noise. See [pace results](swishiq-candidate100-adjusted-pace-screen-results-20261010.md). Do not repeat the pace or mean-setting grids.

Reconcile existing uncertainty receipts, then run only unresolved distribution settings using fixed mean predictions. Retain the 0.95 blend / zero-offset Candidate101 as a provisional finalist for the consolidated assessment. The project permits small intended-metric gains without requiring the interval to exclude zero; mixed evidence remains provisional and promotion still requires the coherent final assessment.

## Receipts

- [Candidate100 model-improvement plan](swishiq-model-improvement-project-plan-v1.md)
- [Post-mean calibration run summary](../prototypes/swishiq-package-v4/experiment-tools/runs/candidate100-postmean-calibration/run-1791653769918/summary.md), [calibration screen JSON](../prototypes/swishiq-package-v4/experiment-tools/runs/candidate100-postmean-calibration/run-1791653769918/postmean-calibration-screen.json), [paired full-comparison receipt](../prototypes/swishiq-package-v4/experiment-tools/runs/candidate100-postmean-calibration/run-1791653769918/paired-full-comparison/run-1791653865214-24376/comparison-index.json), and [offset refinement summary](../prototypes/swishiq-package-v4/experiment-tools/runs/candidate100-postmean-calibration/refine-1791653899938/summary.md)
- [Fit-setting screen summary](../prototypes/swishiq-package-v4/experiment-tools/runs/candidate100-fit-setting-screen-20261010/summary.md) and [paired comparison receipt](../prototypes/swishiq-package-v4/experiment-tools/runs/candidate100-fit-setting-screen-20261010/paired-comparison/run-1791654887141-22900/comparison-index.json)
- [Ridge screen summary](../prototypes/swishiq-package-v4/experiment-tools/runs/candidate100-ridge-head-screen-20261010/summary.md) and [paired comparison receipt](../prototypes/swishiq-package-v4/experiment-tools/runs/candidate100-ridge-head-screen-20261010/paired-comparison/run-1791655584716-26760/comparison-index.json)
- [Candidate100 + Candidate21 raw box-score results](swishiq-candidate100-candidate21-raw-boxscore-screen-results-20261010.md)
