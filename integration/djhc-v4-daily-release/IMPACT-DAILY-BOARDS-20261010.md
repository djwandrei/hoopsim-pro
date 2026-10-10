# V4 Impact Daily Boards — 2026-10-10

## Release

- Board contract: `djhc-swishiq-static-daily-board-v4`, contract version 3.
- Scoring: `swishiq-impact-combined-source-ranking-v1`.
- Board dates: 90 daily dates from 2026-10-10 through 2027-01-07, 90 boards per game.
- Impact evidence: 2025-26 regular season, package `nba-swishiq-v4-2025-26`, version `v4-canonical-20260929-1469d53a1c0c`.
- Impact companion: `swishiq-v4-impact-native-20261010-v1`, model `native-v4-conditional-lineup-od-v1`.
- Impact manifest SHA-256: `33ffa08170730bdd072c10b911f699aeeec38e5cc3b76cd567c17bdf49626b2a` (9,006 bytes).
- Source package index SHA-256: `1fd25b4aa1b27df8aab3a1802a0afb69e62fce5faffa4278c02171fbb2aa806f`.
- Player-games source SHA-256: `4fb297e54eb7d7c2b8a6f32ba070a3a556f63ea6ba09d1557bb24675ade66e0e` (28,712 rows).
- Explicitly excludes 2026-27 data.

## Scoring rules

- **Fix the Five:** Five same-team historical challenges; each has a five-player baseline and three eligible replacement candidates. Rank each resulting five by its full-precision mean of offense plus defense.
- **Draft Night:** Five historical team rounds with three candidates each and 15 distinct player names. Enumerate all 243 legal complete drafts and rank their five-player mean combined Impact.
- Ties use deterministic canonical-name ordering. Saved runs point to the exact board hash; replaced board pins remain in the historical pin list.
- Results are descriptive source-impact rankings. The Impact model was accepted for historical conditional scoring of specified paired lineups; its use here does not validate individual player ranks or future performance. Individual uncertainty is not estimated.

## Verification record

- Build generated 180 boards and a ranking audit covering all 180 boards and 21,870 Draft Night combinations.
- Ranking audit SHA-256: `1910ab2e4be43684e6c3d827bb2905c53177b639d83d7fa4aa9fca05e5833dd0` (4,516,553 bytes).
- Consolidated local acceptance: 180 board hashes/schema checks, 540 legal selection rankings, tampered board/result rejection, 26 archived pins, evaluator request handling, invalid selection rejection, unavailable horizon handling, and outage handling all passed.
- Existing relevant contract, evaluator, client, and generator tests passed: 25/25.
- Supabase `swishiq-game-evaluate` active version: 8 (`verify_jwt=false`).
- cPanel scoped upload: 308 files—180 boards, 125 runtime/bundle dependencies, 3 activation files; zero deletes. A post-upload SHA-256/byte-length check found 308/308 identical.
- Live browser: both games loaded the 2025-26 Impact board, accepted selections, returned verified ranks, and restored the identical result after reload. Draft Night enumerated rank out of 243. No page errors were reported.
- Responsive check: 390px viewport had no horizontal overflow; the Fix the Five candidate carousel appeared once on mobile and was hidden at desktop width.
- Release artifacts: [`impact-native-daily-20261010/`](impact-native-daily-20261010/).

## Runtime/source locations

- Public Studio source/runtime and pinned assets: `integration/site/tools/swishiq-studio/` and `public/tools/swishiq-studio/`.
- React pages and saved-run restoration: `src/pages/FixTheFive.jsx`, `src/pages/DraftNight.jsx`, `src/hooks/useDailyGameBoard.js`, and `src/lib/dailyGames/`.
- Public daily board release pin and board JSON: `integration/site/tools/swishiq-studio/data/v4/releases/v4-site-12ad90dc8710/`.
- Board generator and focused tests: `integration/site/scripts/`.
