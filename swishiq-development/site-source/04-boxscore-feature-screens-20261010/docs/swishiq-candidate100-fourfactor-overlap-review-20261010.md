# Candidate100 / Candidate21 Four-Factor Overlap Review — 2026-10-10

## Scope and status

Read-only review of the pinned Candidate100 feature roster, Candidate21's prior-team-boxscore context and existing family screens, and recent Candidate100 history/rotation/hustle screen conventions. No model, configuration, data, cache, or experiment was changed or run. The requested output is this review only.

Candidate100's pinned configuration (`prototypes/swishiq-package-v4/diagnostics/game-lab-candidate100-pruned-total-model-blend090-v1-20261008/configuration.json`) selects 40 total and 39 margin predictors. Its status is `development-unvalidated`; the independent and prospective validity flags are false. The `excludedFeatures` list excludes 19 slots, including rotation overlap and some steals/blocks/foul profile slots, but it does not list a Candidate21 four-factor predictor. No evidence here changes Candidate100's validation status.

Candidate21's context is a strictly prior rolling team-boxscore view: the latest 20 prior team games, shrunk by eight prior-equivalent games toward a prior league mean; target-date outcomes are captured only after all contexts for that date. `historyGameCount` is context support metadata, not one of the numeric four-factor predictors.

## Candidate21 fields and head mappings

The Candidate21 context defines these 16 side-level fields:

- Four factors: `effectiveFieldGoalPct20`, `turnoverRate20`, `offensiveReboundRate20`, `freeThrowRate20`, and their `opponent*` counterparts.
- Possession / scoring efficiency: `estimatedPossessions20`, `pace20`, `offensiveRating20`, `defensiveRatingAllowance20`.
- Opponent-adjusted factors: `opponentAdjustedEffectiveFieldGoalPct20`, `opponentAdjustedTurnoverRate20`, `opponentAdjustedOffensiveReboundRate20`, `opponentAdjustedFreeThrowRate20`.

The Candidate21 model maps these to these feature-family slots:

| Family | Total head | Margin head |
|---|---|---|
| `boxscore-pace` | `meanBoxscorePace20` | `boxscorePaceAdvantage20` |
| `boxscore-turnovers` | `meanBoxscoreTovRate20`, `meanBoxscoreOpponentTovRate20` | `boxscoreTurnoverMatchupAdvantage20` |
| `boxscore-rebounds` | `meanBoxscoreOrbRate20`, `meanBoxscoreOpponentOrbRate20` | `boxscoreOrbMatchupAdvantage20` |
| `boxscore-free-throws` | `meanBoxscoreFtr20`, `meanBoxscoreOpponentFtr20` | `boxscoreFtrMatchupAdvantage20` |
| `boxscore-efg` | `meanBoxscoreEfgPct20`, `meanBoxscoreOpponentEfgPct20` | `boxscoreEfgMatchupAdvantage20` |
| `boxscore-efficiency` | `meanBoxscoreOffensiveRating20`, `meanBoxscoreDefensiveRatingAllowance20` | `boxscoreOffensiveRatingAdvantage20`, `boxscoreDefenseQualityAdvantage20` |

The native model also declares four optional opponent-adjusted families: `boxscore-opponent-adjusted-efg`, `boxscore-opponent-adjusted-turnovers`, `boxscore-opponent-adjusted-rebounds`, and `boxscore-opponent-adjusted-free-throws`. Those are transformed variants of the raw factor families and should not be treated as independent additions in the first screen.

## Overlap against Candidate100's active roster

The classifications below are from formulas and feature names, not measured Candidate21-to-Candidate100 correlations. “Unrepresented” means no direct corresponding predictor is selected in the inspected Candidate100 configuration; it does not mean the feature is statistically independent or proven to improve forecasts.

