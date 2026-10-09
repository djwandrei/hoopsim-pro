# SwishIQ Studio site integration

The app builds as a static site under `/tools/swishiq-studio/`. Canonical data,
native runtime modules, and public media remain at their existing DJHC URLs;
browsers request them from the same origin as the Studio page. Vite includes
this repository's checked-in `public/` assets in `dist/`, but the much larger
external storefront checkout and its 3.83 GB data tree stay outside the app
build.

## Local development

See [README.md](./README.md) for the install, dev, build, and preview commands.
Vite's local bridge maps only approved public URL paths to the local DJHC
checkout, serves files read-only, and streams them without copying the
storefront data into `dist/`. Set `DJHC_SITE_ROOT` when the checkout is not at
the default path.

The bridge maps these existing public paths:

- `/lineup-lab/` (the reviewed Lineup Lab source modules and fixture files)
- `/tools/swishiq-studio/data/`
- `/tools/swishiq-studio/engine/`
- `/tools/swishiq-studio/franchise-sim-20261008/`
- `/tools/swishiq-studio/react-app/`
- `/tools/swishiq-studio/assets/`
- `/tools/swishiq-studio/*.js`, `*.mjs`, `*.css`, `*.html`, and supported
  public static-file types
- `/products-public.json`, `/backend-config.js`, `/supabase-client.js`,
  `/vendor/supabase.min.js`, and the public storefront HTML paths used by the
  Studio shell (`/about.html`, `/account.html`, `/basketball-cards.html`,
  `/collectibles.html`, `/comics.html`, `/contact.html`, `/index.html`,
  `/policies.html`, `/returns.html`, `/sell-trade-want-list.html`,
  `/shipping.html`, `/shop.html`, and `/sports-cards.html`)
- `/assets/dj-logo.png`, `/assets/placeholder-basketball.svg`,
  `/tools/collection-lineup-builder/collection-fit-core.js`,
  `/tools/result-visuals.js`, `/tools/result-passport.js`,
  `/tools/shared-result/public-keys.js`, `/tools/swishiq-static-projection.js`,
  `/tools/swishiq-daily-game-client.js`, `/tools/team-assets.js`, and
  `/tools/fan-tools.css`
- `/assets/nba-logos/`, `/assets/games/`, and the two public NBA headshot trees

The bridge also maps checked-in build artifacts under the Studio prefix during
local development: `/tools/swishiq-studio/djhc-runtime/` and
`/tools/swishiq-studio/swishiq-game-sim/`. This keeps direct base-path checks
and native module loading on JavaScript/JSON responses instead of the SPA
fallback; the same files are copied into `dist/` for preview.

Missing files in these namespaces return a plain 404. The bridge has no write
routes, does not list directories, and rejects paths that target `.env`,
`.git`, `.deploy`, or `products.json`.

### Lineup Lab controller

The checked-in `public/djhc-runtime/lineup-controller.js` is generated from
the reviewed storefront `lineup-lab/app.js` by
`scripts/prepare-lineup-runtime.mjs`. It contains the original source SHA-256,
keeps static imports outside `mountLineupController(...)`, rewrites relative
imports to same-origin `/lineup-lab/` or `/tools/` URLs, and leaves the
controller's cleanup and initialization under the returned mount handle. The
generator fails closed if the source import or initialization contract changes.
`npm run dev`, `npm run build`, and `npm run build:site` prepare it before
starting or compiling; an existing checked-in module allows builds without a
local storefront checkout.

## Build output

Run `npm run build` or `npm run build:site`; both write a static app to `dist/`
with the `/tools/swishiq-studio/` base path. To check that output locally, run
`npm run preview` and open `http://localhost:4173/tools/swishiq-studio/`.

Serve the built app shell and its generated assets at
`/tools/swishiq-studio/`. Existing DJHC public data and native files remain
served at their original website-root paths. The hosting layer must route
Studio page paths to the app shell while serving data and static files
directly; a missing data or asset file must remain a 404 instead of receiving
the app shell.

## Studio routes

The app shell serves these client-side routes:

| Route | Area |
| --- | --- |
| `/` | Studio home |
| `/sims/…` | Sims and What-ifs, Season Lab, Game Lab, Franchise Lab |
| `/analytics/…` | Analytics and Career Lab |
| `/players/*` | Player Lab |
| `/chemistry/` | Chemistry Lab |
| `/forge/`, `/forge-models/` | Composite Forge |
| `/lineup-lab/` | NBA Lineup Lab |
| `/spin/` | Spin Room |
| `/book/` | Play-money sportsbook |
| `/daily-games/…` | Daily Games, Fix the Five, Draft Night |
| `/collector/…` | Collector Center and virtual packs |
| `/playbook/` | Playbook |
| `/workshop/` | Workshop |
| `/account/` | Account |

Every route is under `/tools/swishiq-studio/` on the site.
