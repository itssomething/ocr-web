import './style.css'
import { recognize } from './ocr.ts'
import { preprocess } from './preprocess.ts'

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing element #${id}`)
  return element as T
}

const dropZone = byId<HTMLLabelElement>('drop-zone')
const fileInput = byId<HTMLInputElement>('file-input')
const preview = byId<HTMLImageElement>('preview')
const dropHint = byId<HTMLSpanElement>('drop-hint')
const status = byId<HTMLDivElement>('status')
const statusText = byId<HTMLSpanElement>('status-text')
const statusPercent = byId<HTMLSpanElement>('status-percent')
const progress = byId<HTMLProgressElement>('progress')
const output = byId<HTMLTextAreaElement>('output')
const copyButton = byId<HTMLButtonElement>('copy-button')
const downloadButton = byId<HTMLButtonElement>('download-button')

// Human-readable labels for Tesseract's logger statuses.
const STATUS_LABELS: Record<string, string> = {
  'loading tesseract core': 'Loading OCR engine…',
  'initializing tesseract': 'Initialising OCR engine…',
  'loading language traineddata': 'Loading Vietnamese model…',
  'initializing api': 'Preparing…',
  'recognizing text': 'Recognising text…',
}

let busy = false
let previewUrl: string | null = null

function showStatus(text: string, value?: number): void {
  status.hidden = false
  statusText.textContent = text
  if (value === undefined) {
    progress.removeAttribute('value')
    statusPercent.textContent = ''
  } else {
    progress.value = value
    statusPercent.textContent = `${Math.round(value * 100)}%`
  }
}

function setResult(text: string): void {
  output.value = text
  copyButton.disabled = downloadButton.disabled = text.length === 0
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not read this image'))
    image.src = url
  })
}

async function handleFile(file: File): Promise<void> {
  if (busy) return
  if (!file.type.startsWith('image/')) {
    showStatus(`Unsupported file type: ${file.type || 'unknown'}`, 0)
    return
  }

  busy = true
  dropZone.classList.add('busy')
  if (previewUrl) URL.revokeObjectURL(previewUrl)
  previewUrl = URL.createObjectURL(file)
  preview.src = previewUrl
  preview.hidden = false
  dropHint.hidden = true
  setResult('')
  showStatus('Starting…')

  try {
    const image = await loadImage(previewUrl)
    const text = await recognize(preprocess(image), (tesseractStatus, value) => {
      showStatus(STATUS_LABELS[tesseractStatus] ?? tesseractStatus, value)
    })
    setResult(text)
    showStatus(text ? 'Done' : 'Done — no text found', 1)
  } catch (error) {
    console.error(error)
    showStatus(`Failed: ${error instanceof Error ? error.message : String(error)}`, 0)
  } finally {
    busy = false
    dropZone.classList.remove('busy')
  }
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) void handleFile(file)
  fileInput.value = ''
})

dropZone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    fileInput.click()
  }
})

dropZone.addEventListener('dragover', (event) => {
  event.preventDefault()
  dropZone.classList.add('dragging')
})
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'))
dropZone.addEventListener('drop', (event) => {
  event.preventDefault()
  dropZone.classList.remove('dragging')
  const file = event.dataTransfer?.files[0]
  if (file) void handleFile(file)
})

document.addEventListener('paste', (event) => {
  const file = Array.from(event.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'))
  if (file) {
    event.preventDefault()
    void handleFile(file)
  }
})

copyButton.addEventListener('click', async () => {
  await navigator.clipboard.writeText(output.value)
  copyButton.textContent = 'Copied'
  setTimeout(() => (copyButton.textContent = 'Copy'), 1500)
})

downloadButton.addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([output.value], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'ocr.txt'
  link.click()
  URL.revokeObjectURL(url)
})

output.addEventListener('input', () => {
  copyButton.disabled = downloadButton.disabled = output.value.length === 0
})
