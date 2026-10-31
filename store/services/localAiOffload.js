import { backendApi } from '../../backend/api.js'
import * as log from '../../log.js'
import { LOCAL_AI_ERROR } from './localAiCatalog.js'
import { getVaultHistory, resolveVaultAnswer, VAULT_ASK_KIND } from './localAiVaultAsk.js'
import { WORK_EVENT } from './localAiWorkProgress.js'

export const AI_OFFLOAD_KIND = Object.freeze({
  VAULT_ANSWER: 'vault-answer',
  VAULT_ASK: 'vault-ask',
  ASK_NOTE: 'ask-note',
  NOTE_TASK: 'note-task'
})

const REPLY_INTERVAL_MS = 100
const JOBS_RETRY_MS = 2000
const SERVE_CHECK_MS = 60000

let useMac = false

/** Set from the phone's "Use my Mac when it's online" switch. */
export const setAiOffloadUseMac = (enabled) => {
  useMac = !!enabled
}

export const isAiOffloadEnabled = () => useMac

const offloadError = (code, started) =>
  Object.assign(new Error(`ai offload ${code}`), { code, started: !!started })

let runCounter = 0
const activeRuns = new Set()
const cancelledRuns = new Set()

/** Called with the app's own cancel, so a job on the desktop stops too. */
export function cancelAiOffloadRuns() {
  for (const runId of activeRuns) {
    cancelledRuns.add(runId)
    backendApi.aiOffloadCancel({ runId })
  }
}

export async function runOnLinkedDesktop({ kind, payload, onText = () => {} }) {
  runCounter += 1
  const runId = `${Date.now()}-${runCounter}`
  const stream = backendApi.aiOffloadRun({ runId, kind, payload })
  activeRuns.add(runId)
  let text = ''
  let started = false
  try {
    for await (const message of stream) {
      if (message.error) {
        const code = cancelledRuns.has(runId) ? 'cancelled' : message.error
        throw Object.assign(offloadError(code, started || message.started), { text })
      }
      if (typeof message.text === 'string') text = message.text
      if (message.done) {
        let data = null
        try {
          data = message.data ? JSON.parse(message.data) : null
        } catch (error) {
          log.debug('[ai-offload] bad reply data', error?.message)
        }
        return { text, data }
      }
      if (typeof message.text === 'string') {
        started = true
        onText(text)
      }
    }
    const code = cancelledRuns.has(runId) ? 'cancelled' : 'offline'
    throw Object.assign(offloadError(code, started), { text })
  } finally {
    activeRuns.delete(runId)
    cancelledRuns.delete(runId)
  }
}

/**
 * Phone side: an Ask job goes to a linked desktop when the switch is on and
 * one is serving; anything that fails before text arrives runs here instead.
 */
export async function withAiOffload({ kind, payload, onProgress, local, localFirst = false }) {
  if (!useMac) return local()
  if (localFirst) {
    // Writing tools stay on this device; the desktop only stands in when there is no model here.
    try {
      return await local()
    } catch (error) {
      if (error?.code !== LOCAL_AI_ERROR.MODEL_MISSING) throw error
    }
  }
  try {
    const { text } = await runOnLinkedDesktop({
      kind,
      payload,
      onText: (partial) => onProgress?.({ type: WORK_EVENT.TEXT, text: partial })
    })
    return text
  } catch (error) {
    if (error?.code === 'cancelled') return error.text ?? ''
    if (!error?.started && !localFirst) return local()
    if (!error?.started) {
      throw Object.assign(new Error(error?.message), { code: LOCAL_AI_ERROR.MODEL_MISSING })
    }
    log.warn('[ai-offload] the desktop stopped mid-answer', error?.code)
    throw Object.assign(new Error(error.message), { code: LOCAL_AI_ERROR.TASK_FAILED })
  }
}

/**
 * The whole vault Ask on a linked desktop: it finds the sources in its own
 * index and answers. Returns the raw answer and the sources for this device
 * to check the citations against.
 */
export async function askVaultOnLinkedDesktop({ question, turns, folderKey, onProgress }) {
  const { text, data } = await runOnLinkedDesktop({
    kind: AI_OFFLOAD_KIND.VAULT_ASK,
    payload: folderKey ? { question, turns, folderKey } : { question, turns },
    onText: (partial) => onProgress?.({ type: WORK_EVENT.TEXT, text: partial })
  })
  return {
    raw: text,
    sources: Array.isArray(data?.sources) ? data.sources : [],
    toolNumbers: Array.isArray(data?.toolNumbers) ? data.toolNumbers.map(String) : []
  }
}

/** Ask your vault through a linked desktop, with the answer checked here like a local one. */
export async function askYourVaultViaDesktop({ question, turns = [], folderKey, onProgress }) {
  const history = getVaultHistory(turns)
  const { raw, sources, toolNumbers } = await askVaultOnLinkedDesktop({
    question,
    turns: history,
    folderKey,
    onProgress
  })
  if (!sources.length) {
    return { kind: VAULT_ASK_KIND.NOT_FOUND, answer: '', citations: [], verified: true, sources }
  }
  return { ...resolveVaultAnswer(raw, sources, { question, toolNumbers }), sources }
}

const answerText = (answered) =>
  typeof answered === 'string' ? answered : String(answered?.text ?? '')

const asString = (value) => (typeof value === 'string' ? value : '')
const asArray = (value) => (Array.isArray(value) ? value : [])

