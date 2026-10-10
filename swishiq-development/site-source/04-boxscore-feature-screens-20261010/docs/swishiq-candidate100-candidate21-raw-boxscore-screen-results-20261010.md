# Candidate100 + Candidate21 raw box-score screen

**Date:** 2026-10-10

**Status:** Completed development screen; no feature promoted.

**Reference:** Candidate100, unchanged.

**Cohort:** 4,920 games, 2022–23 through 2025–26 (1,230 per season).

**Inference:** 1,000 paired seven-local-date-block bootstrap replicates. All reported deltas are candidate minus Candidate100; positive error deltas are worse.

## Setup

Each variant added one Candidate21 raw, strictly prior 20-game feature family to one Candidate100 head. Pace and each margin variant add one predictor; each total Four-Factor variant adds two predictors (own and opponent means). All other mean-model inputs, training order, uncertainty settings, targets, and paired resamples were fixed. The Candidate21 20-game measures use the existing eight-game prior shrinkage. Same-date outcomes were excluded. The seven additions were:

| Variant | Head | Added feature |
|---|---|---|
| `c21-pace-total` | Total | Mean box-score pace |
| `c21-turnover-total` | Total | Own/opponent turnover-rate context |
| `c21-offensiveRebound-total` | Total | Own/opponent offensive-rebound-rate context |
| `c21-freeThrow-total` | Total | Own/opponent free-throw-rate context |
| `c21-turnover-margin` | Margin | Turnover matchup advantage |
| `c21-offensiveRebound-margin` | Margin | Offensive-rebound matchup advantage |
| `c21-freeThrow-margin` | Margin | Free-throw matchup advantage |

All seven variants scored the same 4,920 targets. The paired comparison uses the pinned Candidate100 baseline screen and exact unchanged Candidate100 mean forecasts for its baseline row. The report is `opened-label-screen-only; not-independent-validation`.

## Pooled paired results

| Variant | Δ intended MAE (95% paired CI) | Δ RMSE | Δ Brier | Δ log loss | Decision |
|---|---:|---:|---:|---:|---|
| Pace, total | +0.00148 `[-0.00634, +0.00944]` | −0.00028 | 0.00000 | 0.00000 | Reject this formulation; no intended-metric gain. |
| Turnover, total | +0.00529 `[-0.00171, +0.01193]` | +0.00523 | 0.00000 | 0.00000 | Reject; MAE/RMSE worsen, and home-score distribution MAE worsens with a paired interval above zero. |
| Offensive rebound, total | **−0.00610** `[-0.02616, +0.01488]` | **−0.00166** | 0.00000 | 0.00000 | Provisional only; tiny MAE/RMSE point gains are uncertain and accompanied by a clear +0.265-point increase in total signed error. Do not combine yet. |
| Free throw, total | −0.00058 `[-0.00842, +0.00787]` | +0.00271 | 0.00000 | 0.00000 | Do not retain; a negligible MAE point gain is uncertain and RMSE worsens. Signed error shifts −0.02162 points, but that is not enough to establish a useful total forecast gain. |
| Turnover, margin | +0.00663 `[-0.00037, +0.01436]` | +0.00590 | +0.000119 | +0.000240 | Reject; all point changes in the primary margin/probability metrics are adverse. |
| Offensive rebound, margin | +0.00314 `[-0.00644, +0.01275]` | +0.00026 | +0.000079 | +0.000179 | Reject; margin MAE and probability point estimates worsen. A small margin interval-score improvement is uncertain. |
| Free throw, margin | +0.00146 `[-0.00212, +0.00493]` | +0.00164 | +0.000032 | +0.000048 | Reject; margin MAE, Brier, log-loss, and margin CRPS point estimates worsen. |

Candidate100 baseline: total MAE 14.63937, total RMSE 18.46554, signed total error +0.03700; margin MAE 10.80175, margin RMSE 13.82907; Brier 0.211223 and log loss 0.610192.

For every total-head addition, the paired 95% interval for raw total MAE includes zero. The total-head variants leave the margin mean and win-probability point metrics unchanged to floating-point precision. For every margin-head addition, the paired 95% intervals for margin MAE, Brier, and log loss include zero. The additions therefore show no reliable pooled primary-metric improvement.

### Score-distribution effects

