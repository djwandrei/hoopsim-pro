# SwishIQ Studio — Site Integration Guide

This package is the SwishIQ Studio web app (React + Vite) prepared for direct
integration into **djshouseofcards-comics.com**, replacing the current
SwishIQ Studio. It is fully public (no login), self-contained in a static
build, and loads all of its data and gameplay from your site same-origin —
**no server-side code or changes to your data pipeline are required.**

## 1. Build

```bash
npm ci
VITE_STANDALONE=true npm run build
```

The `VITE_STANDALONE=true` flag compiles the standalone site build:
- The app is built with the base path `/tools/swishiq-studio/`.
- All Base44-specific runtime (auth, relays, SDK) is compiled out.
- Without the flag, the app builds in "Base44 preview" mode (for hosted
  development only) — never deploy that build to the site.

## 2. Deployment

Copy everything from `dist/` into your site so that:

- `/tools/swishiq-studio/index.html` serves the app.
- `/tools/swishiq-studio/assets/...` (hashed JS/CSS bundles) are served as-is.
- `/tools/swishiq-studio/djhc-chrome.css` — shared chrome stylesheet (if your
  site already serves one, it can be skipped/overwritten).
- `/tools/swishiq-studio/studio-assets/forge/` — two silhouette images used by
  the Forge workbench. Copy them into your site's asset tree (e.g.
  `/assets/forge/`) only if you relocate them; see §5.

**Server configuration (the one required site change):** the app is a single
page application. Your server must return `index.html` for these paths
under the studio root (all other files are served statically):

| Route | Page |
| --- | --- |
| `/tools/swishiq-studio/` | Studio home |
| `/tools/swishiq-studio/season/` | Season Lab |
| `/tools/swishiq-studio/players/*` | Player Lab (all player pages) |
| `/tools/swishiq-studio/chemistry/` | Chemistry Lab |
| `/tools/swishiq-studio/forge/` | Forge (Build-A-Bucket) |
| `/tools/swishiq-studio/game/` | Game Lab |
| `/tools/swishiq-studio/career/` | Career Lab |
| `/tools/swishiq-studio/spin/` | Spin Room |

The previous studio page at `/tools/swishiq-studio/` is fully replaced, so
every existing site link that points there keeps working.

## 3. Data — loads from your site, same-origin, zero server code

The app reads the same published sources your current studio uses, directly
from `/tools/swishiq-studio/data/` (same-origin, browser-cached via the
existing `?v=` / `?rev=` cache-busting parameters):

| Source | Size | Used by |
| --- | --- | --- |
| `v4/releases/v4-site-12ad90dc8710/registry.json` | small | release pin + package discovery |
| exact-season package parts (`team-styles`, `roster-memberships`, `player-seasons`, `player-entities`) per season | ~1–15 MB each | Season/Player/Forge/Game labs |
| `nba-actual-schedules-v1.json` | ~2 MB | Season Lab schedule |
| `player-metadata.json` | ~0.2 MB | headshot mapping |
| `public-player-context-v2.json` | ~34 MB | player context & public stats (cached in-memory + browser cache) |
| pooled `player-seasons` artifact | ~121 MB | Career Lab only — **streamed** record-by-record in the browser (never fully parsed), reduced to career rows, cached for the session |

Notes:
- The V4 release pin lives in `src/lib/season/seasonSourceCore.js`
  (`V4_RELEASE = 'v4/releases/v4-site-12ad90dc8710'`). When you publish a new
  V4 release, update this constant (and the `?v=` cache-bust strings) — the
  app discovers everything else from the registry dynamically.
- Supported seasons: 2017-18 through 2025-26 (`SUPPORTED_YEARS` in the same
  file).

## 4. Native workbenches (original gameplay)

The Chemistry, Advanced, Game and Season native workbenches load your site's
own module files (e.g. `chemistry-lab.js`, `advanced-labs.js`,
`react-*-lab-bridge.js` and their imports) same-origin, and each one is
verified against reviewed SHA-256 pins **in the browser** before execution:
- Pins live in `base44/shared/studioNativeAssets.ts` (`PINS` map).
- If a module's hash does not match its pin, the workbench refuses to run —
  so a site update can never silently change gameplay.
- **When your site updates the studio's modules, refresh the pins**: fetch
  each pinned file, compute SHA-256, and update the map.

## 5. Assets the app expects on your site

| Path on the site | Contents |
| --- | --- |
| `/assets/nba-logos/…` | team logos, including `retro-opaque/` variants (already on your site) |
| `/assets/games/swishiq-studio-emblem-20260913.png` | studio emblem / favicon (already on your site) |
| `/assets/player-headshots/{nba,nba-no-background}/…` | player headshots, referenced from `player-metadata.json` (already on your site) |
| `/tools/swishiq-studio/studio-assets/forge/` | `basketball-silhouette-light.png` + `basketball-silhouette-dark.png` (new — copy from the build's `dist/studio-assets/forge/`) |

## 6. What was removed for the standalone build

- Login/registration and all auth gating — the studio is public, like your
  current one. (Auth-related shims remain only to satisfy the app-shell
  contract and are inert.)
- The Base44 data relay: replaced by in-browser source building
  (`src/lib/season/seasonSourceCore.js`) and direct same-origin loading
  (`src/components/native/nativeTransport.js`).
- The route base name and logo/asset paths switch automatically via
  `src/lib/deployConfig.js` — no code edits needed at integration time.