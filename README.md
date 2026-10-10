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

The dev server reads the full Studio data tree from this repository and reads
the other DJHC storefront public files through a read-only Vite bridge. By
default, those other files come from:

```text
C:\Users\djwan\Downloads\djshouseofcards-next-fixes-applied
```

On another computer, set `DJHC_SITE_ROOT` to the local storefront checkout
before starting Vite. The bridge exposes only the engine, franchise, and
public asset paths needed by the app from that checkout. It accepts `GET` and
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
`build`, and `build:site` run this bounded preparation step first. If the
storefront checkout is unavailable, they use the checked-in generated module.

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
and uses the same local read-only bridge for public data and runtime files.
When using a different storefront checkout, set `DJHC_SITE_ROOT` for both the
build-time preview server and `npm run dev`.

See [INTEGRATION.md](./INTEGRATION.md) for the static-site path and data
contract.
