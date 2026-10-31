import test from 'brittle'

import {
  cleanPartialOutput,
  createWorkProgress,
  formatClock,
  getWorkProgressView,
  reduceWorkProgress,
  WORK_EVENT,
  WORK_KIND,
  WORK_STEP,
  WORK_STEP_STATUS
} from '../store/services/localAiWorkProgress.js'

const { DONE, ACTIVE, PENDING } = WORK_STEP_STATUS

const apply = (progress, ...events) => events.reduce(reduceWorkProgress, progress)

test('rewrite steps advance and report words against the selection', (t) => {
  const start = createWorkProgress(WORK_KIND.REWRITE, { input: 'one two three four', startedAt: 0 })
  let view = getWorkProgressView(start, 0)
  t.alike(
    view.steps.map((step) => step.status),
    [ACTIVE, PENDING, PENDING]
  )
  t.is(view.fraction, null)

  const loading = apply(start, {
    type: WORK_EVENT.STEP,
    step: WORK_STEP.LOAD_MODEL,
    model: 'QWEN3_600M_INST_Q4'
  })
  t.is(getWorkProgressView(loading, 0).steps[0].label.key, 'loadModelNamed')

  const writing = apply(
    loading,
    { type: WORK_EVENT.STEP, step: WORK_STEP.READ_NOTE },
    { type: WORK_EVENT.TEXT, text: 'One two' }
  )
  view = getWorkProgressView(writing, 0)
  t.alike(
    view.steps.map((step) => step.status),
    [DONE, DONE, ACTIVE]
  )
  t.is(view.steps[0].label.key, 'modelReady')
  t.alike(view.steps[1].label, { key: 'readNote', params: { count: 4 } })
  t.alike(view.detail, { key: 'wordsOfAbout', params: { written: 2, target: 4 } })
  t.is(view.fraction, 0.5)
  t.is(view.preview, 'One two')

  const over = apply(writing, { type: WORK_EVENT.TEXT, text: 'One two three four five' })
  view = getWorkProgressView(over, 0)
  t.is(view.detail.key, 'almostDone')
  t.ok(view.fraction < 1)
})

test('steps never move backwards and unknown steps are ignored', (t) => {
  const progress = apply(
    createWorkProgress(WORK_KIND.EXTRACT_PDF, { startedAt: 0 }),
    { type: WORK_EVENT.STEP, step: WORK_STEP.READ_PAGES },
    { type: WORK_EVENT.STEP, step: WORK_STEP.LOAD_MODEL },
    { type: WORK_EVENT.STEP, step: WORK_STEP.READ_TEXT }
  )
  t.is(progress.activeIndex, 1)
})

test('transcription position and pdf pages drive the bar', (t) => {
  const transcribing = apply(
    createWorkProgress(WORK_KIND.TRANSCRIBE, { startedAt: 0 }),
    { type: WORK_EVENT.STEP, step: WORK_STEP.TRANSCRIBE },
    { type: WORK_EVENT.POSITION, doneMs: 130000, totalMs: 252000 }
  )
  const view = getWorkProgressView(transcribing, 0)
  t.alike(view.detail, { key: 'position', params: { done: '2:10', total: '4:12' } })
  t.ok(Math.abs(view.fraction - 130 / 252) < 0.001)

  const pages = apply(createWorkProgress(WORK_KIND.EXTRACT_PDF, { startedAt: 0 }), {
    type: WORK_EVENT.PAGE,
    page: 3,
    total: 6,
    done: 3,
    words: 212
  })
  const pageView = getWorkProgressView(pages, 0)
  t.alike(pageView.detail, { key: 'page', params: { page: 3, total: 6, count: 212 } })
  t.is(pageView.steps[1].status, ACTIVE)
  t.is(pageView.fraction, 0.5)
})

