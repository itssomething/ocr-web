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
const status = byId<HTMLDivElement>('status')
const statusText = byId<HTMLSpanElement>('status-text')
const statusPercent = byId<HTMLSpanElement>('status-percent')
const progress = byId<HTMLProgressElement>('progress')
const resultsBody = byId<HTMLTableSectionElement>('results-body')
const resultCount = byId<HTMLSpanElement>('result-count')
const copyAllButton = byId<HTMLButtonElement>('copy-all-button')
const downloadButton = byId<HTMLButtonElement>('download-button')
const clearButton = byId<HTMLButtonElement>('clear-button')

// Human-readable labels for Tesseract's logger statuses.
const STATUS_LABELS: Record<string, string> = {
  'loading tesseract core': 'Loading OCR engine…',
  'initializing tesseract': 'Initialising OCR engine…',
  'loading language traineddata': 'Loading Vietnamese model…',
  'initializing api': 'Preparing…',
  'recognizing text': 'Recognising text…',
}

type JobState = 'queued' | 'running' | 'done' | 'failed'

interface Job {
  name: string
  previewUrl: string
  state: JobState
  text: string
  row: HTMLTableRowElement
  statusCell: HTMLTableCellElement
  textCell: HTMLTableCellElement
}

const jobs: Job[] = []
let processing = false
let pastedCount = 0

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

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not read this image'))
    image.src = url
  })
}

// The async Clipboard API can be blocked (permissions policy, embedded frames),
// so fall back to the legacy selection-based copy.
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.append(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    textarea.remove()
    return copied
  }
}

function bindCopy(button: HTMLButtonElement, getText: () => string): void {
  const label = button.textContent ?? 'Copy'
  button.addEventListener('click', async () => {
    button.textContent = (await copyText(getText())) ? 'Copied' : 'Copy failed'
    setTimeout(() => (button.textContent = label), 1500)
  })
}

function createCopyButton(getText: () => string): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'copy-button'
  button.textContent = 'Copy'
  bindCopy(button, getText)
  return button
}

// `label` mirrors the column header so cells can stack as labelled cards on narrow screens.
function createCell(row: HTMLTableRowElement, className: string, label: string): HTMLTableCellElement {
  const cell = row.insertCell()
  cell.className = className
  cell.dataset.label = label
  return cell
}

function createCopyableCell(row: HTMLTableRowElement, text: string, className: string, label: string): HTMLTableCellElement {
  const cell = createCell(row, className, label)
  const content = document.createElement('div')
  content.className = 'cell-content'
  const value = document.createElement('span')
  value.className = 'cell-value'
  value.textContent = text
  content.append(value, createCopyButton(() => value.textContent ?? ''))
  cell.append(content)
  return cell
}

function setCellText(cell: HTMLTableCellElement, text: string): void {
  const value = cell.querySelector<HTMLSpanElement>('.cell-value')
  if (value) value.textContent = text
}

function setJobState(job: Job, state: JobState, label: string): void {
  job.state = state
  job.row.dataset.state = state
  job.statusCell.textContent = label
}

function updateSummary(): void {
  const done = jobs.filter((job) => job.state === 'done' || job.state === 'failed').length
  resultCount.textContent = jobs.length ? `(${done}/${jobs.length})` : ''
  const hasText = jobs.some((job) => job.text)
  copyAllButton.disabled = downloadButton.disabled = !hasText
  clearButton.disabled = jobs.length === 0 || processing
}

function addJob(file: File): Job {
  const name = file.name && file.name !== 'image.png' ? file.name : `pasted-${++pastedCount}.png`
  const previewUrl = URL.createObjectURL(file)

  resultsBody.querySelector('.empty-row')?.remove()
  const row = resultsBody.insertRow()

  createCell(row, 'col-index', '#').textContent = String(jobs.length + 1)

  const imageCell = createCell(row, 'col-image', 'Image')
  const thumbnail = document.createElement('img')
  thumbnail.src = previewUrl
  thumbnail.alt = name
  thumbnail.loading = 'lazy'
  imageCell.append(thumbnail)

  createCopyableCell(row, name, 'col-file', 'File')
  const statusCell = createCell(row, 'col-status', 'Status')
  const textCell = createCopyableCell(row, '', 'col-text', 'Text')

  const job: Job = { name, previewUrl, state: 'queued', text: '', row, statusCell, textCell }
  setJobState(job, 'queued', 'Queued')
  jobs.push(job)
  return job
}

async function runJob(job: Job, position: number, total: number): Promise<void> {
  setJobState(job, 'running', 'Starting…')
  const prefix = total > 1 ? `[${position}/${total}] ` : ''
  try {
    const image = await loadImage(job.previewUrl)
    job.text = await recognize(preprocess(image), (tesseractStatus, value) => {
      const label = STATUS_LABELS[tesseractStatus] ?? tesseractStatus
      showStatus(`${prefix}${job.name}: ${label}`, value)
      if (tesseractStatus === 'recognizing text') job.statusCell.textContent = `${Math.round(value * 100)}%`
    })
    setCellText(job.textCell, job.text)
    setJobState(job, 'done', job.text ? 'Done' : 'No text found')
  } catch (error) {
    console.error(error)
    setJobState(job, 'failed', `Failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// Jobs run one at a time on the shared worker; files added mid-batch join the queue.
async function processQueue(): Promise<void> {
  if (processing) return
  processing = true
  updateSummary()
  dropZone.classList.add('busy')

  let job: Job | undefined
  while ((job = jobs.find((candidate) => candidate.state === 'queued'))) {
    await runJob(job, jobs.indexOf(job) + 1, jobs.length)
    updateSummary()
  }

  processing = false
  dropZone.classList.remove('busy')
  const failed = jobs.filter((candidate) => candidate.state === 'failed').length
  showStatus(failed ? `Done — ${failed} failed` : 'Done', 1)
  updateSummary()
}

function handleFiles(files: FileList | File[]): void {
  const images = Array.from(files).filter((file) => file.type.startsWith('image/'))
  if (images.length === 0) {
    showStatus('No image files found', 0)
    return
  }
  images.forEach(addJob)
  updateSummary()
  void processQueue()
}

function clearResults(): void {
  if (processing) return
  jobs.forEach((job) => URL.revokeObjectURL(job.previewUrl))
  jobs.length = 0
  resultsBody.innerHTML = '<tr class="empty-row"><td colspan="5">No images yet</td></tr>'
  status.hidden = true
  updateSummary()
}

function combinedText(): string {
  return jobs
    .filter((job) => job.text)
    .map((job) => `=== ${job.name} ===\n${job.text}`)
    .join('\n\n')
}

fileInput.addEventListener('change', () => {
  if (fileInput.files) handleFiles(fileInput.files)
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
  if (event.dataTransfer) handleFiles(event.dataTransfer.files)
})

document.addEventListener('paste', (event) => {
  const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'))
  if (files.length) {
    event.preventDefault()
    handleFiles(files)
  }
})

bindCopy(copyAllButton, combinedText)

downloadButton.addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([combinedText()], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'ocr.txt'
  link.click()
  URL.revokeObjectURL(url)
})

clearButton.addEventListener('click', clearResults)