| Candidate21 signal | Relevant active Candidate100 predictors | Assessment |
|---|---|---|
| eFG and opponent eFG; eFG matchup | Total has selected 3-point attempt rate and percentage, opponent 3-point attempt rate and percentage, and own/opponent 2-point percentage. Margin has `boxscoreThreePointMatchupAdvantage20` and `boxscoreTwoPointMatchupAdvantage20`. | **High structural overlap.** eFG is assembled from the same shooting components; the margin matchup also shares the same 3-point / 2-point matchup information. The exact feature values are not identical by definition because rolling/shrinkage and source construction differ. `opponentAdjustedEffectiveFieldGoalPct20` is also likely overlapping. Put eFG late in a screen and measure it against the active component roster. |
| Offensive rating and defensive allowance; rating advantages | Total has `meanPointsFor20Shrunk`, `meanPointsAgainst20Shrunk`, `meanAdjustedOffense`, and `meanAdjustedDefenseAllowance`. Margin has `pointsForAdvantage20Shrunk`, `defenseAllowanceAdvantage20Shrunk`, `opponentAdjustedStrengthAdvantage`, and `adjustedOffenseAdvantage`. | **High conceptual overlap, not an exact duplicate.** Ratings normalize scoring by estimated possessions, which could add a tempo-adjusted efficiency view, but their numerator is scoring already represented in Candidate100. Keep as a later, isolated comparison. |
| Turnover rates and turnover matchup | No active Candidate100 turnover-rate feature. Candidate100's selected boxscore families cover shooting, assists, player concentration, and rotation; the excluded steals/blocks/foul slots are not turnover-rate substitutes. | **Strongest unrepresented factor family.** Own/opponent rates and their matchup transform are new dimensions in the active roster. This is an incremental candidate by feature contract only; realized correlation and forecast lift remain unmeasured. |
| Offensive-rebound rates and rebound matchup | No active Candidate100 offensive-rebound predictor. | **Unrepresented factor family.** Test raw own/opponent means and matchup separately from other families. Do not conflate this with rotation/minute-share features. |
| Free-throw rates and free-throw matchup | No active Candidate100 free-throw-rate predictor. | **Unrepresented factor family.** Candidate100 scoring levels may covary with free-throw rate, but there is no direct rate slot selected. |
| Pace / estimated possessions | No active Candidate100 pace or possession-rate feature. Candidate100 does include rolling points and expected-total-like `pass6:etMean` / `pass6:venueTotMean` predictors. | **New tempo construct with possible score-level correlation.** Pace has the clearest direct contract gap, while the selected total forecasts may still absorb related variation. Candidate21's model family uses `pace20` summaries; `estimatedPossessions20` is context support for that calculation, not a separate emitted family in the mapping above. |
| Opponent-adjusted turnover, rebound, and free-throw rates | No direct Candidate100 slots for those rates. | **Potentially incremental, but derived from already proposed raw families.** Defer until the corresponding raw family shows a stable head-specific benefit; then compare raw versus adjusted forms instead of adding both automatically. |

## Correlation and covariance evidence

I found no receipt that computes joint rowwise correlations/covariances between Candidate21's four-factor fields and Candidate100's selected 40/39 features. Therefore the overlap judgments above are semantic/formula inferences, not reported Pearson coefficients or a covariance-matrix result.

The recent Candidate100 rotation redundancy review is a direct correlation receipt for six rotation candidates against the active Candidate100 roster, but it does **not** include Candidate21 factors. It used 6,150 development rows and reported no `|r| >= 0.95` pair for those rotation candidates. That result cannot be transferred to Candidate21.

There are older Candidate21 family-ablation and Candidate28 four-factor comparison receipts, but neither measures Candidate21-to-Candidate100 feature correlation. The Candidate21 report tested individual families against a Candidate10/Candidate11 distribution baseline on opened-label chronological seasons 2021–2025. The Candidate28 report tested a broad feature combination against Candidate26 on 4,920 games in 2022–2025 and reports adverse pooled Brier/log-loss and several score-error deltas. These are useful reasons to test small, isolated additions; neither estimates a Candidate100 treatment effect or establishes independent/prospective validity.

## Minimal sequential screen recommendation

Use the pinned Candidate100 baseline and the same target identities, chronology, target seasons, warmup, fit settings, calibration, uncertainty/scoring settings, and source cutoff for every variant. Create cloned development configurations; preserve all existing Candidate100 slots and change only the declared Candidate21 additions and counts. For each family, fit **total-only** and **margin-only** variants separately and leave the opposite head byte-for-byte/configuration-equivalent to baseline. A combined both-head variant is warranted only if both isolated head treatments pass their own prespecified metric and non-regression gates.