/** The desktop's own task functions, called with what a phone may send. */
export function createAiOffloadRunner({
  askVault,
  askAboutNote,
  runNoteTask,
  retrieveVaultSources,
  getFeatureConfig
}) {
  return ({ kind, payload, onProgress, signal }) => {
    const input = payload && typeof payload === 'object' ? payload : {}
    const config = getFeatureConfig() ?? {}
    const options = { onProgress, signal }
    if (kind === AI_OFFLOAD_KIND.VAULT_ANSWER) {
      return askVault(
        asString(input.question),
        asArray(input.sources),
        asArray(input.turns),
        config,
        options
      ).then(answerText)
    }
    if (kind === AI_OFFLOAD_KIND.VAULT_ASK && retrieveVaultSources) {
      return (async () => {
        const question = asString(input.question)
        const turns = asArray(input.turns)
        const sources = await retrieveVaultSources(question, turns, asString(input.folderKey))
        if (!sources.length || signal?.aborted) return { text: '', data: { sources: [] } }
        const answered = await askVault(question, sources, turns, config, options)
        const toolNumbers = Array.isArray(answered?.toolNumbers) ? answered.toolNumbers : []
        return {
          text: answerText(answered),
          data: toolNumbers.length ? { sources, toolNumbers } : { sources }
        }
      })()
    }
    if (kind === AI_OFFLOAD_KIND.ASK_NOTE) {
      return askAboutNote(
        asString(input.note),
        asArray(input.turns),
        asString(input.question),
        config,
        options
      )
    }
    if (kind === AI_OFFLOAD_KIND.NOTE_TASK) {
      return runNoteTask(asString(input.task), asString(input.text), config, {
        ...options,
        styleSamples: asArray(input.styleSamples)
          .filter((sample) => typeof sample === 'string')
          .slice(0, 6)
      })
    }
    return Promise.reject(Object.assign(new Error('unsupported'), { offloadCode: 'unsupported' }))
  }
}

/**
 * Desktop side: while `canServe()` returns null the backend tells linked
 * phones this device answers, and jobs run one at a time through `runJob`.
 * `canServe()` returns an error code ('not-serving', 'on-battery') otherwise.
 */
export function serveAiOffload({ runJob, canServe, onActivity = () => {} }) {
  let stopped = false
  let stream = null
  let retryTimer = null
  let running = null
  const queue = []

  const report = async () => {
    if (stopped) return
    const reason = await Promise.resolve()
      .then(canServe)
      .catch(() => 'not-serving')
    await backendApi.aiOffloadServe({ serving: !reason }).catch(() => {})
  }
  const checkTimer = setInterval(report, SERVE_CHECK_MS)

  const reply = (jobId, fields) => backendApi.aiOffloadReply({ jobId, ...fields })

  async function runNext() {
    if (running || stopped) return
    const job = queue.shift()
    if (!job) return
    running = job
    let latest = null
    let flushTimer = null
    const flush = () => {
      flushTimer = null
      if (latest !== null && !job.cancelled) reply(job.jobId, { text: latest })
    }
    try {
      const reason = await Promise.resolve()
        .then(canServe)
        .catch(() => 'not-serving')
      if (reason) {
        reply(job.jobId, { error: reason })
        report()
        return
      }
      job.started = true
      onActivity({ active: true, activeDevice: job.deviceTitle })
      const result = await runJob({
        kind: job.kind,
        payload: job.payload,
        signal: job.controller.signal,
        onProgress: (event) => {
          if (event?.type !== WORK_EVENT.TEXT || typeof event.text !== 'string') return
          latest = event.text
          flushTimer ??= setTimeout(flush, REPLY_INTERVAL_MS)
        }
      })
      clearTimeout(flushTimer)
      const text = typeof result === 'object' && result !== null ? result.text : result
      const data = typeof result === 'object' && result !== null ? result.data : undefined
      if (!job.cancelled) reply(job.jobId, { text: String(text ?? ''), done: true, data })
    } catch (error) {
      clearTimeout(flushTimer)
      if (!job.cancelled) reply(job.jobId, { error: error?.offloadCode ?? 'failed' })
    } finally {
      if (job.started && !stopped)
        onActivity({
          active: false,
          activeDevice: '',
          lastDevice: job.deviceTitle,
          lastAt: Date.now()
        })
      running = null
      runNext()
    }
  }

  function onMessage(message) {
    if (message.cancel) {
      const index = queue.findIndex((job) => job.jobId === message.jobId)
      if (index !== -1) queue.splice(index, 1)
      if (running?.jobId === message.jobId) {
        running.cancelled = true
        running.controller.abort()
      }
      return
    }
    let payload = null
    try {
      payload = JSON.parse(message.payload || 'null')
    } catch (error) {
      log.debug('[ai-offload] bad job payload', error?.message)
    }
    queue.push({
      jobId: message.jobId,
      kind: message.kind,
      payload,
      deviceTitle: typeof message.deviceTitle === 'string' ? message.deviceTitle : '',
      cancelled: false,
      controller: new AbortController()
    })
    runNext()
  }

  async function listen() {
    while (!stopped) {
      try {
        stream = backendApi.aiOffloadJobs()
        await report()
        for await (const message of stream) onMessage(message)
      } catch (error) {
        if (!stopped) log.debug('[ai-offload] jobs stream ended', error?.message)
      }
      stream = null
      if (stopped) return
      await new Promise((resolve) => {
        retryTimer = setTimeout(resolve, JOBS_RETRY_MS)
      })
    }
  }
  listen()

  return {
    refresh: report,
    stop() {
      stopped = true
      clearInterval(checkTimer)
      clearTimeout(retryTimer)
      try {
        stream?.destroy?.()
      } catch (error) {
        log.debug('[ai-offload] jobs stream close', error?.message)
      }
      backendApi.aiOffloadServe({ serving: false }).catch(() => {})
    }
  }
}
