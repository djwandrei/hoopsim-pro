# SwishIQ Studio

SwishIQ Studio is a React and Vite app served at `/tools/swishiq-studio/`. The
project runs locally without a Base44 account, CLI, backend, or SDK.

## Run locally

Install the locked dependencies and start Vite:

```sh
npm ci
npm run dev
```

The full Studio package tree lives in `integration/site/tools/swishiq-studio/data`
and is stored with Git LFS. After cloning, install Git LFS and fetch the data:

```sh
git lfs install
git lfs pull
```

`integration/site/studio-data-receipt.json` records the relative path, byte
size, and SHA-256 of every data file in this repository snapshot.

Open `http://localhost:5173/tools/swishiq-studio/`.

The dev server reads Studio data and native engine modules from this repository.
Lineup Lab and the four shared helper modules ship inside `public/studio-runtime/`.
The engine sources and their reviewed integrity hashes are checked in under
`public/tools/swishiq-studio/`; no retired tool directory is required.

A read-only Vite bridge supplies optional storefront pages, catalog data, and
storefront media from a DJHC checkout. By default, that checkout is:

```text
C:\Users\djwan\Downloads\djshouseofcards-next-fixes-applied
```

On another computer, set `DJHC_SITE_ROOT` to the local storefront checkout
before starting Vite to use those storefront integrations. The bridge prefers
the checked-in native modules and exposes only approved public paths. It accepts `GET` and
`HEAD`, returns no directory listings, and denies protected paths such as
`.env`, `.git`, `.deploy`, and `products.json`.

The full 3.83 GB data tree is tracked in this repository with Git LFS. The Vite
bridge streams it at the existing `/tools/swishiq-studio/data/` URLs, while
keeping it outside the app build. Vite copies this repository's checked-in
`public/` assets into `dist/`; those are the smaller app assets.

The Lineup Lab controller is generated into
`public/djhc-runtime/lineup-controller.js` by
`scripts/prepare-lineup-runtime.mjs`. The generator records the reviewed
source SHA-256, rewrites the controller's relative imports to same-origin
paths, and keeps initialization behind an explicit mount function. `dev`,
`build`, and `build:site` run this bounded preparation step first, using the
checked-in `public/studio-runtime/lineup-lab/app.js` source.

## Build and preview

Build and preview use the `/tools/swishiq-studio/` base path. Dev serves the
Vite optimizer from `/` so its dependency modules stay same-origin; the Studio
shell is still available at `/tools/swishiq-studio/`.

```sh
npm run build
npm run build:site
npm run preview
```

Both build commands write the static app to `dist/`. Preview serves that build
and uses the same read-only bridge for repository data and optional storefront
files. The build does not need a separate storefront checkout. Set
`DJHC_SITE_ROOT` when previewing integrations against another checkout.

For a cPanel release, package an existing build into a new external directory:

```sh
node scripts/prepare-cpanel-release.mjs --output <new-absolute-directory>
```

The packager verifies the explicit native dependency closure, scans staged text
for secrets, and records every deployed path, byte count, and SHA-256. It keeps
the full data tree outside the app build and includes the new pinned Impact
model companions needed by Lineup Lab.

See [INTEGRATION.md](./INTEGRATION.md) for the static-site path and data
contract.