1. **Pace, total only:** add `meanBoxscorePace20`. Do not add `boxscorePaceAdvantage20` to margin in the minimum pass; pace imbalance alone has a weaker direct link to scoring difference and deserves a separate prespecified follow-up if needed.
2. **Turnovers:** compare total-only (`meanBoxscoreTovRate20`, `meanBoxscoreOpponentTovRate20`) and margin-only (`boxscoreTurnoverMatchupAdvantage20`) as separate treatments.
3. **Offensive rebounds:** compare total-only (`meanBoxscoreOrbRate20`, `meanBoxscoreOpponentOrbRate20`) and margin-only (`boxscoreOrbMatchupAdvantage20`) separately.
4. **Free throws:** compare total-only (`meanBoxscoreFtr20`, `meanBoxscoreOpponentFtr20`) and margin-only (`boxscoreFtrMatchupAdvantage20`) separately.
5. **Only if a later overlap check is needed:** test eFG, then rating efficiency, as separate family treatments. Do not introduce the opponent-adjusted fields in the same treatment as their raw factor; first test raw-versus-adjusted substitution for any surviving factor.

Keep candidate scoring contrasts paired by local date and report total-point and margin-point outcomes against their own intended heads, along with the existing probability / non-regression gates. Treat this strictly as a development feature screen. No source evidence here supports promotion or a validity claim.

This ordering prioritizes signals absent from the active feature names and delays the most obviously overlapping families. It is an **inference-based screening priority**, not a claim about which factor will win. The older Candidate21 family ablation cannot set the order by its effect estimates because it uses a different baseline and opened-label seasons.

## Screen-pattern precedent

- `docs/candidate100-history-reliability-screen-design-20261010.md` proposes a baseline / support-only / volatility-only / combined matrix, keeping head semantics and scoring settings fixed and using paired local-date resampling. This is a design precedent, not an executed C21 screen.
- `docs/candidate100-rotation-screen-plan-review-20261010.md` proposes six isolated one-slot configurations (three semantic metrics separately for total and margin), each cloned from the pinned baseline with the other head unchanged. The review states that no preparation, fit, or screen was run.
- `prototypes/swishiq-package-v4/experiment-tools/prepare-candidate100-hustle-screen.mjs` constructs eight isolated one-slot, head-specific configurations from the baseline, validates the other head stays unchanged, and prepares development-only mean/screen plans. It is a preparation pattern, not evidence of a completed or successful hustle result.

## Evidence paths inspected

- `prototypes/swishiq-package-v4/diagnostics/game-lab-candidate100-pruned-total-model-blend090-v1-20261008/configuration.json` — exact selected total/margin feature rosters, excluded slots, counts, and development validity flags.
- `prototypes/swishiq-package-v4/models/game-lab-candidate21-boxscore-history-context-v1.mjs` — Candidate21 context fields, Four Factors formulas, rolling window/shrinkage, same-date cutoff.
- `prototypes/swishiq-package-v4/models/game-lab-native-score-model-candidate10-v5.mjs` — Candidate21/22 field validation, family-to-head slot mapping, and home/away aggregation formulas.
- `prototypes/swishiq-package-v4/diagnostics/game-lab-candidate21-four-factor-family-ablation-development-20261005-a/report.json` — individual Candidate21 family treatment protocol and status.
- `prototypes/swishiq-package-v4/diagnostics/candidate28-four-factor-paired-comparison-20261006-2022-26/summary.md` and `report.json` — broad combined treatment against Candidate26; different baseline and season scope.
- `docs/candidate100-rotation-continuity-redundancy-review-20261010.md` — rotation-to-Candidate100 correlations only, not four-factor correlations.
- `docs/candidate100-rotation-screen-plan-review-20261010.md`, `docs/candidate100-history-reliability-screen-design-20261010.md`, `docs/candidate100-history-reliability-adapter-contract-20261010.md` — recent head-specific and paired-screen design conventions.
- `prototypes/swishiq-package-v4/experiment-tools/prepare-candidate100-hustle-screen.mjs` — one-slot isolated-configuration preparation pattern.
