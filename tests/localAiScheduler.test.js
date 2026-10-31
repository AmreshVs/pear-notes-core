import test from 'brittle'

import {
  AI_JOB_ERROR,
  AI_JOB_PRIORITY,
  createAiJobScheduler
} from '../store/services/localAiScheduler.js'

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))

const IDLE = { foreground: true, idle: true }

function steppedJob(steps, order, name) {
  const state = { done: 0, runs: 0 }
  const run = async ({ signal, progress }) => {
    state.runs += 1
    while (state.done < steps) {
      if (signal.aborted) throw signal.reason
      await tick(2)
      state.done += 1
      progress(state.done, steps)
    }
    order?.push(name)
    return name
  }
  return { state, run }
}

test('user jobs run before background jobs, one at a time', async (t) => {
  const scheduler = createAiJobScheduler()
  scheduler.setConditions(IDLE)
  const order = []
  let active = 0
  let maxActive = 0
  const job = (name) => async () => {
    active += 1
    maxActive = Math.max(maxActive, active)
    await tick(2)
    active -= 1
    order.push(name)
  }
  scheduler.hold()()
  const release = scheduler.hold()
  const index = scheduler.enqueue({
    key: 'index',
    priority: AI_JOB_PRIORITY.INDEXING,
    run: job('index')
  })
  const enrich = scheduler.enqueue({
    key: 'enrich',
    priority: AI_JOB_PRIORITY.ENRICHMENT,
    run: job('enrich')
  })
  const ask = scheduler.enqueue({ key: 'ask', run: job('ask') })
  await ask
  release()
  await Promise.all([index, enrich])
  t.alike(order, ['ask', 'enrich', 'index'])
  t.is(maxActive, 1)
  scheduler.destroy()
})

test('background jobs wait for idle foreground or charging', async (t) => {
  const scheduler = createAiJobScheduler()
  let ran = false
  const done = scheduler.enqueue({
    key: 'index',
    priority: AI_JOB_PRIORITY.INDEXING,
    run: async () => {
      ran = true
    }
  })
  scheduler.setConditions({ foreground: true, idle: false })
  await tick(5)
  t.absent(ran, 'not while the user is active')
  scheduler.setConditions({ foreground: false, charging: true })
  await done
  t.ok(ran, 'runs in the background while charging')
  scheduler.destroy()
})

test('a user job preempts a background job, which resumes from its own progress', async (t) => {
  const scheduler = createAiJobScheduler()
  scheduler.setConditions(IDLE)
  const order = []
  const index = steppedJob(10, order, 'index')
  const indexDone = scheduler.enqueue({
    key: 'index',
    priority: AI_JOB_PRIORITY.INDEXING,
    run: index.run
  })
  await tick(8)
  t.ok(index.state.done > 0 && index.state.done < 10)
  await scheduler.enqueue({ key: 'ask', run: async () => order.push('ask') })
  t.is(await indexDone, 'index')
  t.alike(order, ['ask', 'index'])
  t.is(index.state.runs, 2, 'restarted once after preemption')
  t.is(index.state.done, 10)
  scheduler.destroy()
})

test('losing the conditions pauses a background job until they return', async (t) => {
  const scheduler = createAiJobScheduler()
  scheduler.setConditions(IDLE)
  const index = steppedJob(6)
  const done = scheduler.enqueue({
    key: 'index',
    priority: AI_JOB_PRIORITY.INDEXING,
    run: index.run
  })
  await tick(5)
  scheduler.setConditions({ idle: false })
  await tick(10)
  const paused = index.state.done
  t.ok(paused < 6)
  t.is(scheduler.snapshot().running, null)
  t.is(scheduler.snapshot().queued[0].key, 'index')
  await tick(10)
  t.is(index.state.done, paused, 'no work while paused')
  scheduler.setConditions({ idle: true })
  await done
  t.is(index.state.done, 6)
  scheduler.destroy()
})

test('suspend stops everything and resolves once nothing runs', async (t) => {
  const scheduler = createAiJobScheduler()
  scheduler.setConditions(IDLE)
  const index = steppedJob(50)
  const done = scheduler.enqueue({
    key: 'index',
    priority: AI_JOB_PRIORITY.INDEXING,
    run: index.run
  })
  let askRan = false
  await tick(5)
  t.ok(await scheduler.suspend(1000))
  scheduler.enqueue({ key: 'ask', run: async () => (askRan = true) })
  await tick(10)
  t.absent(askRan, 'not even user jobs while suspended')
  scheduler.resume()
  await done
  t.ok(askRan)
  scheduler.destroy()
})

test('cancel rejects queued and running jobs', async (t) => {
  const scheduler = createAiJobScheduler()
  scheduler.setConditions(IDLE)
  const running = scheduler.enqueue({ key: 'a', run: steppedJob(50).run })
  const queued = scheduler.enqueue({ key: 'b', run: async () => {} })
  await tick(3)
  scheduler.cancel('a')
  scheduler.cancel('b')
  await t.exception(running, /cancelled/)
  await t.exception(queued, /cancelled/)
  scheduler.destroy()
})

