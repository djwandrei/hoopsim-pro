# V4 Game Lab Score Model — Agent Handoff Brief
Date: 2026-10-07 · Status: validated scratch champion, pending official-runner port.
Protocol: strict chronology (a game's features use only games strictly before
its local date), rolling origin per date, two ridge heads, empirical
residual-pool probabilities, paired date-cluster bootstrap (2,000 resamples)
for all comparisons.

## 1. Final model

Two ridge heads + empirical probability layer.

**Total head** — ridge (λ=8), y = game total (home pts + away pts):
`TOTAL = β0 + Σ βi·xi` over 12 standardized features:
hp10, ap10, hpa10, apa10, hp20, ap20, hpa20, apa20 (rolling pf/pa means,
prior 10/20 games with prior-season shrinkage), restMean, g7Mean
(rest days & 7-day game count, both teams averaged), etMean (EWMA total,
α≈0.12), venueTotMean (team venue-specific totals, prior 10).
NOTE: `totAdv10` was dropped in pass 6 — it is an EXACT linear combination of
hp10/hpa10/ap10/apa10 (verified deviation 0) and adds nothing (paired deltas 0).

**Margin head** — ridge (λ=8), y = home pts − away pts:
`MARGIN = γ0 + Σ γi·zi` over 20 standardized features:
- Form: pfAdv10/20, defAdv10/20, pfAdv5, defAdv5 (per-team rolling off/def
  means as home−away differentials), wrAdv10/20 (win-rate diffs),
- Schedule-strength: strAdv (season-decayed SRS), rStrAdv90 (recency SRS,
  90-day half-life exp decay), eloAdv (game Elo, K=20, HCA=50),
  eloAdv_12h50m (tuned Elo: K=12, HCA=50, margin-of-victory multiplier,
  538-style |m|+3 ^ 0.8 / 7.5 update),
- Momentum/rest: emAdv (EWMA margin, α≈0.12), restAdv, g7Adv, venueAdv.
- Player-games: pg:availAdv5, pg:availAdv8 (availability diffs, roll-3),
  pg:missAdv10 (top-10-minutes absence diff), pg:minTop5Adv
  (top-5-minute-earner share diff, roll-5). All strictly prior-games.

**Probability** — margin-stratified empirical residual pools (key detail):
trailing window (1,000 games) of margin residuals `r = actual − predicted`;
for a new game with predicted MARGIN, draw from the pool its |MARGIN| regime
belongs to (close: |MARGIN| < 6 → close pool; else blowout pool; each pool
falls back to the full window until ≥100 members). Residual support centered
at pool mean, probScale = 1:
`P(home) = (1/n) · #{ MARGIN + (ri − r̄_pool) > 0 }` (+0.5 weight on ties).
No Gaussian assumption — variance is homoskedastic (verified, §4), and the
stratified pools were the only probability variant that beat the flat pool.

**Standardization (frozen, prior info only):** totals features z-scored by
warmup-season (2020–21) mean/sd; margin + pg features scaled by warmup rms
(with `||1` guard — pg features are all-zero during warmup: no player-game
artifact for those seasons).

## 2. Test history & outcomes
All vs baseline (6T+6M rolling ridge), paired date-cluster bootstrap, eval =
2022–25 regular seasons (n = 4,920 games; warmup = 2020–21).

| Pass | Test | Outcome |
|---|---|---|
| 1 | Elo + EWMA form + recency-weighted fits | Gains; adopted. Support shrinkage rejected (coverage drop). |
| 2 | Residual-pooling & rating variants | Margin-stratified pools + recency SRS adopted; champion recorded. |
| 3 | Player-games availability/minutes features | Pooled gains adopted (weaker in 2022); CRPS identity debugged. |
| 4 | venueTotMean, totAdv10, pool shrinkage | venue + totAdv adopted on totals; pool shrinkage rejected. |
| 5 | Full audit (below) | totAdv10 flagged as exact-redundant; residuals clean. |
| 6 | Drop totAdv10 / lean margin (drop eloAdv) | **totAdv10 drop adopted (deltas exactly 0); eloAdv drop REJECTED (CRPS +0.0205 [0.017, 0.024], significant). |

Dead ends (do not retry): Gaussian probability head, heteroskedastic variance
ridge (varRidge), online probScale calibration (oscillates), kernel-weighted
residual support, direct online-logistic win head, dropping eloAdv.

## 3. Final champion numbers (eval 2022–25)
Brier 0.21253 · Log-loss 0.61313 · MAE-margin 10.888 · CRPS-margin 3.0829 ·
Accuracy 66.32% · ECE 0.0182 · coverage/season bias clean (bias ≤ ±0.6;
DW 1.983; lag-1 autocorr 0.007).

## 4. Audit evidence (pass 5)
- Collinearity: margin head VIFs — eloAdv_12h50m 118 (R²=.9915), emAdv 60,
  eloAdv 58, strAdv 19, roll-family 10–18; condition 1543. Handled by ridge;
  coefficients are NOT interpretable. Totals head non-singular after drop.
- Residuals: mean +0.076, sd 13.93; homoskedastic (blowout/close sd ratio
  1.01; |resid| vs |margin| corr −0.011) — validates empirical pools,
  refutes variance models.
- No exact linear dependency remains in either head.

## 5. Data used
Source: DJHC canonical V4 published season packages
`https://www.djshouseofcards-comics.com/tools/swishiq-studio/data/v4/releases/v4-site-12ad90dc8710/`
— per-season `registry.json` → exact-season package → `team-games` artifact
(rows filtered: regular season, reconciliationStatus=matched,
trainingEligible=true; home/away joined per gameRef). Seasons 2020–2025.
Player-game minutes for the pg features: per-season player-games artifact
(~33 MB/season), minutes-ranked availability/rotation stats built strictly
from prior games.