The additions also do not establish an overall score-distribution benefit. For the only total-head candidate with a favorable raw MAE and RMSE point estimate (offensive rebound), home-score CRPS changes by −0.00042 and away-score CRPS by +0.00028; both paired intervals include zero. Its total signed-error change is +0.26502 points with a 95% interval `[+0.22903, +0.29672]`, increasing mean overprediction from +0.03700 to approximately +0.30202. The turnover-total feature raises home-score distribution MAE by +0.00443 with a 95% interval `[+0.00100, +0.00795]`. Other home/away CRPS and interval-score changes are small and their paired intervals include zero. Margin-head distribution changes are likewise uncertain.

## Per-season intended-metric deltas

Values are candidate minus Candidate100 MAE; negative is better. This exposes season variation rather than hiding it in the pooled mean.

| Variant | 2022–23 | 2023–24 | 2024–25 | 2025–26 |
|---|---:|---:|---:|---:|
| Pace, total | −0.00028 | +0.00221 | +0.00318 | +0.00081 |
| Turnover, total | +0.01014 | +0.00122 | +0.00455 | +0.00526 |
| Offensive rebound, total | +0.00365 | −0.02874 | −0.00031 | +0.00102 |
| Free throw, total | +0.00415 | +0.00722 | −0.00229 | −0.01141 |
| Turnover, margin | +0.01656 | +0.00741 | +0.00201 | +0.00053 |
| Offensive rebound, margin | +0.00299 | +0.00465 | +0.01022 | −0.00531 |
| Free throw, margin | +0.00171 | +0.00205 | +0.00242 | −0.00035 |

Season values are descriptive development results, not separate validation. No candidate shows a stable intended-head gain across the seasons. The intervals are exploratory: the current screen does not adjust for screening seven candidates/many endpoints and does not resample by shared team. An isolated interval above or below zero should not be presented as a confirmatory test.

## Redundancy and decision

The separate pre-outcome covariance/correlation audit found **no C21 addition with absolute Pearson correlation at least 0.80 against any active Candidate100 feature** on the 2022–26 cohort. Therefore the lack of improvement is not explained by a high linear correlation with the current feature set. Covariance/correlation do not establish predictive value, and nonlinear or conditional overlap is not ruled out.

The combined primary-metric, bias, uncertainty, and per-season evidence does not justify retaining an addition. Do not run combinations from this raw-feature screen. The raw offensive-rebound total feature can remain a low-priority provisional follow-up if a later formulation directly tests reduced contribution or a predeclared calibration correction, but do not promote it based on this inspected cohort. Proceed to opponent-adjusted pace/efficiency and opponent-adjusted Four Factors as distinct, predeclared additions; keep the same Candidate100 anchor, target cohort, feature cutoffs, and uncertainty configuration.

## Reproduction receipts

- Screen preparation: `prototypes/swishiq-package-v4/experiment-tools/runs/candidate100-candidate21-boxscore-individual/run-1791616949620-3c251eb0-5179-463e-a8af-5389bac30991/candidate-pipeline-plan.json`.
- Completed feature pipeline: `prototypes/swishiq-package-v4/experiment-tools/runs/workflow/run-1791616987427-b63dda97-c9f3-4d28-beed-f8848a9d78dc/workflow.json`.
- Paired comparison index: `prototypes/swishiq-package-v4/experiment-tools/runs/candidate100-candidate21-boxscore-individual/run-1791616949620-3c251eb0-5179-463e-a8af-5389bac30991/prototypes/swishiq-package-v4/experiment-tools/runs/candidate100-candidate21-boxscore-individual/run-1791616949620-3c251eb0-5179-463e-a8af-5389bac30991/comparison/run-1791617599993-15772/comparison-index.json`.
- Feature-artifact run receipt (pins feature rows): `prototypes/swishiq-package-v4/experiment-tools/runs/candidate21-boxscore-feature-artifacts/run-1791616734032-8556-dde0c78a-b7b5-412e-97c4-04e4ce3c6ede/run.json`.
- Covariance/correlation report: `prototypes/swishiq-package-v4/experiment-tools/runs/candidate100-candidate21-covariance/run-1791617543662-8106abc8-fd34-4a28-9f6e-11317e3cd53f/covariance.md`.
- Feature formulas and data constraints: [`swishiq-candidate100-fourfactor-overlap-review-20261010.md`](swishiq-candidate100-fourfactor-overlap-review-20261010.md), [`swishiq-candidate21-screen-field-map-20261010.md`](swishiq-candidate21-screen-field-map-20261010.md), and [`swishiq-opponent-adjusted-screen-readiness-20261010.md`](swishiq-opponent-adjusted-screen-readiness-20261010.md).
