# DJHC player game simulator V4 consolidation

**Release candidate:** `djhc-player-game-sim-v4-parametric-score-age`  
**Model version:** `4.2.0-age-parametric-candidate`  
**State:** frozen development candidate; not independently predictively certified  
**Scope:** isolated simulator/model assets. No Studio page wiring is included.

## What is in this candidate

- The selected pooled V4 game model combines team form and home court with lagged
  DJHC player ratings, rating matchups, opponent-adjusted team strength, player
  production, fatigue inputs, and the V4 player scoring and six-stat rate models.
- Player-stat totals remain reconciled with simulated team totals. The model
  supports caller-supplied fictional or randomized rosters and future target
  seasons without looking up a specific game's result.
- Game scores are sampled from fresh bivariate-normal residual draws using the
  fitted mean, standard deviation, and margin/total correlation. The frozen
  model does not include game-level residual pairs.
- Season age is resolved automatically for `seasonStartYear` using the pinned
  V4 Career_State age index. It uses the latest source season at or before the
  target, measures age on January 31 of the season's second calendar year, and
  advances age by one per season. Repeated games in one season do not increment
  age again. Exact normalized name keys are required; there is no fuzzy,
  accent-folded, or punctuation-folded player matching. Unlisted synthetic
  players can use a supplied `birthDate`.
- Live play-by-play uses the same resolved ages and model rates. It emits
  internally consistent simulated events and box-score updates; its events are
  simulated output, not observed NBA play-by-play.

The index contains 5,011 source-backed age anchors for 1,396 exact normalized
name keys from season start years 2017 through 2025. Its source part hash is
`017b69dbfaada9de731c5d4051ec158361ec0e163217f67007260ce5fed895ce`; the
index hash is recorded in the model source pins.

## Chronological results and candidate decisions

The selected game model's 8,289 out-of-fold games from 2019-20 through 2025-26
had margin MAE 10.829 points, RMSE 13.841, win accuracy 65.64%, and Brier
score 0.2155. These are development results from the current pooled package,
not an independent certification.

The parametric score-distribution diagnostic tested six target seasons
(2020-21 through 2025-26), fitting each season from earlier OOF residuals only.
Across 7,230 OOF games, Brier was 0.215881, log loss 0.620835, margin CRPS
7.815929, and total-points CRPS 11.403186. The paired-residual diagnostic
baseline was 0.215617, 0.620268, 7.807916, and 11.398950 respectively. The
parametric candidate is slightly worse on these aggregate metrics, but removes
all game-level residual pairs from inference; its interval coverage was close
to nominal (margin 80%: 80.06%; total 80%: 80.47%).

The rate-model second pass retained the V4 scoring-rate and six player-box-rate
models. Their documented selected scoring-rate fit had 159,652 out-of-fold
rows, MAE 6.123, and RMSE 7.800. Source mappings, feature lags, missing-input
fallbacks, and package/runtime pins were audited.

Two explored changes were not promoted:

- **Schedule congestion:** margin MAE/RMSE improved by only 0.012/0.018 pooled
  and won in 4 of 7 seasons; the combined congestion total model worsened
  pooled MAE/RMSE by 0.020/0.023 and also won in 4 of 7. Both missed the stated
  5-of-7 season-consistency rule.
- **Player-count shrinkage and NB2:** shrinkage removed 162 infinite baseline
  log-loss rows, but worsened CRPS versus the selected-mean model in every
  season. NB2 slightly improved pooled scores within the shrinkage branch but
  worsened interval calibration and missed the stated cross-statistic and
  cross-season consistency rule. Neither change is in the selected runtime.

## Verification completed

- Parametric future-roster smoke: 2,048 score simulations, 4,096 Monte Carlo
  win-probability draws, no historical residual rows, exact player/team point
  totals, synthetic DOB ages, exact packaged-name ages, same-season idempotence,
  one-season advancement, and the same age in all live box-score snapshots.
- V4 rate-model smoke: 10,000 simulations and 100,000 player boxes; all six
  modeled rate fields, nine missing-input fallbacks, source pins, shooting-rate
  feature contract, and player/team point reconciliation passed.
- Live-event smoke: five games and 4,221 events; 36 linked blocks, 65 linked
  steals, 502 linked rebounds, exact player/team count and minute totals, and
  player box arithmetic passed.
- Age helper: 15 transition/provenance cases passed. Age index: 10 source,
  exact-identity, ambiguity, synthetic-DOB, and tamper-rejection cases passed;
  pinned source verification and deterministic index rebuild passed.
- All 12 source pins in the final candidate matched their local files.

## Scope and remaining limits

- This is a frozen, runnable development candidate, not proof of independent
  predictive validity. The score-distribution report is a chronological
  development diagnostic using the same pooled V4 source family.
- Age advances automatically. The runtime does **not** automatically project
  new DJHC ratings, physical attributes, per-36 rates, availability, or minutes
  into later seasons. Those remain caller-supplied inputs; the exploratory
  career rating transition has not been selected as a production projection.
- The model expects caller-provided rosters, projected minutes, ratings, and
  available team/player history features. It does not look up a historical
  game outcome at inference, generate an NBA roster, or predict who is active.
- The upload contains versioned model/runtime assets only. Studio routes and
  pages are not wired to this candidate by this release.

## Frozen artifacts

The exact runtime bundle, data index, model JSON, evaluation report, release
manifest, and their SHA-256 values are listed in the adjacent frozen checkpoint
and the versioned static release manifest under `tools/swishiq-studio/models/`.
