// Tesseract is tuned for ~300 DPI scans; 1x screenshots have glyphs too small
// for reliable recognition (Vietnamese diacritics especially), so upscale them.
const MIN_HEIGHT_PX = 1000
const UPSCALE_FACTOR = 2

export function preprocess(image: HTMLImageElement): HTMLCanvasElement {
  const scale = image.naturalHeight < MIN_HEIGHT_PX ? UPSCALE_FACTOR : 1
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth * scale
  canvas.height = image.naturalHeight * scale

  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D context is not available')

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas
}
