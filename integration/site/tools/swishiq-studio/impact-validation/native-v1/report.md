# Native V4 Impact chronological assessment

Status: **chronological-conditional-lineup-acceptance-passed**.

historical conditional scoring for specified observed paired lineups; it does not assess pregame availability, player causality, optimizer counterfactuals, or game forecasts

Every evaluated coefficient fit ends before its whole-date heldout partition. Ridge selection occurs on the earlier tuning partition, and the final evaluation fit uses train plus tune only. This report includes no 2026 or 2026-27 input.

| Season | Ridge | Heldout games | Directional MSE | Team-context MSE | Net MSE | Team-context net MSE |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2017-18 | 1000 | 248 | 3494.787 | 3496.507 | 7140.669 | 7143.383 |
| 2018-19 | 1000 | 241 | 3530.038 | 3533.893 | 7128.302 | 7154.736 |
| 2019-20 | 1000 | 191 | 3822.216 | 3823.153 | 7731.774 | 7735.015 |
| 2020-21 | 1000 | 223 | 3579.556 | 3583.775 | 7142.653 | 7170.699 |
| 2021-22 | 1000 | 250 | 3645.624 | 3648.377 | 7459.477 | 7447.183 |
| 2022-23 | 1000 | 251 | 3474.285 | 3485.550 | 7132.307 | 7161.365 |
| 2023-24 | 1000 | 260 | 3662.252 | 3661.498 | 7644.214 | 7672.728 |
| 2024-25 | 1000 | 258 | 3720.086 | 3724.628 | 7653.750 | 7653.190 |
| 2025-26 | 1000 | 259 | 3936.810 | 3946.642 | 8096.504 | 8113.647 |

## Acceptance checks

- PASS: directional-mse-improves-leagueBaseline
- PASS: directional-mae-not-worse-leagueBaseline
- PASS: directional-mse-improves-teamBaseline
- PASS: directional-mae-not-worse-teamBaseline
- PASS: net-mse-improves-zeroBaseline
- PASS: net-mae-not-worse-zeroBaseline
- PASS: net-mse-improves-teamBaseline
- PASS: net-mae-not-worse-teamBaseline
- PASS: seasonal-directional-mse-guardrail
- PASS: strict-prior-fit-cutoffs
- PASS: source-target-hashes-reconciled
- PASS: no-game-date-leakage

## Scope

- Observed target-game paired lineups are conditioning inputs, not inferred pregame availability.
- No individual-player causal-effect, player-ranking, counterfactual rotation, workload, box-score, game-score, win-probability, or prospective claim is made.
- All evaluation seasons are completed historical data and remain development evidence.
- Per-player uncertainty is not estimated by this assessment.
- Archive selection and possession reconstruction exclusions remain disclosed in the immutable input receipt.

Interval certification: **passed**. Per-season metrics, paired bootstrap intervals, input hashes, cutoffs, and heldout predictions are in [report.json](report.json).
