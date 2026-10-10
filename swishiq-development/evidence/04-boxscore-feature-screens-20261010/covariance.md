# Candidate 100 + Candidate 21 Predictor Covariance Audit

This is a predictor-only diagnostic over strictly prior feature values. It does not use targets, fit models, or select features.

## Scope

- Candidate 100 active predictors plus all low-overlap Candidate 21 screen additions.
- Full covariance values are retained in the JSON receipt; correlations are dimensionless.
- Pairwise complete observations are used. Null Candidate 100 total-head fields are reported explicitly.
- Development evidence only; no promotion or validity claim.

## total head

### development2022to2025 (4920 games; 47 predictors)

| Pair | Pearson r | Spearman rho | Covariance | N |
|---|---:|---:|---:|---:|
| pass6:hpa10 / pass6:hpa20 | 0.907 | 0.900 | 29.620 | 4920 |
| c51:meanTopScorerPointsShare20 / c51:meanTopUsagePlayerLoadShare20 | 0.906 | 0.896 | 0.00012510 | 4920 |
| pass6:apa10 / pass6:apa20 | 0.904 | 0.897 | 29.347 | 4920 |
| pass6:ap10 / pass6:ap20 | 0.899 | 0.885 | 27.169 | 4920 |
| pass6:hp10 / pass6:hp20 | 0.897 | 0.883 | 26.282 | 4920 |
| c51:meanPointsAgainst20Shrunk / c51:meanAdjustedDefenseAllowance | 0.873 | 0.861 | 7.5539 | 4920 |
| c51:meanPointsFor20Shrunk / c51:meanAdjustedOffense | 0.856 | 0.840 | 6.5252 | 4920 |
| c51:meanPointsAgainstLast10 / c51:meanPointsAgainst20Shrunk | 0.851 | 0.846 | 11.980 | 4863 |
| c51:meanPointsForLast10 / c51:meanPointsFor20Shrunk | 0.844 | 0.836 | 10.837 | 4863 |
| pass6:etMean / pass6:venueTotMean | 0.789 | 0.778 | 31.452 | 4920 |
| c51:meanPointsAgainstLast10 / c51:meanAdjustedDefenseAllowance | 0.780 | 0.773 | 9.1340 | 4863 |
| c51:meanPointsForLast10 / c51:meanAdjustedOffense | 0.762 | 0.750 | 8.1779 | 4863 |

High Pearson pairs (|r| ≥ 0.8): 9; very high (|r| ≥ 0.9): 3; near-duplicate screen (|r| ≥ 0.98): 0

### fullWarmupAndDevelopment (7230 games; 47 predictors)

| Pair | Pearson r | Spearman rho | Covariance | N |
|---|---:|---:|---:|---:|
| pass6:hpa10 / pass6:hpa20 | 0.910 | 0.902 | 31.748 | 7230 |
| pass6:apa10 / pass6:apa20 | 0.909 | 0.901 | 31.368 | 7230 |
| pass6:ap10 / pass6:ap20 | 0.908 | 0.896 | 30.031 | 7230 |
| pass6:hp10 / pass6:hp20 | 0.908 | 0.896 | 29.154 | 7230 |
| c51:meanTopScorerPointsShare20 / c51:meanTopUsagePlayerLoadShare20 | 0.895 | 0.883 | 0.00011845 | 7230 |
| c51:meanPointsAgainstLast10 / c51:meanPointsAgainst20Shrunk | 0.870 | 0.868 | 14.257 | 7145 |
| c51:meanPointsForLast10 / c51:meanPointsFor20Shrunk | 0.869 | 0.865 | 13.481 | 7145 |
| pass6:etMean / pass6:venueTotMean | 0.834 | 0.828 | 43.246 | 7230 |
| c51:meanPointsFor20Shrunk / pass6:etMean | 0.783 | 0.767 | 17.625 | 7230 |
| c51:meanPointsAgainstLast10 / pass6:etMean | 0.782 | 0.777 | 24.394 | 7145 |
| c51:meanPointsAgainst20Shrunk / c51:meanAdjustedDefenseAllowance | 0.780 | 0.770 | 7.0468 | 7230 |
| c51:meanPointsAgainst20Shrunk / pass6:etMean | 0.777 | 0.763 | 18.094 | 7230 |

High Pearson pairs (|r| ≥ 0.8): 8; very high (|r| ≥ 0.9): 4; near-duplicate screen (|r| ≥ 0.98): 0

