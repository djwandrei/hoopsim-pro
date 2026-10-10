# SwishIQ Cycle 3 final feature-readiness disposition — 2026-10-10

## Scope and status

This memo closes the remaining Cycle 3 readiness decisions for opponent-adjusted efficiency, schedule pressure, venue, and travel. It reconciles Candidate100's active and excluded feature contract with the existing Candidate21/Candidate100 readiness review and completed receipts. No model, configuration, source, or site files were changed, and no new trial was run. Candidate100 remains `development-unvalidated`; the reviewed 2022–26 seasons are development evidence, not independent validation.

| Family | Candidate100 status | Cycle 3 disposition |
|---|---|---|
| Opponent-adjusted pace | Not an active Candidate100 feature. The tested `c21:meanOpponentAdjustedPace20` formulation is complete. | Close this formulation as rejected for retention. Do not treat this result as rejecting every possible pace definition. |
| Opponent-adjusted efficiency ratings | Active score-based adjusted offense/defense are present, but per-possession ORtg/DRtg are not. | A distinct, isolated screen is justified; the feature artifact does not yet emit the adjusted ratings. This is an artifact implementation item, not a reason to block on external provider availability. |
| Schedule pressure | Rest, seven-day density, back-to-back, three-in-four, four-in-six, and five-in-seven inputs are already active. | Close the duplicate named windows. Target-date-known schedule information is legitimate under the forecast-time cutoff. A new threshold would require a distinct predeclared construct. |
| Venue role | Home/away-role offense and defensive-allowance deviations are active. | Treat as role form only. Physical arena, relocation, and neutral-site drift remain unrepresented. |
| Travel load | No travel predictor appears in Candidate100's active roster; the optional Candidate10 travel contract is not populated by the pinned V4 feature map. | Defer travel until actual, dated venue identities and coordinates are present in a pinned source artifact. Schedule dates alone do not supply routes or time-zone movement. |

## Opponent-adjusted efficiency is not duplicated by adjusted scoring

Candidate100 selects `c51:meanAdjustedOffense` and `c51:meanAdjustedDefenseAllowance` in its total head, and `c51:opponentAdjustedStrengthAdvantage` and `c51:adjustedOffenseAdvantage` in its margin head. These are useful overlapping score-form signals, but their units and construction are different from possession-based efficiency.

Candidate10's adjusted scoring state starts from expected points per team game (league points per side plus home-margin context and prior team offense/defense components). After a game, it updates the scoring components from actual minus expected points, with capped point updates. These predictors therefore describe adjusted points per game. They do not divide points by estimated possessions and are not offensive or defensive ratings per 100 possessions. Correlation with efficiency is expected, but it does not make them the same feature.

Candidate21 calculates raw offensive rating as `100 × points / estimated possessions` and defensive-rating allowance as `100 × opponent points / opponent estimated possessions`. Its context already supplies these raw ratings, but the current Candidate100 feature-artifact writer's declared sets cover raw pace/rates, opponent-adjusted Four Factors, and opponent-adjusted pace; they do not include adjusted ORtg or DRtg allowance.

The existing readiness review defines a distinct strictly-prior adjustment suitable for an isolated screen:

