import { SUMMARY_MAX_TRANSCRIPT_CHARS } from './localAiPrompts.js'

export const WORK_KIND = Object.freeze({
  REWRITE: 'rewrite',
  NOTE_TASK: 'noteTask',
  TRANSCRIBE: 'transcribe',
  EXTRACT_IMAGE: 'extractImage',
  EXTRACT_PDF: 'extractPdf',
  TRANSLATE: 'translate',
  DESCRIBE: 'describe'
})

export const WORK_STEP = Object.freeze({
  PREPARE_AUDIO: 'prepareAudio',
  PREPARE_PHOTO: 'preparePhoto',
  LOAD_MODEL: 'loadModel',
  READ_NOTE: 'readNote',
  WRITE: 'write',
  TRANSCRIBE: 'transcribe',
  READ_TEXT: 'readText',
  READ_PAGES: 'readPages',
  TRANSLATE: 'translate',
  LOOK: 'look'
})

export const WORK_EVENT = Object.freeze({
  STEP: 'step',
  TEXT: 'text',
  POSITION: 'position',
  PAGE: 'page',
  PARAGRAPHS: 'paragraphs'
})

export const WORK_STEP_STATUS = Object.freeze({
  DONE: 'done',
  ACTIVE: 'active',
  PENDING: 'pending'
})

export const WORK_ELAPSED_AFTER_MS = 10000
export const WORK_PREVIEW_MAX_CHARS = 280
export const WORK_SHORTER_TARGET_RATIO = 0.6

const MAX_FRACTION = 0.97
const PREVIEW_ELLIPSIS = '…'

const STEPS_BY_KIND = {
  [WORK_KIND.REWRITE]: [WORK_STEP.LOAD_MODEL, WORK_STEP.READ_NOTE, WORK_STEP.WRITE],
  [WORK_KIND.NOTE_TASK]: [WORK_STEP.LOAD_MODEL, WORK_STEP.READ_NOTE, WORK_STEP.WRITE],
  [WORK_KIND.TRANSCRIBE]: [WORK_STEP.PREPARE_AUDIO, WORK_STEP.LOAD_MODEL, WORK_STEP.TRANSCRIBE],
  [WORK_KIND.EXTRACT_IMAGE]: [WORK_STEP.PREPARE_PHOTO, WORK_STEP.LOAD_MODEL, WORK_STEP.READ_TEXT],
  [WORK_KIND.EXTRACT_PDF]: [WORK_STEP.LOAD_MODEL, WORK_STEP.READ_PAGES],
  [WORK_KIND.TRANSLATE]: [WORK_STEP.LOAD_MODEL, WORK_STEP.TRANSLATE],
  [WORK_KIND.DESCRIBE]: [WORK_STEP.PREPARE_PHOTO, WORK_STEP.LOAD_MODEL, WORK_STEP.LOOK]
}

const LLM_KINDS = new Set([WORK_KIND.REWRITE, WORK_KIND.NOTE_TASK, WORK_KIND.DESCRIBE])

const THINK_BLOCK = /<think>[\s\S]*?<\/think>/gi
const OPEN_THINK = /<think>[\s\S]*$/i
const THINK_TAG = /<\/?think>/gi
const LEADING_LABEL = /^\s*(?:summary|title)\s*:\s*/i

export const countWords = (text) =>
  String(text ?? '')
    .split(/\s+/)
    .filter(Boolean).length

export function cleanPartialOutput(text) {
  return String(text ?? '')
    .replace(THINK_BLOCK, '')
    .replace(OPEN_THINK, '')
    .replace(THINK_TAG, '')
    .replace(LEADING_LABEL, '')
    .trim()
}

export function createWorkProgress(
  kind,
  { input = '', targetRatio = 1, startedAt = Date.now() } = {}
) {
  const text = String(input ?? '')
  const inputWords = countWords(text)
  return {
    kind,
    steps: STEPS_BY_KIND[kind] ?? [],
    activeIndex: -1,
    model: null,
    startedAt,
    inputWords,
    inputTruncated: text.length > SUMMARY_MAX_TRANSCRIPT_CHARS,
    targetWords: Math.max(1, Math.round(inputWords * targetRatio)),
    preview: '',
    writtenWords: 0,
    position: null,
    page: null,
    paragraphs: null
  }
}

function activateStep(progress, step) {
  const index = progress.steps.indexOf(step)
  if (index <= progress.activeIndex) return progress.activeIndex
  return index
}

export function reduceWorkProgress(progress, event) {
  if (!progress || !event) return progress
  switch (event.type) {
    case WORK_EVENT.STEP:
      return {
        ...progress,
        activeIndex: activateStep(progress, event.step),
        model: event.model ?? progress.model
      }
    case WORK_EVENT.TEXT: {
      const preview = LLM_KINDS.has(progress.kind)
        ? cleanPartialOutput(event.text)
        : String(event.text ?? '').trim()
      return {
        ...progress,
        activeIndex: Math.max(progress.activeIndex, progress.steps.length - 1),
        preview,
        writtenWords: countWords(preview)
      }
    }
    case WORK_EVENT.POSITION:
      return { ...progress, position: { doneMs: event.doneMs, totalMs: event.totalMs } }
    case WORK_EVENT.PAGE:
      return {
        ...progress,
        activeIndex: activateStep(progress, WORK_STEP.READ_PAGES),
        page: {
          page: event.page,
          total: event.total,
          done: event.done ?? event.page - 1,
          words: event.words ?? 0
        }
      }
    case WORK_EVENT.PARAGRAPHS:
      return {
        ...progress,
        paragraphs: {
          done: event.done,
          total: event.total,
          hop: event.hop ?? 1,
          hops: event.hops ?? 1,
          from: event.from ?? null,
          to: event.to ?? null
        }
      }
    default:
      return progress
  }
}

