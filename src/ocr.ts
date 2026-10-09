import { createWorker, type LoggerMessage, type Worker } from 'tesseract.js'

const LANGUAGE = 'vie'

export type ProgressHandler = (status: string, progress: number) => void

let workerPromise: Promise<Worker> | null = null
let onProgress: ProgressHandler | null = null

// The worker (WASM core + language model) is created once and reused, so the
// model is only downloaded and initialised on the first recognition.
function getWorker(): Promise<Worker> {
  workerPromise ??= createWorker(LANGUAGE, undefined, {
    logger: (message: LoggerMessage) => onProgress?.(message.status, message.progress),
  }).catch((error: unknown) => {
    workerPromise = null
    throw error
  })
  return workerPromise
}

export async function recognize(image: HTMLCanvasElement, handler: ProgressHandler): Promise<string> {
  onProgress = handler
  try {
    const worker = await getWorker()
    const { data } = await worker.recognize(image)
    return data.text.trim()
  } finally {
    onProgress = null
  }
}
