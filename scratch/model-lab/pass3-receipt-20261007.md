# Pass 3 — Debugging + player-games feature adoption (2026-10-07)

Scope: scratch/model-lab only. Development evidence; nothing here replaces the
site's official champion until ported through the official runner.

## Debugging pass
- Verified the recency-weighted residual CRPS identity: the weighted integral
  term reduces exactly to the unweighted Σ(2i−n+1)x₍ᵢ₎/n² identity when all
  weights are 1 (algebraic check; used for the residHalf branch in harness2).
- Fixed three wiring bugs in the new player-feature path:
  player-games `side` lists are arrays not Maps; the pg standardization block
  ran before the base stdT/stdM declarations (TDZ); a duplicate stdT
  declaration from the first integration edit.

## New lever: player-games-derived features (open todo from pass 2)
Artifact: `player-games.json` (~35 MB/season, joins team-games on gameRef;
93% of records join to eligible regular-season games).
Module: `playerFeatures.cjs` — strict chronology: top-5/top-8 by prior minutes
(current season + 0.7 × prior season), availability/absence rolling stats, all
computed from games strictly before the target date.

Feature set (margin head): `availAdv5, availAdv8, missAdv10, minTop5Adv`
(pgTotal `availMean5` added nothing). Missing-side games contribute 0.

## Results (pooled; eval seasons 2022–25, n=4,920)
| config        | brier   | log     | maeM   | crpsM  | ECE    | cov95 | cov80 |
|---------------|---------|---------|--------|--------|--------|-------|-------|
| shipped champ | 0.21286 | 0.61401 | 10.888 | 3.109  | 0.0230 | 94.67 | 79.88 |
| + pg features | 0.21164 | 0.61112 | 10.844 | 3.104  | 0.0153 | 94.45 | 79.43 |
| + strat cut6  | 0.21136 | 0.61042 | 10.844 | 3.101  | 0.0132 | 94.57 | 79.00 |

Paired date-cluster bootstrap (800 reps) vs shipped champion: brier, log,
maeH, maeM and crpsM all significantly better (95% CIs exclude zero);
maeA directionally better. ECE drops ~43%.

Per-season guardrails (pg features vs shipped champ): 2023/2024/2025 improve
on brier/log/maeM; 2022 slightly worse on brier/log (+0.00119/+0.00262) while
still better on maeM. Accepted: net gain concentrated in recent seasons.

## Rejected this pass
- Recency-weighted residual support (residHalf 150–1200): CRPS −0.4% but
  brier/log slightly worse — a wash; not adopted.
- `minTop5Adv` alone with A5+M10: worse than the 4-feature set.
- cut7/cut7-hi9: better brier/log but materially worse CRPS/coverage.
- probScale ≠ 1: 0.95 gains CRPS only by under-covering (93.4/76.9) — kept 1.

## New scratch champion
`{ total: 11-feature set, margin: champ16 + [availAdv5, availAdv8, missAdv10,
minTop5Adv], recHalf: 270, stratProb: true, stratCut: 6, probScale: 1 }`

## Next steps
- Port pg features + strat cut6 to the site's official runner (hashed validation).
- Player-side next lever: same-day injury-report-observations artifact as a
  pre-game availability proxy (needs a cutoff-safe audit).
- Test possession-pace features from game-entities (pace adv) as margin/total
  heads additions.