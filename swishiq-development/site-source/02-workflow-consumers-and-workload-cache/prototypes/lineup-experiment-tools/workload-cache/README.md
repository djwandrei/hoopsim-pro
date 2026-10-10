# Workload appearance cache

This is an isolated prototype cache for already eligible archived game records. It reuses gameRows() from scripts/benchmark-lineup-workload.mjs for player-row extraction and reconciliation, then validates game identity, date, and one-appearance-per-player grain with validateGames(). It does not duplicate the PBP stat formulas or modify the canonical optimizer, benchmark, archive, or workload runner.

Prepare a cache from a local archive:

    node prototypes/lineup-experiment-tools/workload-cache/extract.mjs --archive <archive-directory>

The default selects every manifest entry whose status is completed, primaryPhase is regular, and eligibleForPublication is true. A deliberate prefix can be bounded with --max-games. The selection order is the archive manifest's entry order. Hard limits cover manifest size and entries, selected games, per-game and aggregate compressed bytes, per-game and aggregate decompressed bytes, and final cache size.

Run an exact reference-row and benchmark-outcome parity smoke:

    node prototypes/lineup-experiment-tools/workload-cache/extract.mjs --archive <archive-directory> --max-games 120 --verify-reference --bootstrap-iterations 50 --bootstrap-seed 20261009

Run the same command again to verify a cache hit. Each invocation re-hashes the source manifest, all selected compressed game files, and the pinned extraction/reconciliation code paths before it can use the cache. Reference verification deliberately re-reads and re-extracts the selected raw games through the existing gameRows() path; it is a verification operation, not a cache-hit timing measurement.

Cache entries and one-receipt-per-invocation records are written only below this directory's runs/ folder. Cache keys bind the exact manifest bytes, selected game-file paths/sizes/SHA-256 values, selection policy, and code hashes for this extractor, the existing workload benchmark and validator, and the archive export/reconstruction dependency files. Cache hits verify both the input identity and cached output checksum before reading appearances.

The existing benchmark reconciliation contract is preserved: complete retained official Summary player totals must reconcile player by player with PBP; legacy archives with no retained official fields use the existing PBP-to-final-team-score gate. A legacy gate pass does not establish complete player-level official-stat reconciliation. Receipts report which accepted path was used.

The appearance cache contains local player-game rows derived from licensed source material. Keep the cache and receipts private and local. These files are not deployment inputs and do not prove full-season coverage, calibration, causality, or predictive validity.