test('translation hops combine into one bar', (t) => {
  const progress = apply(
    createWorkProgress(WORK_KIND.TRANSLATE, { startedAt: 0 }),
    { type: WORK_EVENT.STEP, step: WORK_STEP.TRANSLATE },
    { type: WORK_EVENT.PARAGRAPHS, done: 5, total: 10, hop: 2, hops: 2, from: 'en', to: 'fr' }
  )
  const view = getWorkProgressView(progress, 0)
  t.is(view.fraction, 0.75)
  t.alike(view.detail, {
    key: 'paragraphHop',
    params: { done: 5, total: 10, from: 'en', to: 'fr' }
  })
})

test('elapsed time appears after ten seconds', (t) => {
  const progress = createWorkProgress(WORK_KIND.DESCRIBE, { startedAt: 0 })
  t.is(getWorkProgressView(progress, 9000).elapsedSeconds, null)
  t.is(getWorkProgressView(progress, 14500).elapsedSeconds, 14)
})

test('long notes say only the start is read', (t) => {
  const progress = createWorkProgress(WORK_KIND.NOTE_TASK, { input: 'word '.repeat(2000) })
  t.is(getWorkProgressView(progress).steps[1].label.key, 'readNoteLong')
})

test('partial output hides thinking and labels, and the preview keeps the tail', (t) => {
  t.is(cleanPartialOutput('<think>plan</think>Summary: Done'), 'Done')
  t.is(cleanPartialOutput('Start <think>still thinking'), 'Start')
  const long = apply(createWorkProgress(WORK_KIND.NOTE_TASK), {
    type: WORK_EVENT.TEXT,
    text: 'word '.repeat(200)
  })
  const preview = getWorkProgressView(long).preview
  t.ok(preview.startsWith('…'))
  t.ok(preview.length <= 281)
})

test('formatClock pads seconds', (t) => {
  t.is(formatClock(65000), '1:05')
  t.is(formatClock(-1), '0:00')
})

test('extracted text streams into the preview verbatim', (t) => {
  const image = apply(
    createWorkProgress(WORK_KIND.EXTRACT_IMAGE, { startedAt: 0 }),
    { type: WORK_EVENT.STEP, step: WORK_STEP.PREPARE_PHOTO },
    { type: WORK_EVENT.STEP, step: WORK_STEP.LOAD_MODEL, model: 'OCR_LATIN' },
    { type: WORK_EVENT.STEP, step: WORK_STEP.READ_TEXT },
    { type: WORK_EVENT.TEXT, text: 'Summary: two lines\nof scanned text' }
  )
  const view = getWorkProgressView(image, 0)
  t.is(view.preview, 'Summary: two lines\nof scanned text')
  t.alike(view.detail, { key: 'wordsFound', params: { count: 6 } })
  t.is(view.steps[2].status, ACTIVE)
})

test('pdf pages keep their page detail while the text streams', (t) => {
  const pdf = apply(
    createWorkProgress(WORK_KIND.EXTRACT_PDF, { startedAt: 0 }),
    { type: WORK_EVENT.PAGE, page: 2, total: 4, done: 1, words: 40 },
    { type: WORK_EVENT.TEXT, text: 'page one text\n\npage two so far' }
  )
  const view = getWorkProgressView(pdf, 0)
  t.is(view.preview, 'page one text\n\npage two so far')
  t.alike(view.detail, { key: 'page', params: { page: 2, total: 4, count: 40 } })
  t.is(view.fraction, 0.25)
})

test('translated paragraphs stream without losing the paragraph detail', (t) => {
  const translating = apply(
    createWorkProgress(WORK_KIND.TRANSLATE, { startedAt: 0 }),
    { type: WORK_EVENT.STEP, step: WORK_STEP.TRANSLATE },
    { type: WORK_EVENT.PARAGRAPHS, done: 8, total: 16, hop: 1, hops: 1 },
    { type: WORK_EVENT.TEXT, text: 'Bonjour <think> le monde' }
  )
  const view = getWorkProgressView(translating, 0)
  t.is(view.preview, 'Bonjour <think> le monde')
  t.alike(view.detail, { key: 'paragraph', params: { done: 8, total: 16 } })
  t.is(view.fraction, 0.5)
})
