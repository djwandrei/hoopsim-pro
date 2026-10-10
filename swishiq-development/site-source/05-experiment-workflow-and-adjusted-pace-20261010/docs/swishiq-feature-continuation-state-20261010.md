# SwishIQ source-feature continuation state audit

Date: 2026-10-10

## Finding

The experiment tooling has mean-fit checkpoints and design-prefix transfer, but it does not have a complete, integrated checkpoint for continuing source-feature generation. These are separate states: the mean checkpoint resumes fitted normal equations, standardization, coefficients, and residuals over already materialized feature rows. It does not resume the feature builders that produced those rows.

`models/game-lab-candidate57-runtime-checkpoint-v3.mjs` is also a model-runtime checkpoint, not a source-feature checkpoint. Its exported runtime state contains total and margin normal equations, standardization, fitted model, residual pool, and date boundaries. The `sourcePins` identify inputs; they do not contain the per-team feature histories or allow a feature builder to continue from that boundary. Export requires the current local date to be fully observed and does not include pending predictions.

## Source-family state coverage

| State family | Serialized for exact source-feature continuation? | Current support and gap |
|---|---|---|
| EWMA / recurring team ratings | No | `models/game-lab-candidate10-history-features-v2.mjs` rebuilds team history, league summaries, and opponent-adjusted strength/offense/defense updates from the full score history. These are additive capped updates with seasonal retention, not an EWMA; the mutable maps and accumulators are local to the builder and are not exported. |
| Elo / SRS | No | Candidate57's `pass6:eloAdv` feature is supplied as a value in the input feature rows; its runtime checkpoint does not preserve the source rating history that produced it. `experiment-tools/lib/strength-context.mjs` is an experimental indexed sparse SRS helper, not an Elo implementation; its context is in-memory, includes `Map` ratings, and has no portable snapshot/restore API. Its result explicitly says row-level parity is not established. |
| Player and rotation history | No | The Candidate 16 rotation and Candidate 23 player-role builders accept full game/player/team rows and targets. No source-state serializer or continuation receipt is defined for those histories. |
| League state | No, with a score-only partial exception | `experiment-tools/lib/source-context.mjs` stores score-level running aggregates and can snapshot/restore its indexed history. It does not store the Candidate 10 league mean/variance state or the league accumulators used by the box-score feature family. |
| Box-score history | No | The Candidate 21 builder reads the full paired player-game and team-game rows. Its per-team history arrays, league sums, adjusted factors, and date snapshots are transient builder state. |
| Venue history | No, with a score-only derivation path | The indexed score-history helper can rederive prior home/away score means and venue deviations from its complete score history. It has no portable Candidate 24 venue-feature state and carries no player or box-score fields. |
| Multi-window scoring history | No, with a score-only derivation path | The indexed helper can query prior score windows from its complete history. Candidate 10's five-game, twenty-game, season, and day-count contexts are rebuilt from all input games; their feature snapshots are not continued from a checkpoint. |

The partial support in `lib/source-context.mjs` is deliberately narrower than a source-feature checkpoint. It normalizes each input to game identity, date, season, teams, and scores; maintains score history, indexes, small aggregates, a complete-date boundary, and a rolling input-prefix hash; and can restore that score history after validating its derived indexes. It cannot restore the box-score, player, rotation, EWMA, Elo, venue-feature, or league-variance state required by the full source rows.

The `buildCandidate10V4HistoryContexts` parameter named `checkpointDate` is also not a continuation-state loader. It filters the requested schedule targets to dates after that date, then rebuilds the context from the full verified completed-game input.

Adoption is still pending for concrete reasons. The indexed history module describes itself as groundwork rather than a feature builder or runner integration, and explicitly notes that its complete-date transition does not reproduce Candidate57's per-game feedback sequence when a new team's EWMA is initialized. The indexed sparse-SRS result also has no established row-level parity. `experiment-tools/IMPLEMENTATION-STATUS.md` records feature-state integration and row-level parity as outstanding.

For the Candidate 21 box-score family, the current builder does preserve an important cutoff rule: it captures all contexts for a local date before applying any outcomes from that date. A future checkpoint for that family must retain the same date-batch ordering. Other source builders' existing update order must also be preserved; a generic score-history snapshot is not enough to infer or replace it.

## Safe fallback today

Use the existing full-feature rebuild path from pinned inputs. For Candidate 21, `experiment-tools/build-candidate100-candidate21-boxscore-feature-artifact-v2.mjs` verifies the pinned base feature rows and source manifest, loads the complete pinned team-game and player-game tables, and calls `buildCandidate21BoxscoreContexts` from the start of the supplied history. It writes a hash-keyed feature artifact and receipt. For a source family already present in the base Candidate 100 rows, reuse that complete pinned feature file; if the rows need regeneration or extension, rerun the corresponding existing builder over the full chronological source input. Then resume the mean/design work from its own checkpoint only after the complete feature rows are materialized and pinned.

There is no current source-data blocker to this fallback in the inspected Candidate 21 path: the completed adjusted-pace artifact receipt pins the base feature rows, full team-game table, full player-game table, and Candidate100 configuration. Its feature artifact covers 7,230 ordered rows, including the 2020 warmup and 2021–2025 seasons. The limitation is the lack of a complete, parity-verified source-feature continuation state.

The Candidate21 model source itself remains byte-pinned: the Candidate57 source manifest records 15,108 bytes and SHA-256 `2939104c1ee672a08a21d196fdc125b0a84f52d5c329e195d51156dd8809ad8b`, matching the current file.

## Next implementation before adopting feature continuation

Add a separately versioned source-feature checkpoint format, independent of the mean-fit checkpoint. At each completed local-date boundary it should pin the full input prefix and builder code/configuration, then serialize the family-specific state needed by the next date: rolling score and venue windows, league accumulators and seasonal anchors, rating/EWMA/Elo state, player and rotation attribution state, and paired box-score/team-factor history. Preserve each builder's existing within-date or per-game update order.

Restore that state against the pinned prefix, generate the next complete date batch, and compare the resumed feature rows against a fresh full rebuild over overlapping dates, including season transitions, venue splits, multi-window cutoffs, and same-date games. Require row-level equality under the existing builder's numeric contract before wiring the checkpoint into any source-feature runner. Until that proof exists, rebuilding the complete feature rows is the supported continuation path.
