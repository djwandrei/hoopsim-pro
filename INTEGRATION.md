# SwishIQ Studio site integration

The app builds as a static site under `/tools/swishiq-studio/`. The complete
3.83 GB Studio data tree is checked into this repository at
`integration/site/tools/swishiq-studio/data` using Git LFS. The Vite bridge
streams that tree at its canonical `/tools/swishiq-studio/data/` URLs; the
large files stay outside the app build. The Studio-owned shared runtime modules
are checked in at `public/studio-runtime/modules/` and ship beneath the Studio
prefix. Native engine modules are checked in under `public/tools/swishiq-studio/`
with their SHA-256 PINS. Storefront pages, catalog integration, and media remain
at their existing DJHC URLs and can be read from a local storefront checkout.
Vite includes this repository's checked-in `public/` assets in `dist/`.

## Local development

See [README.md](./README.md) for the install, dev, build, and preview commands.
Vite's local bridge serves the repository's Studio data tree and maps only the
other approved public URL paths to the local DJHC checkout, preferring checked-in
native modules. It serves files
read-only and streams the large data tree without copying it into `dist/`. Set
`DJHC_SITE_ROOT` when the checkout is not at the default path.

The bridge maps these existing public paths:

- `/tools/swishiq-studio/data/` (from this repo's Git LFS tree)
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
- `/assets/dj-logo.png`, `/assets/placeholder-basketball.svg`, and
  `/tools/shared-result/public-keys.js`
- `/assets/nba-logos/`, `/assets/games/`, and the two public NBA headshot trees

The bridge also maps the checked-in public runtime and build artifacts under
the Studio prefix during local development: `/tools/swishiq-studio/studio-runtime/`,
`/tools/swishiq-studio/djhc-runtime/`, and
`/tools/swishiq-studio/swishiq-game-sim/`. This keeps direct base-path checks
and native module loading on JavaScript/JSON responses instead of the SPA
fallback; the same files are copied into `dist/` for preview.

Missing files in these namespaces return a plain 404. The bridge has no write
routes, does not list directories, and rejects paths that target `.env`,
`.git`, `.deploy`, or `products.json`.

### Lineup Lab controller

The checked-in `public/djhc-runtime/lineup-controller.js` is generated from
the reviewed `public/studio-runtime/lineup-lab/app.js` by
`scripts/prepare-lineup-runtime.mjs`. It contains the original source SHA-256,
keeps static imports outside `mountLineupController(...)`, rewrites relative
imports to same-origin Studio runtime or engine URLs, and leaves the
controller's cleanup and initialization under the returned mount handle. The
generator fails closed if the source import or initialization contract changes.
`npm run dev`, `npm run build`, and `npm run build:site` prepare it before
starting or compiling. Both source and generated module are checked in, so the
build does not require a separate storefront checkout.

## Build output

Run `npm run build` or `npm run build:site`; both write a static app to `dist/`
with the `/tools/swishiq-studio/` base path. To check that output locally, run
`npm run preview` and open `http://localhost:4173/tools/swishiq-studio/`.

Serve the built app shell and its generated assets at
`/tools/swishiq-studio/`. The matching data package tree and native files
must be served at their canonical Studio paths. The hosting layer must route
Studio page paths to the app shell while serving data and static files
directly; a missing data or asset file must remain a 404 instead of receiving
the app shell.

The bounded cPanel packager reads
`scripts/studio-native-release-closure-20261010-v1.json`, verifies every declared
source hash and byte count, and places nested `dist/tools/` files at their
canonical website paths. It also includes the immutable Lineup Lab Impact
model manifest, nine season estimates, and two assessment reports from
`integration/site/`. New releases preserve the existing complete data tree.

The root `/tools/` hub redirects to Studio. Retired standalone tool URLs redirect
to Studio; `/lineup-lab/` redirects to `/tools/swishiq-studio/lineup-lab`. The
shared public result page remains at `/tools/shared-result/` and loads its helper
modules from Studio.

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