- Adjusted ORtg = own ORtg − (opponent's prior DRtg allowance − prior league DRtg-allowance mean).
- Adjusted DRtg allowance = own allowance − (opponent's prior ORtg − prior league ORtg mean).
- Build opponent and league profiles from completed games before the target local date; use the latest 20 prior team games and the stated eight-game prior. Snapshot every target on a date before applying outcomes from that date.
- For a total feature, use the mean of the home and away adjusted profiles. For margin, encode direction so a larger value always means an advantage: `(home AdjORtg − away AdjORtg) / 2` and `(away AdjDRtgAllowance − home AdjDRtgAllowance) / 2`.

The direction on defensive allowance matters because a lower allowed rating is better. The adjustment formula and its chronological rule are already documented, so the formulation need not be deferred again. The separate adjusted-efficiency feature artifact is still required before any screen: emit and pin both adjusted values, verify finite values and exact target identity, then test one feature at a time in each head (four single-slot variants) against the unchanged Candidate100 configuration. This is a development screen only. Do not infer results from the existing score-based predictors or from the adjusted Four-Factor screen.

The existing adjusted Four-Factor result covers eFG, turnover, offensive rebound, and free-throw rates; none was retained. That result does not screen adjusted ORtg or DRtg allowance. Likewise, the newly completed adjusted-pace receipt covers pace only, and its current formula was rejected for retention: pooled total MAE rose by 0.000631, total RMSE fell by 0.000232, season MAE split 2–2, and margin/probability outputs were unchanged. No combination is justified by either receipt.

## Schedule pressure uses forecast-known information

The active Candidate100 roster already includes mean rest days, mean games in the last seven days, margin rest and seven-day-density contrasts, and the back-to-back / three-in-four / four-in-six / five-in-seven pressure terms. The documented thresholds are:

- Back-to-back: the target schedule's pregame flag.
- Three-in-four: at least two completed prior games in the four-day lookback, plus the scheduled target game.
- Four-in-six: at least three completed prior games in the six-day lookback, plus the target game.
- Five-in-seven: at least four completed prior games in the seven-day lookback, plus the target game.

Thus a target-date schedule flag or a target-date game count computed from published schedule information is valid when it would be known at forecast time. Historical counts must use only games before the target date; target-day results and future results must never enter the feature. The existing back-to-back flag's missing-value-to-zero behavior remains the current model contract and should not be generalized to unknown schedule history.

The named windows are already represented, so another proposal with these same thresholds is duplicate work. A genuinely different pressure construct can be considered if its window, target-known inputs, missing-data behavior, and sign are declared before a screen. No external provider-availability gate is needed for this disposition; use the pinned schedule/history inputs and the forecast-time cutoff.

## Venue role and physical travel are separate

Candidate100 actively uses recent home-role and away-role offense/defensive-allowance deviations over 10- and 20-game windows, including margin contrasts. Candidate24 compares same-role scoring history with all-role form. These features measure team performance in the home/away role; they do not identify the arena in which a game occurred.

The reviewed V4 source contract does not pin an actual-venue ID, venue-change timeline, or neutral-site map. Arena/relocation/neutral-site effects are therefore not currently computable from this contract. Do not reinterpret the active home/away-role predictors as physical venue features. A physical-venue study can be reconsidered if target and prior games have complete dated actual-venue mappings and neutral-site handling in an auditable, version-pinned artifact.

Travel requires the actual prior-game and target venues, their coordinates and time zones, and a strict-prior route window. Candidate10 v5 describes optional fields such as last-leg distance, seven-day travel distance, time-zone shift, and explicit cold-start/support status. The pinned Candidate57 map has no venue map or Candidate25 travel-context builder, so schedule identity/date alone cannot recover those inputs. Travel remains deferred on that source-data gap. This is not a request for a particular external provider or a provider-availability gate; any complete, auditable, version-pinned venue crosswalk can supply the inputs.

## Evidence and limits

- Candidate100's active and excluded feature lists are in [`game-lab-candidate100-pruned-total-model-blend090-v1.mjs`](../prototypes/swishiq-package-v4/models/game-lab-candidate100-pruned-total-model-blend090-v1.mjs). The named schedule and venue features are active. The excluded list does not name adjusted ORtg/DRtg or travel; those metrics are absent from the active roster rather than listed as excluded slots.
- The earlier source/chronology review is [`swishiq-game-lab-feature-readiness-20261010.md`](swishiq-game-lab-feature-readiness-20261010.md). The opponent-adjusted box-score definitions and exact target-identity requirements are in [`swishiq-opponent-adjusted-screen-readiness-20261010.md`](swishiq-opponent-adjusted-screen-readiness-20261010.md).
- Adjusted pace has a completed [result and receipt index](swishiq-candidate100-adjusted-pace-screen-results-20261010.md), with a compact [summary](swishiq-candidate100-adjusted-pace-screen-summary-20261010.json). The result covers 4,920 targets across 2022–23 through 2025–26 and remains development-only.
- Adjusted Four-Factor results are in [`swishiq-candidate100-adjusted-fourfactor-screen-results-20261010.md`](swishiq-candidate100-adjusted-fourfactor-screen-results-20261010.md). They cover four rates in separate heads, not adjusted efficiency ratings.
- Candidate21's source calculations are in [`game-lab-candidate21-boxscore-history-context-v1.mjs`](../prototypes/swishiq-package-v4/models/game-lab-candidate21-boxscore-history-context-v1.mjs); Candidate10's score-based adjustment and schedule-pressure rules are in [`game-lab-native-score-model-candidate10-v5.mjs`](../prototypes/swishiq-package-v4/models/game-lab-native-score-model-candidate10-v5.mjs) and [`game-lab-candidate10-history-features-v2.mjs`](../prototypes/swishiq-package-v4/models/game-lab-candidate10-history-features-v2.mjs).

All screens cited here are exploratory development evidence over inspected seasons. They do not establish independent or prospective predictive validity, do not justify feature combinations, and do not change Candidate100's status.
