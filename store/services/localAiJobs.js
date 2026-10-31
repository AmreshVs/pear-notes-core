import * as log from '../../log.js'
import { AI_JOB_PRIORITY, createAiJobScheduler } from './localAiScheduler.js'

export const AI_JOBS_IDLE_MS = 20_000
export const AI_SCHEDULER_PROBE_KEY = 'scheduler-probe'
export const AI_SCHEDULER_PROBE_STEPS = 120
const PROBE_STEP_MS = 1000

let scheduler = null

/** Resolves after `ms`, or as soon as `signal` aborts. */
export const abortableDelay = (ms, signal) =>
  new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal?.addEventListener('abort', done, { once: true })
  })

export function getAiJobScheduler() {
  if (!scheduler) {
    scheduler = createAiJobScheduler({ log: (...args) => log.warn('[ai-jobs]', ...args) })
  }
  return scheduler
}

/** Keeps background AI jobs off until the returned release is called. */
export const holdAiJobs = () => getAiJobScheduler().hold()

export async function withAiJobHold(work) {
  const release = holdAiJobs()
  try {
    return await work()
  } finally {
    release()
  }
}

/**
 * A model-free background job for the M0 exit test: it steps once a second,
 * stops at every abort and resumes from its own progress, logging each turn.
 */
export function enqueueSchedulerProbe({ steps = AI_SCHEDULER_PROBE_STEPS } = {}) {
  let done = 0
  let runs = 0
  return getAiJobScheduler().enqueue({
    key: AI_SCHEDULER_PROBE_KEY,
    label: 'Scheduler probe',
    priority: AI_JOB_PRIORITY.INDEXING,
    run: async ({ signal, progress }) => {
      runs += 1
      log.info(`[ai-jobs] probe run ${runs} from step ${done}/${steps}`)
      while (done < steps) {
        if (signal.aborted) {
          log.info(`[ai-jobs] probe stopped at ${done}/${steps}: ${signal.reason?.code}`)
          throw signal.reason
        }
        await abortableDelay(PROBE_STEP_MS, signal)
        if (signal.aborted) continue
        done += 1
        progress(done, steps)
      }
      log.info(`[ai-jobs] probe finished after ${runs} runs`)
      return { runs, steps }
    }
  })
}

export function resetAiJobSchedulerForTests() {
  scheduler?.destroy()
  scheduler = null
}
