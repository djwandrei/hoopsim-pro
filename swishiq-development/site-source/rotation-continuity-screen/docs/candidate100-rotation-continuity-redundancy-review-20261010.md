# Candidate100 rotation-continuity redundancy review

## Conclusion

The six rotation-continuity inputs are related within each head, but none is an exact or near duplicate of another input or a currently selected Candidate100 feature in its head. The largest within-head input correlation is **0.8062** for total and **0.7918** for margin. The strongest correlation between a rotation input and any currently selected same-head feature is **0.5283**. No screened pair reaches the `|r| >= 0.95` near-duplicate flag threshold.

This is a feature-correlation review only. It does not establish incremental predictive value, calibration, or whether a screen should retain a feature.

## Pinned inputs and method

- Candidate57 rows: `prototypes/swishiq-package-v4/diagnostics/game-lab-candidate57-source-cache-20261007/feature-rows.jsonl` (34,346,629 bytes; SHA-256 `3e9c5e6b3102464b686dea5e43277e80166e67702628e74b14ba56b0c23ede3d`). The stream contains 7,230 rows; all six rotation values are finite in every row.
- Candidate100 config: `prototypes/swishiq-package-v4/diagnostics/game-lab-candidate100-pruned-total-model-blend090-v1-20261008/configuration.json` (7,763 bytes; SHA-256 `6e7fa2868fb9bcf4716603a15a953f42f1f6faa0b70e3ecd7f1ea56b45992e94`). It selects 40 total and 39 margin features; all six rotation slots are currently excluded and unselected.
- Rotation adapter receipt: `prototypes/swishiq-package-v4/experiment-tools/runs/candidate100-rotation-alias-adapters/run-1791611066914-1308-6f826060-2032-452e-97c2-b00b96a33ab6/run.json` (SHA-256 `6fd959666855a9271a36217ccb109aefd801ec067f71f74dfbd36a863716433b`). Its pins match the row file and configuration above.

Primary correlations use the 6,150 development rows with `seasonStartYear` 2021–2025, matching the rotation adapter's development target-row window. Pearson correlations were computed by direct streaming accumulators with pairwise complete observations: 15 pairs among the six inputs, and each input against all currently selected features in its own head. No all-feature covariance matrix was generated. A pre-existing covariance artifact was not needed; reading the pinned rows directly kept the calculation aligned with this exact row window and selected-feature roster.

## Correlations among the six inputs

All pairs below have `n = 6,150`. Values are Pearson `r`.

### Total head

| Input A | Input B | r |
|---|---|---:|
| `c51:meanActivePlayerOverlap5` | `c51:meanStarterOverlap5` | 0.5798 |
| `c51:meanActivePlayerOverlap5` | `c51:meanMinuteShareOverlap5` | 0.7272 |
| `c51:meanStarterOverlap5` | `c51:meanMinuteShareOverlap5` | 0.8062 |

### Margin head

| Input A | Input B | r |
|---|---|---:|
| `c51:activePlayerOverlapAdvantage5` | `c51:starterOverlapAdvantage5` | 0.5353 |
| `c51:activePlayerOverlapAdvantage5` | `c51:minuteShareOverlapAdvantage5` | 0.7006 |
| `c51:starterOverlapAdvantage5` | `c51:minuteShareOverlapAdvantage5` | 0.7918 |

### Cross-head pairs

Rows are total-head inputs; columns are margin-head inputs. All pairs have `n = 6,150`.

| Total input | `activePlayerOverlapAdvantage5` | `starterOverlapAdvantage5` | `minuteShareOverlapAdvantage5` |
|---|---:|---:|---:|
| `meanActivePlayerOverlap5` | -0.0001 | 0.0080 | 0.0002 |
| `meanStarterOverlap5` | 0.0099 | -0.0073 | -0.0075 |
| `meanMinuteShareOverlap5` | 0.0064 | -0.0007 | -0.0049 |

The three total-head measures share moderate to strong linear association with each other, as do the three margin-head measures. Cross-head pairwise correlations are near zero in this pooled window.

## Strongest correlations with currently selected Candidate100 features

Each candidate was compared only with selected features in its own head: all 40 total features for total candidates and all 39 margin features for margin candidates. The table reports the three strongest absolute correlations per input. `n` is the pairwise complete row count; 71 rows are absent for the selected `Last10` features noted below.

### Total head

| Rotation input | Selected Candidate100 feature | r | n |
|---|---|---:|---:|
| `c51:meanActivePlayerOverlap5` | `c51:meanBoxscoreThreePointAttemptRate20` | -0.2202 | 6,150 |
| `c51:meanActivePlayerOverlap5` | `c51:meanBoxscoreTwoPointPct20` | -0.1459 | 6,150 |
| `c51:meanActivePlayerOverlap5` | `c51:meanPointsFor20Shrunk` | -0.1112 | 6,150 |
| `c51:meanStarterOverlap5` | `c51:meanBoxscoreThreePointAttemptRate20` | -0.1924 | 6,150 |
| `c51:meanStarterOverlap5` | `c51:meanPointsAgainstLast10` | -0.1676 | 6,079 |
| `c51:meanStarterOverlap5` | `c51:meanWinRateLast10` | 0.1573 | 6,079 |
| `c51:meanMinuteShareOverlap5` | `c51:meanMinuteShareHhi5` | 0.1937 | 6,150 |
| `c51:meanMinuteShareOverlap5` | `c51:meanBoxscoreThreePointAttemptRate20` | -0.1837 | 6,150 |
| `c51:meanMinuteShareOverlap5` | `c51:meanPointsAgainstLast10` | -0.1417 | 6,079 |

### Margin head

| Rotation input | Selected Candidate100 feature | r | n |
|---|---|---:|---:|
| `c51:activePlayerOverlapAdvantage5` | `pass6:missAdv10` | 0.3750 | 6,150 |
| `c51:activePlayerOverlapAdvantage5` | `pass6:availAdv8` | 0.3123 | 6,150 |
| `c51:activePlayerOverlapAdvantage5` | `pass6:availAdv5` | 0.2654 | 6,150 |
| `c51:starterOverlapAdvantage5` | `pass6:minTop5Adv` | 0.4861 | 6,150 |
| `c51:starterOverlapAdvantage5` | `pass6:availAdv8` | 0.3950 | 6,150 |
| `c51:starterOverlapAdvantage5` | `pass6:missAdv10` | 0.3912 | 6,150 |
| `c51:minuteShareOverlapAdvantage5` | `pass6:minTop5Adv` | 0.5283 | 6,150 |
| `c51:minuteShareOverlapAdvantage5` | `pass6:availAdv8` | 0.3914 | 6,150 |
| `c51:minuteShareOverlapAdvantage5` | `pass6:missAdv10` | 0.3783 | 6,150 |

The minute-share margin input has the closest selected-feature relationship, with `pass6:minTop5Adv` at `r = 0.5283`. The strongest total-head relationship is `meanActivePlayerOverlap5` versus the selected three-point attempt-rate feature at `r = -0.2202`. None approaches the near-duplicate threshold.

## Full-cache sensitivity check

The same direct calculation over all 7,230 pinned rows (including the 1,080 rows from 2020) gives maximum within-total `r = 0.8058`, maximum within-margin `r = 0.7909`, and maximum absolute cross-head `r = 0.0116`. The strongest candidate-to-selected relationships remain similar; the largest is minute-share margin versus `pass6:minTop5Adv` at `r = 0.5258`. The redundancy conclusion is unchanged across the full cache and the screen-aligned window.
