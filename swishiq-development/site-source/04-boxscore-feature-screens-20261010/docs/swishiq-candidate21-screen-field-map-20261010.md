# Candidate21 Low-Overlap Screen Field Map — 2026-10-10

## Purpose and confidence

Static implementation map for a future Candidate100 development screen of Candidate21 pace, turnover, offensive-rebound, and free-throw-rate signals. No code/config/data was changed and no experiment or runtime invocation was performed. Field names and formulas below are direct source evidence; `c21:` aliases and the proposed configuration are the development-screen wiring recommendation.

## Candidate21 context source and side fields

Source: `prototypes/swishiq-package-v4/models/game-lab-candidate21-boxscore-history-context-v1.mjs`.

`buildCandidate21BoxscoreContexts(...)` returns a `contexts` map keyed by `gameRef`. Each value has:

```json
{
  "format": "swishiq-candidate21-boxscore-history-context-v2",
  "gameDateLocal": "...",
  "observedThrough": "... or null",
  "sourcePriorTeamGameCount": 0,
  "home": { "historyGameCount": 0, "pace20": 0, "turnoverRate20": 0, "opponentTurnoverRate20": 0, "offensiveReboundRate20": 0, "opponentOffensiveReboundRate20": 0, "freeThrowRate20": 0, "opponentFreeThrowRate20": 0 },
  "away": { "...": "same side schema" }
}
```

Each side metric is the shrunk average of that team's latest 20 prior team-game records: `(sum(last up to 20 values) + 8 * priorLeagueMean) / (n + 8)`. The builder captures all contexts for a local date before adding that date's outcomes. Its history is keyed by `teamCode` and takes the last 20 prior records; there is no explicit season-boundary reset in this builder.

For each paired historical team game, the underlying per-game values are:

- Possessions: `FGA + 0.44 * FTA - OREB + TOV`.
- `turnoverRate`: `TOV / possessions`.
- `offensiveReboundRate`: `OREB / (own OREB + opponent DREB)`.
- `freeThrowRate`: `FTA / FGA`.
- `pace`: `(own possessions + opponent possessions) / 2`.
- `opponentTurnoverRate`, `opponentOffensiveReboundRate`, and `opponentFreeThrowRate` use the paired opponent's box score with the corresponding formulas.

The context side keys are exactly `pace20`, `turnoverRate20`, `opponentTurnoverRate20`, `offensiveReboundRate20`, `opponentOffensiveReboundRate20`, `freeThrowRate20`, and `opponentFreeThrowRate20` (plus `historyGameCount`). `estimatedPossessions20` is also in the context's validated field list, but it has no emitted native Candidate21 feature-family slot in the mapping below.

## Native Candidate10 model output names and transforms

Source: `prototypes/swishiq-package-v4/models/game-lab-native-score-model-candidate10-v5.mjs` (`HISTORY_FAMILIES` plus the boxscore transform block). Let `h` and `a` denote the context's home and away sides.