## margin head

### development2022to2025 (4920 games; 42 predictors)

| Pair | Pearson r | Spearman rho | Covariance | N |
|---|---:|---:|---:|---:|
| c51:defenseAllowanceAdvantageLast10 / pass6:defAdv10 | 0.968 | 0.980 | 33.926 | 4920 |
| c51:pointsForAdvantageLast10 / pass6:pfAdv10 | 0.952 | 0.969 | 29.437 | 4920 |
| c51:winRateAdvantageLast10 / pass6:wrAdv10 | 0.951 | 0.974 | 0.046842 | 4920 |
| c51:defenseAllowanceAdvantage20Shrunk / pass6:defAdv20 | 0.943 | 0.958 | 21.917 | 4920 |
| c51:pointsForAdvantage20Shrunk / c51:adjustedOffenseAdvantage | 0.937 | 0.933 | 6.4733 | 4920 |
| c51:pointsForAdvantage20Shrunk / pass6:pfAdv20 | 0.933 | 0.948 | 18.466 | 4920 |
| pass6:defAdv10 / pass6:defAdv20 | 0.906 | 0.898 | 56.895 | 4920 |
| c51:topScorerPointsShareAdvantage20 / c51:topUsagePlayerLoadShareAdvantage20 | 0.903 | 0.898 | 0.00012413 | 4920 |
| pass6:pfAdv10 / pass6:pfAdv20 | 0.892 | 0.877 | 49.643 | 4920 |
| pass6:wrAdv10 / pass6:wrAdv20 | 0.891 | 0.876 | 0.076739 | 4920 |
| c51:opponentAdjustedStrengthAdvantage / pass6:rStrAdv90 | 0.889 | 0.868 | 19.135 | 4920 |
| c51:defenseAllowanceAdvantageLast10 / pass6:defAdv20 | 0.869 | 0.876 | 27.116 | 4920 |

High Pearson pairs (|r| ≥ 0.8): 24; very high (|r| ≥ 0.9): 8; near-duplicate screen (|r| ≥ 0.98): 0

### fullWarmupAndDevelopment (7230 games; 42 predictors)

| Pair | Pearson r | Spearman rho | Covariance | N |
|---|---:|---:|---:|---:|
| c51:defenseAllowanceAdvantageLast10 / pass6:defAdv10 | 0.965 | 0.979 | 32.574 | 7230 |
| c51:winRateAdvantageLast10 / pass6:wrAdv10 | 0.955 | 0.977 | 0.046505 | 7230 |
| c51:pointsForAdvantageLast10 / pass6:pfAdv10 | 0.955 | 0.972 | 29.407 | 7230 |
| c51:defenseAllowanceAdvantage20Shrunk / pass6:defAdv20 | 0.942 | 0.955 | 20.644 | 7230 |
| c51:pointsForAdvantage20Shrunk / c51:adjustedOffenseAdvantage | 0.938 | 0.936 | 6.4802 | 7230 |
| c51:pointsForAdvantage20Shrunk / pass6:pfAdv20 | 0.931 | 0.946 | 18.361 | 7230 |
| pass6:defAdv10 / pass6:defAdv20 | 0.901 | 0.891 | 53.782 | 7230 |
| pass6:pfAdv10 / pass6:pfAdv20 | 0.894 | 0.882 | 49.065 | 7230 |
| c51:topScorerPointsShareAdvantage20 / c51:topUsagePlayerLoadShareAdvantage20 | 0.891 | 0.884 | 0.00011713 | 7230 |
| pass6:wrAdv10 / pass6:wrAdv20 | 0.888 | 0.874 | 0.075100 | 7230 |
| c51:opponentAdjustedStrengthAdvantage / pass6:rStrAdv90 | 0.887 | 0.868 | 17.973 | 7230 |
| c51:defenseAllowanceAdvantageLast10 / pass6:defAdv20 | 0.862 | 0.868 | 25.848 | 7230 |

High Pearson pairs (|r| ≥ 0.8): 23; very high (|r| ≥ 0.9): 7; near-duplicate screen (|r| ≥ 0.98): 0

## Interpretation guardrail

High pairwise correlation signals overlapping linear information and can make individual ridge coefficients less stable. It does not alone justify removal: retain a feature when its paired predictive screen improves the intended outcome without repeated harm.