export function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

function stepLabel(progress, step, status) {
  if (step === WORK_STEP.LOAD_MODEL) {
    if (!progress.model) return { key: 'loadModel', params: {} }
    return {
      key: status === WORK_STEP_STATUS.DONE ? 'modelReady' : 'loadModelNamed',
      params: { model: progress.model }
    }
  }
  if (step === WORK_STEP.READ_NOTE) {
    return progress.inputTruncated
      ? { key: 'readNoteLong', params: { characters: SUMMARY_MAX_TRANSCRIPT_CHARS } }
      : { key: 'readNote', params: { count: progress.inputWords } }
  }
  return { key: step, params: {} }
}

function activeDetail(progress, step) {
  if (step === WORK_STEP.WRITE) {
    if (progress.kind === WORK_KIND.REWRITE) {
      if (progress.writtenWords === 0) return null
      return progress.writtenWords >= progress.targetWords
        ? { key: 'almostDone', params: {} }
        : {
            key: 'wordsOfAbout',
            params: { written: progress.writtenWords, target: progress.targetWords }
          }
    }
    return progress.writtenWords > 0
      ? { key: 'wordsWritten', params: { count: progress.writtenWords } }
      : null
  }
  if (step === WORK_STEP.TRANSCRIBE && progress.position?.totalMs > 0) {
    return {
      key: 'position',
      params: {
        done: formatClock(Math.min(progress.position.doneMs, progress.position.totalMs)),
        total: formatClock(progress.position.totalMs)
      }
    }
  }
  if (step === WORK_STEP.READ_TEXT) {
    return progress.writtenWords > 0
      ? { key: 'wordsFound', params: { count: progress.writtenWords } }
      : null
  }
  if (step === WORK_STEP.READ_PAGES && progress.page) {
    return {
      key: 'page',
      params: { page: progress.page.page, total: progress.page.total, count: progress.page.words }
    }
  }
  if (step === WORK_STEP.TRANSLATE && progress.paragraphs) {
    const { done, total, hops, from, to } = progress.paragraphs
    return hops > 1 && from && to
      ? { key: 'paragraphHop', params: { done, total, from, to } }
      : { key: 'paragraph', params: { done, total } }
  }
  return null
}

function activeFraction(progress, step) {
  const clamp = (value) => Math.min(MAX_FRACTION, Math.max(0, value))
  if (
    step === WORK_STEP.WRITE &&
    progress.kind === WORK_KIND.REWRITE &&
    progress.writtenWords > 0
  ) {
    return clamp(progress.writtenWords / progress.targetWords)
  }
  if (step === WORK_STEP.TRANSCRIBE && progress.position?.totalMs > 0) {
    return clamp(progress.position.doneMs / progress.position.totalMs)
  }
  if (step === WORK_STEP.READ_PAGES && progress.page?.total > 0) {
    return clamp(progress.page.done / progress.page.total)
  }
  if (step === WORK_STEP.TRANSLATE && progress.paragraphs?.total > 0) {
    const { done, total, hop, hops } = progress.paragraphs
    return clamp((hop - 1 + done / total) / Math.max(hops, 1))
  }
  return null
}

function previewTail(preview) {
  if (preview.length <= WORK_PREVIEW_MAX_CHARS) return preview
  const tail = preview.slice(-WORK_PREVIEW_MAX_CHARS)
  const firstSpace = tail.indexOf(' ')
  return `${PREVIEW_ELLIPSIS}${firstSpace > 0 ? tail.slice(firstSpace + 1) : tail}`
}

export function getWorkProgressView(progress, now = Date.now()) {
  if (!progress) return null
  const activeIndex = Math.max(progress.activeIndex, 0)
  const activeStep = progress.steps[activeIndex] ?? null
  const steps = progress.steps.map((step, index) => {
    const status =
      index < activeIndex
        ? WORK_STEP_STATUS.DONE
        : index === activeIndex
          ? WORK_STEP_STATUS.ACTIVE
          : WORK_STEP_STATUS.PENDING
    return { id: step, status, label: stepLabel(progress, step, status) }
  })
  const elapsedMs = now - progress.startedAt
  return {
    steps,
    fraction: activeStep ? activeFraction(progress, activeStep) : null,
    detail: activeStep ? activeDetail(progress, activeStep) : null,
    elapsedSeconds: elapsedMs >= WORK_ELAPSED_AFTER_MS ? Math.floor(elapsedMs / 1000) : null,
    preview: previewTail(progress.preview)
  }
}
