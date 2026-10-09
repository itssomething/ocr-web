# Vietnamese OCR

A static web app that extracts Vietnamese text from scans and screenshots. OCR runs entirely in the browser with [Tesseract.js](https://github.com/naptha/tesseract.js) (WASM), so there is no backend and images are never uploaded.

## Usage

Drop images, click to pick several at once, or paste screenshots with ⌘/Ctrl+V. Each image becomes a row in the results table (thumbnail, file name, status, recognised text), and the file name and text cells each have their own **Copy** button. **Copy all** and **Download .txt** combine every result under a `=== file name ===` header.

Images are processed one at a time in a queue. Files added mid-batch join the queue. The first image downloads the Tesseract core and the Vietnamese model (`vie.traineddata`, a few MB) from jsDelivr. The browser caches them, and later images reuse the loaded worker.

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
- `src/main.ts`: file picker, drag-and-drop, paste, OCR queue and results table

## Deploying to GitHub Pages

1. Push this folder to a GitHub repository.
2. In the repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Every push to `main` runs `.github/workflows/deploy.yml`, which builds and publishes `dist/`.

`vite.config.ts` uses `base: './'`, so the site works under any `https://<user>.github.io/<repo>/` path without extra configuration.
