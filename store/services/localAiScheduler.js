import { canRunModels as defaultCanRunModels } from './localAiCatalog.js'

export const AI_JOB_PRIORITY = {
  USER: 0,
  ENRICHMENT: 1,
  INDEXING: 2
}

export const AI_JOB_ERROR = {
  CANCELLED: 'cancelled',
  MEMORY: 'memory',
  DESTROYED: 'destroyed'
}

const STOP_REASON = {
  PREEMPTED: 'preempted',
  PAUSED: 'paused',
  CANCELLED: 'cancelled'
}

export const AI_JOB_MAX_ATTEMPTS = 3
export const AI_JOB_RETRY_DELAY_MS = 30_000
export const AI_JOB_ABORT_GRACE_MS = 5_000

const jobError = (code, message = code) => Object.assign(new Error(message), { code })

// React Native's AbortController polyfill drops the abort reason.
function abortWith(controller, reason) {
  if (!('reason' in controller.signal)) {
    Object.defineProperty(controller.signal, 'reason', { value: reason, configurable: true })
  }
  controller.abort(reason)
}

const isBackground = (job) => job.priority > AI_JOB_PRIORITY.USER

/**
 * One queue for all AI work in the app, so two models are never loaded at
 * once. User jobs run whenever the app is not suspended. Background jobs
 * (enrichment, indexing) never compete with the user: in the foreground
 * they wait for idle, in the background they need charging, and nothing
 * may hold the scheduler. A job can also require charging outright. They
 * are aborted and requeued when a user job arrives or the conditions end, so
 * `run` must check `signal` often and keep its own resumable progress.
 *
 * @param {{ totalMemoryBytes?: number, canRunModels?: (names: string[], totalMemoryBytes: number) => boolean, maxAttempts?: number, retryDelayMs?: number, abortGraceMs?: number, now?: () => number, log?: (...args: any[]) => void }} [options]
 */
