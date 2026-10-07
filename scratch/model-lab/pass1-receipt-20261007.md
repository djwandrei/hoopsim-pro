# Fresh-Eyes Pass 1 — V4 Game Lab score model (scratch harness receipt)

**Date:** 2026-10-07 · **Scope:** scratch development experiments only — no app code, pages, or site packages touched.
**Harness:** `scratch/model-lab/harness.cjs` (this workspace). Data: the published V4 release tree's `team-games` artifact, seasons 2020-21 through 2025-26, fetched live from the site's data base (pinned release `v4-site-12ad90dc8710`).

## Protocol (mirrors ledger Section 7)
- Strict chronology: every feature, SRS solve, and ridge fit uses only games strictly before the target local date; rolling origin per local date.
- Two-head ridge (intercept unpenalized), total head standardized, margin head RMS-scaled, paired residual-support probabilities (1,000-pair window), empirical margin CRPS.
- Paired date-cluster bootstrap (800–1,000 reps, seeded) for all deltas; per-season guardrails checked.

## Baseline sanity (replica of C10-v9-style core)
B0 (last-10 PF/PA, win rate, rest, 7-day density, SRS strength advantage; λ=8):
- Brier 0.21658 (ledger C10 v9: 0.218084), log loss 0.62262 (0.625415), margin MAE 11.023 (11.0495), margin CRPS 7.054 (7.9032 with fuller support).
- The replica is leaner (no Four-Factor/profile/rotation features, frozen warmup standardization, season-granularity recency), so it is **not** bit-identical to the site runner — but it lands on the reference's numbers, making within-harness paired deltas meaningful.

## Findings (all deltas: treatment − baseline, negative = better, 95% date-cluster intervals)

1. **Elo is the untested family.** The 40+ candidate register has no Elo anywhere. Adding a margin-Elo advantage feature (binary Elo, K=20, +50 Elo HCA, season mean-reversion to 1505, scaled /100):
   Brier −0.00294 [−0.00387, −0.00193], log loss −0.00678 [−0.00895, −0.00441], margin MAE −0.119 [−0.159, −0.081], margin CRPS −0.065 [−0.067, −0.063]. Largest single-variable gain found in this pass.
2. **EWMA form helps** (per-game decay 0.88 margin/total EWMA added to both heads): Brier −0.00121 [−0.00204, −0.00047] alone, consistent with the 94×50-style exponential form in the reference doc.
3. **Multi-window (5/20-game) additions** behave like the ledger found: small probability gain, better side scores.
4. **Venue form:** negligible on this basis (matches ledger keeping it but finding no resolved solo gain).
5. **Recency-weighted fit is new:** the ledger only tuned ridge λ, never the training-loss weighting. Season-decay 0.7: margin CRPS −0.00062 [−0.00086, −0.00041], Brier −0.00008 (unresolved). Small but consistent.
6. **λ=8 remains fine on the Elo-augmented basis** (λ 32/42 no resolved gain; λ 42 slightly worse margin CRPS) — the ledger's λ=42 preference does not transfer once Elo is in the basis.
7. **Support-scale shrink is a coverage trade-off (rejected):** scaling the residual support by 0.95/0.9/0.85 improves margin CRPS monotonically (−0.35 at 0.95) but breaks nominal coverage (95%: 94.57%→92.38%→90.59%; 80%: 79.82%→74.88%). At scale 1.0 coverage is dead-on nominal. Per ledger rule 7E this is not a promotion; it independently confirms the variance-prior direction (C51–53).

## Champion (scratch) config
Features: total [hp10, ap10, hpa10, apa10, restMean, g7Mean, etMean, hp20, ap20, hpa20, apa20]; margin [pfAdv10, defAdv10, wrAdv10, restAdv, g7Adv, strAdv, emAdv, eloAdv, pfAdv20, defAdv20, wrAdv20, pfAdv5, defAdv5, venueAdv]; recency 0.7 per season back; λ 8/8; support scale 1.0.
Versus B0: Brier −0.00329 [−0.00457, −0.00202], log −0.00757 [−0.01029, −0.00472], margin MAE −0.116 [−0.163, −0.067], margin CRPS −0.063 [−0.067, −0.060], home MAE −0.084 [−0.117, −0.052], away MAE −0.058 [−0.090, −0.026].
Per-season guardrails: no season worsens on any metric; margin CRPS resolves in all four seasons; probability resolves in 2023/24/25, directional in 2022.

## Status & next steps
- Development evidence only — passes the comparative check inside this harness, not independent validity.
- Port to the site's official runner (register as a new candidate series, e.g. C57+: Elo + EWMA + recency weighting) so exact receipts/hashes exist per ledger rules; keep C51 as champion until the official comparison passes.
- Then extend the sealed prospective ledger with the new candidate before its first target date.
- Untested here (future passes): Elo K/HCA tuning, margin-based Elo updates, player-games-derived features (33 MB/season artifact), per-date recency weighting, C55-style distribution calibration on the new basis.