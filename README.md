# SwishIQ Studio

SwishIQ Studio is a React and Vite app served at `/tools/swishiq-studio/`. The
project runs locally without a Base44 account, CLI, backend, or SDK.

## Run locally

Install the locked dependencies and start Vite:

```sh
npm ci
npm run dev
```

Open `http://localhost:5173/tools/swishiq-studio/`.

The dev server reads the DJHC storefront's public files through a read-only
Vite bridge. By default it uses:

```text
C:\Users\djwan\Downloads\djshouseofcards-next-fixes-applied
```

On another computer, set `DJHC_SITE_ROOT` to the local storefront checkout
before starting Vite. The bridge exposes only the Studio data, engine,
franchise, and public asset paths needed by the app. It accepts `GET` and
`HEAD`, returns no directory listings, and denies protected paths such as
`.env`, `.git`, `.deploy`, and `products.json`.

The external storefront checkout and its 3.83 GB data tree stay outside the
app build. Vite still copies this repository's checked-in `public/` assets into
`dist/`; those are the smaller, already-tracked app assets.

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