test('a job whose models do not fit is refused, not queued forever', async (t) => {
  const scheduler = createAiJobScheduler({ canRunModels: (models) => models.length === 0 })
  const refused = scheduler.enqueue({ key: 'big', models: ['HUGE'], run: async () => {} })
  const ok = scheduler.enqueue({ key: 'small', run: async () => 'ran' })
  try {
    await refused
    t.fail('should refuse')
  } catch (err) {
    t.is(err.code, AI_JOB_ERROR.MEMORY)
  }
  t.is(await ok, 'ran')
  scheduler.destroy()
})

test('failed background jobs retry with backoff, user jobs do not', async (t) => {
  const scheduler = createAiJobScheduler({ retryDelayMs: 5, maxAttempts: 3 })
  scheduler.setConditions(IDLE)
  let tries = 0
  const flaky = scheduler.enqueue({
    key: 'flaky',
    priority: AI_JOB_PRIORITY.ENRICHMENT,
    run: async () => {
      tries += 1
      if (tries < 3) throw new Error('boom')
      return 'ok'
    }
  })
  t.is(await flaky, 'ok')
  t.is(tries, 3)
  let userTries = 0
  const user = scheduler.enqueue({
    key: 'user',
    run: async () => {
      userTries += 1
      throw new Error('nope')
    }
  })
  await t.exception(user, /nope/)
  t.is(userTries, 1)
  scheduler.destroy()
})

test('a job that ignores abort cannot wedge the queue', async (t) => {
  const logs = []
  const scheduler = createAiJobScheduler({ abortGraceMs: 10, log: (...args) => logs.push(args[0]) })
  scheduler.setConditions(IDLE)
  scheduler.enqueue({
    key: 'stuck',
    priority: AI_JOB_PRIORITY.INDEXING,
    run: () => new Promise(() => {})
  })
  await tick(2)
  t.is(await scheduler.enqueue({ key: 'ask', run: async () => 'answered' }), 'answered')
  t.ok(logs.includes('job ignored abort'))
  scheduler.destroy()
})

test('re-enqueueing a queued key replaces it and shares the promise', async (t) => {
  const scheduler = createAiJobScheduler()
  const first = scheduler.enqueue({ key: 'index', priority: 2, run: async () => 'old' })
  const second = scheduler.enqueue({ key: 'index', priority: 2, run: async () => 'new' })
  t.is(first, second)
  t.is(scheduler.snapshot().queued.length, 1)
  scheduler.setConditions(IDLE)
  t.is(await first, 'new')
  scheduler.destroy()
})

test('progress reaches subscribers', async (t) => {
  const scheduler = createAiJobScheduler()
  scheduler.setConditions(IDLE)
  const seen = []
  scheduler.subscribe((state) => {
    if (state.running?.progress) seen.push(state.running.progress.done)
  })
  await scheduler.enqueue({ key: 'index', priority: 2, label: 'Indexing', run: steppedJob(3).run })
  t.alike(seen, [1, 2, 3])
  scheduler.destroy()
})

test('background jobs never compete with an active user, even while charging', async (t) => {
  const scheduler = createAiJobScheduler()
  let ran = false
  const done = scheduler.enqueue({
    key: 'index',
    priority: AI_JOB_PRIORITY.INDEXING,
    requiresCharging: true,
    run: async () => {
      ran = true
    }
  })
  scheduler.setConditions({ foreground: true, idle: false, charging: true })
  await tick(5)
  t.absent(ran, 'not while the user is active')
  scheduler.setConditions({ idle: true, charging: false })
  await tick(5)
  t.absent(ran, 'a charging-only job waits for power')
  scheduler.setConditions({ charging: true })
  await done
  t.ok(ran)
  scheduler.destroy()
})

test('jobs see the stop reason on platforms whose abort drops it', async (t) => {
  const Native = globalThis.AbortController
  class ReasonlessSignal extends EventTarget {
    aborted = false
  }
  globalThis.AbortController = class {
    signal = new ReasonlessSignal()
    abort() {
      this.signal.aborted = true
      this.signal.dispatchEvent(new Event('abort'))
    }
  }
  t.teardown(() => {
    globalThis.AbortController = Native
  })
  const scheduler = createAiJobScheduler()
  scheduler.setConditions(IDLE)
  let seen
  let runs = 0
  const done = scheduler.enqueue({
    key: 'index',
    priority: AI_JOB_PRIORITY.INDEXING,
    run: async ({ signal }) => {
      runs += 1
      if (runs > 1) return 'ok'
      while (!signal.aborted) await tick(2)
      seen = signal.reason
      throw signal.reason
    }
  })
  await tick(5)
  scheduler.setConditions({ idle: false })
  await tick(5)
  t.is(seen?.code, 'paused')
  scheduler.setConditions({ idle: true })
  t.is(await done, 'ok')
  scheduler.destroy()
})