export function createAiJobScheduler({
  totalMemoryBytes = 0,
  canRunModels = defaultCanRunModels,
  maxAttempts = AI_JOB_MAX_ATTEMPTS,
  retryDelayMs = AI_JOB_RETRY_DELAY_MS,
  abortGraceMs = AI_JOB_ABORT_GRACE_MS,
  now = Date.now,
  log = () => {}
} = {}) {
  const queue = []
  const listeners = new Set()
  const holds = new Set()
  let conditions = { foreground: true, idle: false, charging: false, suspended: false }
  let memory = totalMemoryBytes
  let running = null
  let timer = null
  let destroyed = false
  let sequence = 0

  const allowed = (job) => {
    if (conditions.suspended) return false
    if (!isBackground(job)) return true
    if (holds.size > 0) return false
    if (job.requiresCharging && !conditions.charging) return false
    return conditions.foreground ? conditions.idle : conditions.charging
  }

  const describe = (job) => ({
    key: job.key,
    label: job.label,
    priority: job.priority,
    attempts: job.attempts,
    progress: job.progress
  })

  const snapshot = () => ({
    running: running ? describe(running.job) : null,
    queued: queue.map(describe),
    conditions: { ...conditions },
    held: holds.size > 0
  })

  const notify = () => {
    const state = snapshot()
    for (const listener of listeners) {
      try {
        listener(state)
      } catch (err) {
        log('listener failed', err)
      }
    }
  }

  const insert = (job, { front = false } = {}) => {
    let index = queue.findIndex((queued) =>
      front ? queued.priority >= job.priority : queued.priority > job.priority
    )
    if (index === -1) index = queue.length
    queue.splice(index, 0, job)
  }

  const scheduleWake = () => {
    clearTimeout(timer)
    timer = null
    const waiting = queue.filter((job) => job.notBefore > now() && allowed(job))
    if (waiting.length === 0) return
    const next = Math.min(...waiting.map((job) => job.notBefore))
    timer = setTimeout(pump, Math.max(0, next - now()))
  }

  const stop = (reason) => {
    if (!running || running.stopReason) return
    running.stopReason = reason
    abortWith(running.controller, jobError(reason))
    const current = running
    running.grace = setTimeout(() => {
      if (running !== current) return
      log('job ignored abort', current.job.key)
      finish(current, { stopped: true })
    }, abortGraceMs)
  }

  const finish = (current, outcome) => {
    if (running !== current) return
    clearTimeout(current.grace)
    running = null
    const { job } = current
    const reason = current.stopReason
    if (reason === STOP_REASON.PREEMPTED || reason === STOP_REASON.PAUSED) {
      insert(job, { front: true })
    } else if (reason === STOP_REASON.CANCELLED) {
      job.reject(jobError(AI_JOB_ERROR.CANCELLED))
    } else if (outcome.error) {
      job.attempts += 1
      if (isBackground(job) && job.attempts < maxAttempts && !destroyed) {
        log('job failed, retrying', job.key, outcome.error)
        job.notBefore = now() + retryDelayMs * 2 ** (job.attempts - 1)
        insert(job)
      } else job.reject(outcome.error)
    } else job.resolve(outcome.value)
    notify()
    pump()
  }

  const start = (job) => {
    const controller = new AbortController()
    const current = { job, controller, stopReason: null, grace: null }
    running = current
    const progress = (done, total) => {
      if (running !== current) return
      job.progress = { done, total }
      notify()
    }
    notify()
    Promise.resolve()
      .then(() => job.run({ signal: controller.signal, progress }))
      .then(
        (value) => finish(current, { value }),
        (error) => finish(current, { error })
      )
  }

  function pump() {
    if (destroyed) return
    if (running) {
      if (!allowed(running.job)) stop(STOP_REASON.PAUSED)
      else {
        const urgent = queue.find((job) => job.priority < running.job.priority && allowed(job))
        if (urgent && isBackground(running.job)) stop(STOP_REASON.PREEMPTED)
      }
      return
    }
    const index = queue.findIndex((job) => allowed(job) && job.notBefore <= now())
    if (index === -1) return scheduleWake()
    const [job] = queue.splice(index, 1)
    if (!canRunModels(job.models, memory)) {
      job.reject(jobError(AI_JOB_ERROR.MEMORY, `not enough memory for ${job.key}`))
      notify()
      return pump()
    }
    start(job)
    scheduleWake()
  }

  /**
   * Queues a job. A job whose key is already queued (not running) is
   * replaced by the newer spec and shares its promise.
   *
   * @param {{ key: string, priority?: number, label?: string, models?: string[], requiresCharging?: boolean, run: (ctx: { signal: AbortSignal, progress: (done: number, total: number) => void }) => Promise<any> }} spec
   */
  function enqueue({
    key,
    priority = AI_JOB_PRIORITY.USER,
    label = key,
    models = [],
    requiresCharging = false,
    run
  }) {
    if (destroyed) return Promise.reject(jobError(AI_JOB_ERROR.DESTROYED))
    const queued = queue.find((job) => job.key === key)
    if (queued) {
      Object.assign(queued, { priority, label, models, requiresCharging, run })
      queue.splice(queue.indexOf(queued), 1)
      insert(queued)
      pump()
      return queued.promise
    }
    const job = { id: ++sequence, key, priority, label, models, requiresCharging, run, attempts: 0 }
    job.notBefore = 0
    job.progress = null
    job.promise = new Promise((resolve, reject) => {
      job.resolve = resolve
      job.reject = reject
    })
    job.promise.catch(() => {})
    insert(job)
    notify()
    pump()
    return job.promise
  }

  function cancel(key) {
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].key !== key) continue
      queue.splice(i, 1)[0].reject(jobError(AI_JOB_ERROR.CANCELLED))
    }
    if (running?.job.key === key) stop(STOP_REASON.CANCELLED)
    notify()
  }

  function setConditions(next) {
    conditions = { ...conditions, ...next }
    notify()
    pump()
  }

  /** Keeps background jobs off while a user-facing AI action runs outside the queue. */
  function hold() {
    const token = Symbol('hold')
    holds.add(token)
    notify()
    pump()
    return () => {
      if (!holds.delete(token)) return
      notify()
      pump()
    }
  }

  /** Pauses everything and resolves once nothing runs, or after `timeoutMs`. */
  async function suspend(timeoutMs = abortGraceMs) {
    setConditions({ suspended: true })
    if (!running) return true
    const current = running
    return new Promise((resolve) => {
      const deadline = setTimeout(() => {
        unsubscribe()
        resolve(false)
      }, timeoutMs)
      const unsubscribe = subscribe(() => {
        if (running === current) return
        clearTimeout(deadline)
        unsubscribe()
        resolve(true)
      })
    })
  }

  function subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function destroy() {
    destroyed = true
    clearTimeout(timer)
    for (const job of queue.splice(0)) job.reject(jobError(AI_JOB_ERROR.DESTROYED))
    if (running) stop(STOP_REASON.CANCELLED)
    listeners.clear()
  }

  return {
    enqueue,
    cancel,
    setConditions,
    setTotalMemory: (bytes) => {
      memory = bytes
      pump()
    },
    hold,
    suspend,
    resume: () => setConditions({ suspended: false }),
    subscribe,
    snapshot,
    destroy
  }
}
