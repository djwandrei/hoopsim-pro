# Candidate100 + opponent-adjusted Four Factors

Date: 2026-10-10. Status: completed development screen; no addition retained. Candidate100 remains unchanged.

## Data and formulas

Each of the eight variants adds one predictor to one head. The adjusted rate is the team’s own prior-game factor minus the difference between its opponent’s prior allowed factor and the prior league allowed-factor mean. The last 20 adjusted observations are shrunk toward the prior league adjusted-factor mean with eight prior-equivalent games. eFG, turnover, offensive-rebound and free-throw rates are fractions. Total features average home and away rates; margin features take half the home-minus-away difference, reversing turnover so positive means fewer home turnovers.

The source artifact contains 7,230 rows (2020–21 through 2025–26), all with strictly prior-date cutoffs. The additional source audit checks 228,883 eligible player-game rows, finding no duplicate player-game identities or impossible made/attempt counts. The selected Candidate100 values and target identities are unchanged. The 4,920 target games cover 2022–23 through 2025–26, with 1,230 games per season. Every date’s predictions precede feedback from that date.

## Pooled paired results

All deltas are candidate minus Candidate100. Negative loss deltas favor the addition. The MAE is computed directly for the total or margin head; it is not the sum of home/away score MAEs.

| Variant | Head | Intended MAE delta | 95% paired interval | RMSE delta | Brier delta | Log-loss delta |
|---|---|---:|---|---:|---:|---:|
| effectiveFieldGoal | total | -0.000511 | [-0.001930, 0.000775] | 0.000723 | 0.000000 | 0.000000 |
| turnover | total | 0.002142 | [-0.002664, 0.007168] | 0.001305 | 0.000000 | 0.000000 |
| offensiveRebound | total | 0.002271 | [-0.002473, 0.006434] | 0.002504 | 0.000000 | 0.000000 |
| freeThrow | total | 0.002229 | [-0.002196, 0.006494] | 0.002330 | 0.000000 | 0.000000 |
| effectiveFieldGoal | margin | -0.000438 | [-0.003585, 0.002911] | 0.000661 | 0.000002 | 0.000005 |
| turnover | margin | 0.003799 | [-0.001735, 0.009765] | 0.003478 | 0.000038 | 0.000071 |
| offensiveRebound | margin | 0.005990 | [-0.002501, 0.015472] | 0.005783 | 0.000188 | 0.000404 |
| freeThrow | margin | 0.003115 | [-0.001094, 0.007327] | 0.003222 | 0.000058 | 0.000126 |

Candidate100 baseline: total MAE 14.639368, margin MAE 10.801747, Brier 0.211223, log loss 0.610192.

## Per-season intended MAE deltas

| Variant | Head | 2022–23 | 2023–24 | 2024–25 | 2025–26 |
|---|---|---:|---:|---:|---:|
| effectiveFieldGoal | total | -0.000641 | 0.000258 | -0.001033 | -0.000630 |
| turnover | total | 0.003105 | 0.000331 | 0.004053 | 0.001081 |
| offensiveRebound | total | 0.000774 | 0.006962 | 0.005275 | -0.003928 |
| freeThrow | total | 0.001739 | 0.004253 | 0.003185 | -0.000260 |
| effectiveFieldGoal | margin | 0.000879 | -0.003844 | 0.001103 | 0.000109 |
| turnover | margin | 0.005711 | 0.004773 | 0.000779 | 0.003933 |
| offensiveRebound | margin | 0.015858 | 0.004940 | 0.006096 | -0.002935 |
| freeThrow | margin | 0.001995 | 0.005908 | 0.001520 | 0.003035 |

## Decision and guardrails

All intended-MAE, Brier and log-loss intervals include zero. The total-head additions leave the margin and win probabilities unchanged apart from floating-point arithmetic. No new primary benefit is established.

Adjusted eFG in the total head reduces MAE by 0.000511 points, but raises RMSE by 0.000723. Home and away CRPS point estimates worsen. Away interval score rises by 0.002895 (exploratory 95% interval [0.000028, 0.005761]). It remains provisional and is not selected.

