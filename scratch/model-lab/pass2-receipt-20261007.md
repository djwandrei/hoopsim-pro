# Fresh-Eyes Pass 2 — V4 Game Lab score model (scratch harness receipt)

**Date:** 2026-10-07 · Scratch development only — no app code touched. Continues `pass1-receipt-20261007.md`.
**All deltas: treatment − baseline, negative = better, 95% paired date-cluster bootstrap intervals.**

## New machinery added to the harness
- **Elo variant grid:** K ∈ {12,16,20,24,32} × HCA ∈ {35,50,65} × binary/**margin-of-victory** updates (FiveThirtyEight-style MOV multiplier `(‖m‖+3)^0.8/7.5`), all as selectable features.
- **Recency-weighted SRS:** a second family of schedule-adjusted rating solves with exponential day-decay (half-life 45/60/90, ~20-week window) — schedule-adjusted *form*, bridging emAdv (unadjusted, fast) and strAdv (adjusted, slow).
- **Per-date recency weighting** for the ridge fit (exponential half-life by day distance, rebuild cadence option) replacing the season-granularity decay.
- **Margin-stratified residual pools:** probability support drawn from the residual pool matching the predicted-margin regime (two pools cut at ±6, or three pools close/mid/blowout) — residuals are heteroskedastic across that split.
- Warmup-fitted calibration (shrink + logit-temperature) tested and **rejected** (does not transfer; probabilities already calibrated).

## Sweep results
1. **Margin-based Elo beats binary Elo.** Best single: K=12, HCA=50, MOV (`eloAdv_12h50m`): Brier 0.21312, log 0.61456 vs pass-1 binary (0.21315/0.61481). Slower K wins — margin updates already carry volume.
2. **Recency SRS is the biggest margin-model gain:** rStrAdv90 → Brier 0.21290, log 0.61411, margin MAE 10.887, CRPS 6.980 (vs 0.21313/0.61458/10.898/6.987).
3. **Stratified residual pools are the biggest probability gain:** Brier −0.0002, log −0.0005, and CRPS −0.017 on top of recSRS.
4. Per-date recency (270-day half-life) adds a further small resolved gain over season decay.
5. Neutral/negative (dropped): emFastAdv, ewrAdv, stdAdv10, all cross-product interactions (xStrEm/xStrRest/xEmRest/xEloStr), dual recSRS in the prob champion (kept only in CRPS variants), double-Elo, λ changes (8 fine; λM 48 = tiny MAE gain, worse CRPS), rebuild cadence insensitive.

## Champion (pass 2)
Margin basis: pass-1 BASE_M + `eloAdv_12h50m` (K=12, HCA=50, MOV Elo) + `rStrAdv90` (recency-SRS, 90-day half-life); fit: per-date recency half-life 270d, rebuild every 12 dates, λ 8/8; probability: margin-stratified residual pools, cuts at |margin| 6 and 9 (three pools, fallback to pooled).

**Vs replica baseline B0** (all resolved):
Brier −0.00400 [−0.00545, −0.00243] · log −0.00930 [−0.01261, −0.00564] · margin MAE −0.135 [−0.190, −0.081] · margin CRPS −0.149 [−0.162, −0.136] · home MAE −0.094 [−0.132, −0.055] · away MAE −0.055 [−0.093, −0.018].
Absolute: Brier 0.21258, log 0.61333, margin MAE 10.888, margin CRPS 6.905, ECE 0.019, accuracy 0.660.

**Vs pass-1 champion:** log −0.00165 [−0.00329, −0.00002] (resolved), Brier −0.00068 [−0.00139, +0.00002] (directional), margin CRPS −0.085 [−0.097, −0.073] (strongly resolved), margin MAE −0.018 (directional).

**Guardrails:**
- Coverage at nominal: 95% → 94.70%, 80% → 79.02% (the 3-pool CRPS gain is not a shrinkage artifact).
- Per-season vs B0: no season worse on Brier/log/margin-MAE; margin CRPS resolves in 2023/24/25, 2022 is +0.014 [−0.006, +0.033] (unresolved).

## Status
Development evidence only (this harness ≠ site runner). For the site-side agent: register as candidate series C58+ (MOV Elo K12 + recSRS-90 + date-recency 270 + stratified pools); keep C51/C57 pending the official comparison; extend the sealed prospective ledger before first target date. Untested: Elo K/HCA finer grid, margin-Elo with regression-to-mean variants, possessions-based efficiency (team-games artifact carries no pace fields; player-games artifact untested), total-head stratified residuals.