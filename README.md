# Vietnamese OCR

A static web app that extracts Vietnamese text from scans and screenshots. OCR runs entirely in the browser with [Tesseract.js](https://github.com/naptha/tesseract.js) (WASM), so there is no backend and images are never uploaded.

## Usage

Drop an image, click to pick one, or paste a screenshot with ⌘/Ctrl+V. The recognised text appears in an editable box with **Copy** and **Download .txt** buttons.

The first run downloads the Tesseract core and the Vietnamese model (`vie.traineddata`, a few MB) from jsDelivr. The browser caches them, and later images in the same session reuse the loaded worker.

## Development

```bash
pnpm install
pnpm dev
```

- `pnpm build`: type-check and build to `dist/`
- `pnpm preview`: serve the production build locally

Source:

- `src/ocr.ts`: lazily created, reused Tesseract worker
- `src/preprocess.ts`: upscales small images (screenshots) 2x before OCR
- `src/main.ts`: file picker, drag-and-drop, paste, progress and output

## Deploying to GitHub Pages

1. Push this folder to a GitHub repository.
2. In the repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Every push to `main` runs `.github/workflows/deploy.yml`, which builds and publishes `dist/`.

`vite.config.ts` uses `base: './'`, so the site works under any `https://<user>.github.io/<repo>/` path without extra configuration.
