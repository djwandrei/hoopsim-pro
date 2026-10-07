# Pass 5 — Variance, Correlation & Independence Audit (2026-10-07)

Scope: audit-only pass. No model changes. Evidence for the pass-6 decision on
dropping `totAdv10` from the totals head.

## Setup
- Subject: pass-4 scratch champion
  `CFG = { total: CHAMP_T (12), margin: CHAMP_M (16 + 4 pg), recHalf: 270,
  stratProb: true, stratCut: 6, probScale: 1 }`.
- Design-matrix stats (variance/correlation/VIF/condition) computed on the
  standardized design over warmup seasons only (strictly prior info).
- Independence tests on champion residuals over eval seasons (2022–25, n=4920)
  from the chronological rolling-origin run.
- New in this pass: direct-regression VIF (stable), exact-dependency check,
  NaN audit of design columns. Two audit bugs found and fixed: (1) the pg
  warmup scale stats needed harness2's `|| 1` rms guard (warm seasons have no
  player-game data → rms 0 → infinite standardization); (2) NaN/Inf audit now
  gates VIF/Jacobi so poisoning can't silently null results.

## Findings

### 1. Exact linear dependency in the totals head (the headline)
`totAdv10 − ((hp10 + hpa10) − (ap10 + apa10))` has max |dev| = 0.0000 and
sd = 0.0000 across all 7,230 games — `totAdv10` is an EXACT linear combination
of the pf/pa quadruple. Confirmed by VIF: hp10/ap10/hpa10/apa10/totAdv10 all
R² = 1 (VIF ∞); totals correlation-matrix min eigenvalue is exactly 0
(condition ~4e12). The totals design matrix is singular rank-wise; only the
ridge penalty keeps the solve numerically stable.
→ **Recommendation: drop `totAdv10` from the totals head.** Pass 4 already
showed no loss (T+venueTot ≡ T+all3 to ~0.03 points CRPS). Costless
simplification plus a non-singular solve.

### 2. Margin head: severe but non-exact collinearity
Ratings family: `eloAdv_12h50m` (VIF 118, R² = 0.9915 — 99% explainable by the
rest of the design), `emAdv` (60), `eloAdv` (58), `strAdv` (19),
`rStrAdv90` (10). Rolling-window family: pfAdv10/20, defAdv10/20,
wrAdv10/20 VIFs 10–18. pg features 3.5–7.8. Clean features: restAdv/g7Adv
(~1.0), venueAdv (1.8). Margin condition number: 1543 (moderate; no exact
dependency found in the margin set).
Interpretation: expected — three rating systems (season-SRS, recency-SRS,
Elo) plus EWMA form all measure team strength. The ridge penalty handles this
numerically, but with R² = 0.99 on `eloAdv_12h50m` the individual coefficient
magnitudes are meaningless (only the fit as a whole is).
→ **Verdict: keep for prediction; do not interpret coefficients.** Optional
pass-6 test: drop `eloAdv` (r = 0.975 with `eloAdv_12h50m`) as a lean variant.

### 3. Totals head (excluding the exact block)
After the quadruple, collinearity is ordinary: hp20/ap20/hpa20/apa20 VIF ~5.2,
venueTotMean 4.3, g7Mean/restMean/etMean ~1.2. Max non-exact r = 0.881
(hp10↔hp20, same family). Nothing to act on beyond dropping totAdv10.

### 4. Variance audit (raw scale, warmup rows)
All features have healthy spread; pg availability features are near-zero-mean
(league-neutral by construction) with sd 0.26–0.45 raw / 0.16–0.26
standardized. `restAdv`/`g7Adv` are zero-heavy (52%/59% zeros) — expected
(rest differentials cluster at 0, g7 counts often equal), not a defect.

### 5. Residual independence & homoskedasticity (eval seasons)
- Mean bias +0.076 points; sd 13.93 — unbiased.
- lag-1 autocorrelation 0.0074, Durbin–Watson 1.983 — no temporal dependence;
  the chronological residual-pool machinery is operating on effectively
  independent draws.
- Heteroskedasticity: residual sd by predicted-margin stratum — close 14.01,
  mid 13.66, blowout 14.13 (ratio 1.01); |resid| vs |pred margin| correlation
  −0.011. Margin variance is essentially homoskedastic in the predicted
  margin → confirms the dead ends (varRidge, Gaussian variance model) and
  supports the fixed margin-stratified pools as the right probability basis.
- Per-season: bias within ±0.6; predicted sd (4.9–7.4) well under observed
  (13.7–16.4) as expected for feature-driven point predictions.

## Verdict
- **Act:** drop `totAdv10` from the totals head (exact redundancy, zero cost).
- **Do not act:** margin-head trimming (ridge handles it; prediction-only use).
- **Confirmed dead ends:** variance-modeling approaches (homoskedasticity
  audit), kernel-weighted support (VIF/strata results consistent with pass-3).

## Next steps (pass 6)
1. Rerun the champion minus `totAdv10` and record official scratch-champion
   numbers for the to-be-ported runner.
2. Optional lean-margin variant (drop `eloAdv`) head-to-head.
3. Port the winning configuration to the site's official runner for hashed
   validation before any adoption.