| Family | Native total slot(s) and formula | Native margin slot and formula |
|---|---|---|
| `boxscore-pace` | `meanBoxscorePace20 = (h.pace20 + a.pace20) / 2` | `boxscorePaceAdvantage20 = (h.pace20 - a.pace20) / 2` |
| `boxscore-turnovers` | `meanBoxscoreTovRate20 = (h.turnoverRate20 + a.turnoverRate20) / 2`; `meanBoxscoreOpponentTovRate20 = (h.opponentTurnoverRate20 + a.opponentTurnoverRate20) / 2` | Define `homeTurnoverDrag = (h.turnoverRate20 + a.opponentTurnoverRate20) / 2`, `awayTurnoverDrag = (a.turnoverRate20 + h.opponentTurnoverRate20) / 2`; `boxscoreTurnoverMatchupAdvantage20 = (awayTurnoverDrag - homeTurnoverDrag) / 2` |
| `boxscore-rebounds` | `meanBoxscoreOrbRate20 = (h.offensiveReboundRate20 + a.offensiveReboundRate20) / 2`; `meanBoxscoreOpponentOrbRate20 = (h.opponentOffensiveReboundRate20 + a.opponentOffensiveReboundRate20) / 2` | Define `homeOrbMatchup = (h.offensiveReboundRate20 + a.opponentOffensiveReboundRate20) / 2`, `awayOrbMatchup = (a.offensiveReboundRate20 + h.opponentOffensiveReboundRate20) / 2`; `boxscoreOrbMatchupAdvantage20 = (homeOrbMatchup - awayOrbMatchup) / 2` |
| `boxscore-free-throws` | `meanBoxscoreFtr20 = (h.freeThrowRate20 + a.freeThrowRate20) / 2`; `meanBoxscoreOpponentFtr20 = (h.opponentFreeThrowRate20 + a.opponentFreeThrowRate20) / 2` | Define `homeFtrMatchup = (h.freeThrowRate20 + a.opponentFreeThrowRate20) / 2`, `awayFtrMatchup = (a.freeThrowRate20 + h.opponentFreeThrowRate20) / 2`; `boxscoreFtrMatchupAdvantage20 = (homeFtrMatchup - awayFtrMatchup) / 2` |

These are the native C10/Candidate21 names. For Candidate100's new development slots, keep those semantics but prefix with `c21:`; do not expose raw context-side keys as model predictors.

## Development-feature row namespace

The mean-feature input is Candidate57-shaped JSONL. The loader reads each configured value from `row.features.total[name]` or `row.features.margin[name]`; it does not read `row.historicalContext.boxscore` as a selected predictor. A derived row therefore needs, for example:

```json
{
  "features": {
    "total": {
      "c21:meanBoxscorePace20": 99.2,
      "c21:meanBoxscoreTovRate20": 0.13,
      "c21:meanBoxscoreOpponentTovRate20": 0.14,
      "c21:meanBoxscoreOrbRate20": 0.25,
      "c21:meanBoxscoreOpponentOrbRate20": 0.24,
      "c21:meanBoxscoreFtr20": 0.24,
      "c21:meanBoxscoreOpponentFtr20": 0.23
    },
    "margin": {
      "c21:boxscoreTurnoverMatchupAdvantage20": 0.005,
      "c21:boxscoreOrbMatchupAdvantage20": 0.01,
      "c21:boxscoreFtrMatchupAdvantage20": -0.006
    }
  }
}
```

Use the exact same names in the data rows, the per-head Candidate100 feature arrays, and the development feature contract. Values should be finite for every row in both heads; Candidate57's ordinary total-feature path permits explicit null with warmup-center substitution, but these shrunk Candidate21 fields are expected to be finite. Keep the original C100 values, row order, target identity, and `observedThrough` intact. A verified `sourceManifest` supplied to `run-means.mjs` must directly pin the exact feature JSONL.

## Current development loader / config contract

Current source has an explicit experimental-feature path. `experiment-tools/lib/configuration.mjs` accepts this optional config field:

```json
"developmentFeatureContract": {
  "format": "swishiq-development-feature-contract-v1",
  "source": "Candidate21 prior team-boxscore context; pin exact source and adapter in the artifact receipt",
  "formula": "Candidate21 field formulas and head transforms as mapped in this document; 20 prior team games, prior league mean shrinkage weight 8",
  "observedThroughRule": "contexts captured before any outcome on the target local date; observedThrough < gameDateLocal",
  "featureNames": {
    "total": [
      "c21:meanBoxscorePace20",
      "c21:meanBoxscoreTovRate20",
      "c21:meanBoxscoreOpponentTovRate20",
      "c21:meanBoxscoreOrbRate20",
      "c21:meanBoxscoreOpponentOrbRate20",
      "c21:meanBoxscoreFtr20",
      "c21:meanBoxscoreOpponentFtr20"
    ],
    "margin": [
      "c21:boxscoreTurnoverMatchupAdvantage20",
      "c21:boxscoreOrbMatchupAdvantage20",
      "c21:boxscoreFtrMatchupAdvantage20"
    ]
  }
}
```