Adjusted eFG in the margin head reduces MAE by 0.000438, but raises RMSE, Brier, log loss and margin CRPS. Margin MAE worsens in three of four seasons; the small pooled improvement comes from 2023–24. It is not selected.

The other six variants worsen intended MAE. Adjusted turnover-margin raises away interval score by 0.017536 (95% interval [0.004593, 0.029984]); adjusted offensive-rebound-margin raises home CRPS by 0.002485 (95% interval [0.000286, 0.004902]). These are additional adverse development diagnostics. None justifies a combination pass.

The intervals use 1,000 shared same-season circular seven-date-block draws over 651 local-date clusters. They are exploratory percentile intervals, without shared-team resampling or maxT/multiple-screen adjustment. A single interval excluding zero is not confirmatory evidence. Already-inspected seasons provide development evidence only.

## Source preservation and reuse

The original raw builder was restored byte for byte (SHA-256 `508da7bd1f33c561fa6e10661813cf30ed28ab32b064a64991f083394bf0b49f`). The adjusted-capable builder is separately versioned as `build-candidate100-candidate21-boxscore-feature-artifact-v2.mjs` (SHA-256 `a5eaf0555dfdb326a2e1b5c3fa4aaabbd83a2fea8ba785393e1dda564e73e00d`). The adjusted run originally pinned those v2 bytes under the old filename. Its explicit source relocation maps that path to the byte-identical v2 file; the comparison verifies both original SHA-256 and byte length, including upstream receipts. No hash check is waived.

The original raw comparison and resampling caches were reused successfully. The adjusted comparison reused the same paired resampling plan. Comparison summaries use absolute output directories, avoiding the earlier repeated relative path. Each completed summary retains primary, distribution, signed-error and per-season metrics.

## Local reproduction receipts

- Feature-artifact run receipt: `C:\Users\djwan\Downloads\djshouseofcards-next-fixes-applied\prototypes\swishiq-package-v4\experiment-tools\runs\cache\candidate100-candidate21-boxscore-features\aea43839005c2b5a9e16edeb98c361f588b93dff03582cc9d32c7aa93cab6f29\receipt.json` (the invocation receipt is `C:/Users/djwan/Downloads/djshouseofcards-next-fixes-applied/prototypes/swishiq-package-v4/experiment-tools/runs/candidate21-adjusted-feature-artifacts/run-1791618781836-34900-ad06dc9a-080c-492e-a620-462c80107ba4/run.json`).
- Prepared screen: `C:/Users/djwan/Downloads/djshouseofcards-next-fixes-applied/prototypes/swishiq-package-v4/experiment-tools/runs/candidate100-candidate21-adjusted-individual/run-1791618804601-593f8396-3b2a-455e-b11f-a0474072a648/preparation.json`.
- Completed pipeline: `C:/Users/djwan/Downloads/djshouseofcards-next-fixes-applied/prototypes/swishiq-package-v4/experiment-tools/runs/candidate100-candidate21-adjusted-individual/run-1791618804601-593f8396-3b2a-455e-b11f-a0474072a648/candidate-pipeline/run-1791618848894-15900/complete.json`.
- Explicit source map: `C:/Users/djwan/Downloads/djshouseofcards-next-fixes-applied/prototypes/swishiq-package-v4/experiment-tools/runs/candidate100-candidate21-adjusted-individual/run-1791618804601-593f8396-3b2a-455e-b11f-a0474072a648/source-path-map.json`.
- Full paired summary: `C:/Users/djwan/Downloads/djshouseofcards-next-fixes-applied/prototypes/swishiq-package-v4/experiment-tools/runs/candidate100-candidate21-adjusted-individual/run-1791618804601-593f8396-3b2a-455e-b11f-a0474072a648/summaries/run-1791619799972-82a20f63-f2ed-48fd-ba81-1f182820abb3/summary.json`.
- Formula review: [`swishiq-candidate21-screen-field-map-20261010.md`](swishiq-candidate21-screen-field-map-20261010.md).

Underlying feature rows, forecasts, score rows and caches remain in the DJHC workspace. Compact GitHub evidence does not include those datasets or make this milestone self-contained.
