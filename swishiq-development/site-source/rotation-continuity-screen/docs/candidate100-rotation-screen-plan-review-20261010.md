# Candidate100 rotation screen plan review

## Conclusion

The existing rotation screen preparer defines six isolated one-slot mean configurations and a compatible experiment plan. It clones the pinned Candidate100 configuration into local run output, adds one excluded slot to only its mapped head, and leaves the Candidate100 source configuration and model code untouched. `run-plan.mjs` accepts the six configuration entries and screens each mean result with its matching configuration.

This is a static review only. No preparation, fit, or screen was run.

## Exact inputs

- Adapter receipt: `prototypes/swishiq-package-v4/experiment-tools/runs/candidate100-rotation-alias-adapters/run-1791611066914-1308-6f826060-2032-452e-97c2-b00b96a33ab6/run.json`. It pins the Candidate100 config and the Candidate57 feature rows and manifest. The adapter's top-level `featureRows` and `cacheReceipt` are null; the rotation preparer correctly reads `sourcePins.candidate57FeatureRows` and `sourcePins.candidate57FeatureManifest` instead.
- Mean-batch `features` file: `prototypes/swishiq-package-v4/diagnostics/game-lab-candidate57-source-cache-20261007/feature-rows.jsonl` (34,346,629 bytes; SHA-256 `3e9c5e6b3102464b686dea5e43277e80166e67702628e74b14ba56b0c23ede3d`). The adapter records 7,230/7,230 rows with finite values for all six slots. The Candidate57 manifest's total and margin feature lists also cover every feature already selected by Candidate100.
- Mean-batch `sourceManifest`: `prototypes/swishiq-package-v4/experiment-tools/runs/cache/rotation-input/9d20d8a8ef50b24b2f5ea2285a0215448767f0f37d0400990f8138e506b0d9e4/receipt.json`. This reusable bridge receipt pins the feature JSONL, the Candidate57 source manifest, and the rotation adapter receipt. Use the bridge receipt, not the Candidate57 `manifest.json` alone: the latter records upstream package inputs but does not pin its own feature JSONL output. `run-means.mjs` requires the supplied manifest's verified `checked` pins to include the exact feature-file hash and byte length.
- Baseline config: `prototypes/swishiq-package-v4/diagnostics/game-lab-candidate100-pruned-total-model-blend090-v1-20261008/configuration.json` (SHA-256 `6e7fa2868fb9bcf4716603a15a953f42f1f6faa0b70e3ecd7f1ea56b45992e94`; 40 total predictors, 39 margin predictors). It currently excludes all six mapped rotation slots.
- Baseline forecasts and manifest expected by the preparer: `prototypes/swishiq-package-v4/diagnostics/game-lab-candidate100-pruned-total-model-blend090-v1-20261008/mean-cache/forecast-means.jsonl` and `.../mean-cache/manifest.json`. Both exist. The manifest pins the forecast file and Candidate100 configuration; the forecast file has 6,824 rows with the Candidate100 model version.

## Six planned variants

| Head | Semantic metric | Added Candidate100 slot |
|---|---|---|
| total | active player overlap | `c51:meanActivePlayerOverlap5` |
| total | starter overlap | `c51:meanStarterOverlap5` |
| total | minute-share overlap | `c51:meanMinuteShareOverlap5` |
| margin | active player overlap | `c51:activePlayerOverlapAdvantage5` |
| margin | starter overlap | `c51:starterOverlapAdvantage5` |
| margin | minute-share overlap | `c51:minuteShareOverlapAdvantage5` |

For each variant the preparer clones the baseline JSON, adds one slot to one head, sets that slot's ridge penalty multiplier to 1, removes only that slot from `excludedFeatures`, and updates the predictor count. The other head's feature list is checked unchanged. The intended plan uses `swishiq-experiment-plan-v1` with a `swishiq-mean-batch-plan-v1` (`features`, `sourceManifest`, season bounds, and six `{id, configuration}` entries) plus the screen settings. The runner loops over all mean results and supplies each result's matching configuration to `run-screen.mjs`.

## Compatibility and blockers

`prepare-candidate100-rotation-screen.mjs` is the appropriate preparer. The older `prepare-candidate100-hustle-screen.mjs` is not directly reusable: it requires a hustle adapter format, separate `featureRows`/`cacheReceipt` fields, and eight mappings. The rotation preparer already handles the rotation receipt shape, creates or reuses the bridge manifest, and writes only development configs and plans under `runs/rotation-continuity-individual/`.

No input-path or schema blocker was found for preparing the six configs and invoking the experiment runner without editing Candidate100. Actual execution and result validity remain unverified; the adapter explicitly marks the work development-only and promotion-disallowed. It also notes that starter-label/window counts are not stored in the feature cache, so the adapter cannot report those counts from these rows.