The accepted name pattern is `^[a-z][a-z0-9-]*:[A-Za-z0-9_.:-]+$`; `c21:` satisfies it and is distinct from C57's built-in `c51:` / `pass6:` names. Each head list is required, names within each list must be unique, and names may not duplicate a built-in feature for that head. The contract validator requires nonempty `source`, `formula`, and `observedThroughRule` strings. The contract's names become the experimental allowlist passed by `design-cache.mjs` to `buildCandidate57Standardization`; they must cover every selected `c21:` slot.

For each cloned Candidate100 mean configuration:

- Append only that variant's selected aliases to `totalFeatureNames` and/or `marginFeatureNames`; retain all baseline names and order.
- Update the matching `totalPredictorCount` / `marginPredictorCount` to the selected array length. The generic validator checks the arrays and ridge settings, not those Candidate100 count fields.
- Add positive finite `featureRidgePenaltyMultipliers[head][alias]` entries (the existing hustle preparer uses `1` for each new slot).
- Keep the configuration development-only and retain the baseline's fit, calibration, affine, uncertainty, and policy settings.
- Keep the same full experimental name allowlist in `developmentFeatureContract.featureNames` for all family variants, even when a particular variant selects only one family. The contract is included in the mean settings and design-cache artifact signature.

The corresponding plan uses `format: "swishiq-mean-batch-plan-v1"`, the derived feature JSONL as `features`, its verified direct-output receipt as `sourceManifest`, explicit `warmupSeasonStartYear` / `throughSeasonStartYear`, and `configurations: [{ "id": "...", "configuration": "...json" }]`. Every configuration is loaded and validated by `run-means.mjs`; the design builder applies `headFeaturePolicy`, builds warmup standardization, and then requires the selected `features.*[alias]` value on every row.

**Caveat:** `docs/candidate100-history-reliability-adapter-contract-20261010.md` describes a missing generic experimental-name route. The current inspected source has since (or otherwise) exposed the `developmentFeatureContract` → `experimentalFeatureNames` path above, so that specific blocker appears stale in source. This is a static code-path finding only; no end-to-end run was performed. Keep the contract identical across configs in one mean batch: `run-means.mjs`'s in-memory design-reuse signature is based on feature arrays, policy, and warmup prefix, while the artifact design signature also carries the development contract.

## Evidence paths inspected

- `prototypes/swishiq-package-v4/models/game-lab-candidate21-boxscore-history-context-v1.mjs` — context keys, formulas, window, shrinkage, chronology.
- `prototypes/swishiq-package-v4/models/game-lab-native-score-model-candidate10-v5.mjs` — native `HISTORY_FAMILIES` and head transformations.
- `prototypes/swishiq-package-v4/experiment-tools/lib/configuration.mjs` — exact development-feature contract schema and name syntax.
- `prototypes/swishiq-package-v4/models/game-lab-candidate57-c51-pass6-hybrid-v4.mjs` — experimental-name normalization, allowlist, missingness and design transform.
- `prototypes/swishiq-package-v4/experiment-tools/lib/design-cache.mjs` — contract forwarding and design receipt signature.
- `prototypes/swishiq-package-v4/experiment-tools/run-means.mjs` and `lib/mean-batch.mjs` — feature JSONL / source-receipt loading, configuration batch and fit linkage.
- `docs/candidate100-history-reliability-adapter-contract-20261010.md` — prior planning contract whose design-route blocker needs reconciliation with current source.
- `prototypes/swishiq-package-v4/experiment-tools/prepare-candidate100-hustle-screen.mjs` — Candidate100 per-head alias and configuration pattern.
