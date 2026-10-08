# SwishIQ model and simulation source copy

Snapshot date: 2026-10-08. This is a local, independent folder containing the current selected Candidate100 Game Lab model plus the separate player-game simulator and their complete JavaScript import dependencies.

## Contents

- `game-model/modules/`: six exact copies of the selected Candidate100 runtime and its ridge fitting, feature policy, and paired uncertainty dependencies.
- `game-model/configuration.json`: exact frozen Candidate100 settings (40 total predictors; 39 margin predictors; intercepts unpenalized; total ridge 200; margin ridge 400; training half-life 720 days; refit every 3 days; total model weight 0.9; margin scale 1.025; total offset 0.2; 2,500-game residual window; full Gaussian uncertainty).
- `game-model/state/`: exact copies of fitted current and season-boundary checkpoints. The current checkpoint has observed outcomes through 2026-04-12. They include standardization, coefficients, normal equations, and residual history; these are necessary learned model state, not season/pooled data packages.
- `simulation/lib/`: exact copies of the player-game Monte Carlo, coherent box-score, and live event simulators, plus every local import dependency.
- `simulation/models/`: separate fitted player-simulation and shared-player-production model artifacts. These are different models from Candidate100. The copied parametric simulator is version 4.3.0-fatigue-guard-candidate; the optional shared production artifact is development-only.
- `experiments/models/`: exact source copies of feature contexts, fit/design code, scoring, metrics, and paired inference helpers required for external-input experiments.
- `experiments/diagnostics/`: two portable copies of the source feature and bounded mean-cache builders. Only input/output routing and the feature-name-contract lookup were changed; the manifest records those adaptations.
- `tools/`: new local CLI entry points that read explicitly supplied files; they do not fetch site assets.
- `examples/`: a labeled synthetic feature-schema template. It contains no real matchup inputs.
- `manifest.json`: original source locations, hashes, byte counts, adaptation details, and static import-closure results.

No NBA season/pooled packages, historical feature datasets, full forecast ledgers, website HTML/React files, site adapters, registry loaders, deployment code, credentials, `.env` files, or npm dependency folders are included. The original source paths retained in the manifest/checkpoints are provenance metadata; they are not runtime imports or files that must exist on the receiving machine.

## Runtime

Use Node.js 22 or later (Node.js 24 recommended). No npm install is needed; the code uses native ES modules, Node built-ins, and Web Crypto. Keep the folder structure intact. Input/output paths supplied by the caller may be anywhere on the local machine. Outputs refuse to overwrite existing files/directories.

## Run Candidate100 from supplied pregame features

```powershell
Set-Location 'C:\Users\djwan\Downloads\SwishIQ-Model-Copy-20261008'
node .\tools\predict.mjs .\examples\game-request-template.json .\game-model\state\checkpoint-current.json 'C:\path\to\new-prediction.json'
```

This example is synthetic and demonstrates the input schema only. For a real game, provide all selected feature names under `inputFeatures.total` and `inputFeatures.margin`, `targetGameRef`, `targetDate`, `featureObservedThrough`, and `seasonStartYear`. Dates use `YYYY-MM-DD`. The target date and feature cutoff must be after/before the relevant fitted-history boundaries. A fresh feature record is still required; a fitted checkpoint does not construct a future team's roster or box-score history.

You can submit `{ "games": [...] }` for several games on one local date. Optional `observeRows` must contain the entire pre-predicted date batch, including each `gameRef`, `gameDateLocal`, `seasonStartYear`, `features`, and target `{ homeScore, awayScore, total, margin }`. The runner returns a next checkpoint after successfully sealing that batch. Never feed a same-date outcome before all games on that date have been predicted.

The public module API is `hydrateRuntime`, `predictGame`, `observeDate`, and `exportRuntime`. Modules keep their exact existing research/status flags; this export does not change the manual-release decision or establish empirical predictive validity.

## Build and evaluate from external data

The data packages are intentionally excluded. Supply the necessary parts or an existing compatible feature cache externally.

```powershell
node .\experiments\diagnostics\build-feature-cache.mjs 'E:\external\package-parts' 'E:\runs\new-feature-cache' '2021,2022,2023,2024,2025'
node .\experiments\diagnostics\fit-mean-cache.mjs .\game-model\configuration.json 'E:\runs\new-feature-cache\feature-rows.jsonl' 2020 'E:\runs\new-mean-cache'
node .\tools\score-forecasts.mjs 'E:\runs\new-mean-cache\forecast-means.jsonl' '2022,2023,2024,2025' 'E:\runs\new-score-report'
```

The feature builder expects `game-lab-inputs.json`, `team-games.json`, and `player-games.json` in the supplied parts directory. It preserves the current source builder's 2020 warmup and supported 2021-2025 season-start-year range; this portable copy does not broaden historical support. The mean builder preserves the 400-game chronological standardization prefix and prior-date refits. Alternatively, supply an already-compatible external feature cache to the mean builder.

The scoring CLI applies the existing Candidate100-compatible full-Gaussian scorer and reports pooled/per-season Brier, log loss, MAE, CRPS, interval scores, and coverage. It is a development metric runner, not the complete official validation gate suite. The exact paired-inference helper is included for callers that supply same-game baseline losses and the required resampling settings; baseline datasets and receipts are excluded.

## Run the separate player-game simulator

Supply `scenario.json` with `{ "input": { ... }, "options": { "seed": 1, "sampleCount": 100 } }`. `input` follows `game-simulator-v2.mjs`'s contract: home/away team context, projected player rotations, ratings/rates, prior history, and any explicit feature overrides. Use actual external scenario records; this export does not supply rosters or ratings datasets.

```powershell
node .\tools\simulate-player-game.mjs 'E:\inputs\scenario.json' base 'E:\runs\new-simulation.json'
node .\tools\simulate-player-game.mjs 'E:\inputs\scenario.json' coherent 'E:\runs\new-coherent-simulation.json'
node .\tools\simulate-player-game.mjs 'E:\inputs\scenario.json' live 'E:\runs\new-live-simulation.json'
```

For shared-player production in live mode, the request may include `playerProductionModelFile` pointing at the copied shared production JSON and its required prior-player inputs. `coherent` and shared live paths retain their original experimental disclosures. No season/franchise UI, trade tool, or site orchestration is included.

## Copy verification and limits

All files listed as `byteIdentical` in `manifest.json` were compared byte-for-byte with their workspace originals. Every static local module import resolves within this folder; external module imports are Node built-ins only. The copied configuration matches each Candidate100 checkpoint's configuration SHA-256. The only adapted source files are the two portable external-input runners; new CLI files are listed separately.

No model predictions, simulations, calibration, performance benchmark, or validation suite was executed while creating this folder. The original workspace and production files were not modified. Future efficiency-infrastructure changes have not been applied to this snapshot.
