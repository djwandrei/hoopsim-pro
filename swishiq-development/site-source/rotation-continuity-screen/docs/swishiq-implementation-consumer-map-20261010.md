# SwishIQ implementation consumer map (2026-10-10)

This map records the local source routes and runtime boundaries for the four requested consumers. It is based on source inspection of the shared working tree; it is not a live deployment, package approval, or behavior-verification receipt. The working tree was already dirty during inspection.

## Consumer routes and data flow

| Consumer | Canonical route and entry | Owning source | Worker/runtime | Scope and evidence boundary |
| --- | --- | --- | --- | --- |
| Game Lab | `/tools/swishiq-studio/game/` → `tools/swishiq-studio/game/index.html` → `studio.js` workbench key `game` | `tools/swishiq-studio/game-lab.js` (`startSwishIqGameLab`) and `engine/season-lab-model.js`, `engine/possession-simulator.js`, `engine/game-lab-evaluation.js` | React bridge `react-game-lab-bridge.js` loads `mountGameLab` from the Candidate100 React labs bundle. The native Game Lab path does not create a dedicated Worker. | Requires an exact native season and `seasonSimulation` capability; pooled history is rejected as a matchup substitute. Current simulation is a bounded possession-rate/event model, not retained play-by-play. The UI discloses missing possession outcomes and missing game-level pregame snapshots; in-season as-of evaluation is unavailable. V4 Game Lab use is separately subject to its approved runtime/model gate. |
| Studio Lineup (observed lineup view) | `/tools/swishiq-studio/chemistry/` → `tools/swishiq-studio/chemistry/index.html` → `studio.js` workbench key `chemistry` | `tools/swishiq-studio/chemistry-lab.js` (`startSwishIqChemistryLab`) and its exact-season evidence adapters | `chemistry-observed-worker.js` handles observed dataset loading/filtering. The worker is not the optimizer. | Studio has no separate `Lineup` workbench key or optimizer route in `studio.js`. Its lineup-facing surface is Chemistry/Pair Profile: observed shared-floor and exact-five combinations. V3 evidence is gated by exact-season package capabilities/artifacts; V4 consumes exact-season Chemistry and lineup-evidence data. The UI describes observed differences as descriptive, not causal or predictive. |
| Standalone Lineup Lab | `/lineup-lab/` → `lineup-lab/index.html` | `lineup-lab/app.js`, `optimizer-core.js`, `optimizer-config.js`, `lineup-role-model.js`, `native-swishiq-package.js`, `swishiq-impact.js` | `app.js` starts `optimizer-worker.js` as a module Worker; the worker calls `optimizeLineups` in `optimizer-core.js`. | This is the actual lineup optimizer. It loads exact-season V3 evidence and gates the V4 model path separately. It ranks groups by an explicitly defined planning/preference objective; its copy says player impact is not a game forecast or predicted coaching rotation. Display bounds, objective values, soft position-minute targets, scenario inputs, and constraint receipts are kept distinct. |
| Season Lab | `/tools/swishiq-studio/season/` → `tools/swishiq-studio/season/index.html` → `studio.js` workbench key `season` | `tools/swishiq-studio/season-lab.js` (`startNativeSeasonLab`), `engine/season-lab-model.js`, `engine/season-simulator.js`, `engine/season-forecast-evidence.js` | React bridge `react-season-lab-bridge.js` loads `mountSeasonLab` from the Candidate100 React labs bundle. No Season Lab Worker construction was found in the inspected source path. | Exact-season and pooled-window inputs are separate; exact selection does not fall back to pooled rows. Prospective forecasting requires an accepted immutable `forecast-season` manifest with pinned model/profile/schedule/backtest evidence. Source has distinct retrospective-playoff and forecast-safe rate selection. A local source path does not establish an accepted manifest or deployed forecast capability. |

## Practical naming and scope notes

- “Studio Lineup” is not a standalone Studio optimizer route in this checkout. Use the Chemistry route for observed lineup evidence and `/lineup-lab/` for lineup optimization.
- The Game Lab and Season Lab pages share the Studio shell but have distinct native entry modules and evidence contracts. Their matching navigation or shared React bundle does not make their model capabilities interchangeable.
- Worker use is limited to the observed Chemistry data path and the standalone Lineup Lab optimizer in the inspected modules. Game Lab and Season Lab execute their relevant native source paths without a dedicated Web Worker declaration.
- The associated 49-item source-level disposition is in [swishiq-implementation-backlog-disposition-20261010.json](swishiq-implementation-backlog-disposition-20261010.json). “Implemented” in that ledger means source behavior is present; it does not claim tests passed, deployment occurred, or an evidence package was approved.

## Evidence paths

- `tools/swishiq-studio/studio.js` — `WORKBENCH_MODULES`, `tabLabels`.
- `tools/swishiq-studio/game/index.html`, `chemistry/index.html`, `season/index.html` — canonical page routes and common Studio app entry.
- `tools/swishiq-studio/game-lab.js` — `startSwishIqGameLab`, `loadSource`, exact-season source gate and limits disclosure.
- `tools/swishiq-studio/chemistry-lab.js`, `chemistry-observed-worker.js` — observed exact-five/shared-floor evidence and worker boundary.
- `lineup-lab/app.js`, `optimizer-worker.js`, `optimizer-core.js` — standalone optimizer route, worker protocol, and objective/constraint output.
- `tools/swishiq-studio/season-lab.js`, `engine/season-lab-model.js`, `engine/season-forecast-evidence.js` — exact/pooled selection, season simulation, and forecast-manifest boundary.
- `tools/swishiq-studio/react-game-lab-bridge.js`, `react-season-lab-bridge.js` — React shell bridges to the dedicated page modules.
