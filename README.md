# demo1

[Open the live demo](https://uchamb.github.io/demo-v1/)

Explore demo1: a concept tower, furnished apartments, and downloadable 3D models.

## Run locally

Use Node.js 20 or newer.

```sh
npm ci
npm run dev
```

Open http://localhost:5179/demo-v1/. The development server is also accessible to devices on the same network.

## Build and preview

```sh
npm run build
npm run preview
```

Open http://localhost:5183/demo-v1/. The `dist` directory is a complete static website. JavaScript, fonts and geometry are bundled locally; no backend or runtime API key is required. Use an HTTP server, not a `file://` URL.

The Vite base path is `/demo-v1/` for GitHub Pages. For a different hosting path, set `base` in `vite.config.js` accordingly.

## Validate

With the production preview running:

```sh
npm test
```

Browser checks use Playwright and local Google Chrome. Set `CHROME_PATH` to use a different Chromium executable. Set `DEMO_URL` to test a different complete demo URL. Screenshots and results are written to the ignored `artifacts` directory. The building test also refreshes the downloadable GLB models.

## Publish

GitHub Pages uses the GitHub Actions workflow in `.github/workflows/pages.yml`. Pull requests targeting `development` verify the production build. Merging into `development` builds and publishes the website automatically.

## Modeling and licenses

All building dimensions and apartment layouts are illustrative. Reusable models are in `public/models/`. Font and Three.js license notices are retained in `public/licenses/` and `src/fonts/`.
