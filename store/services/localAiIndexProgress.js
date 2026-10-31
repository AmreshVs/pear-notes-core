import { INDEX_NAMESPACE } from './localAiIndex.js'

const MIN_RATE_SAMPLE_MS = 5000
const MIN_RATE_SAMPLE_NOTES = 3

/** The index bar: percent done and, once a run has gone long enough to measure, time left. */
export function getIndexProgress({ index, coverage, sample = null, now = Date.now() }) {
  const running = index?.status === 'running' && index.total > 0
  const done = running ? index.done : (coverage?.indexed ?? 0)
  const total = running ? index.total : (coverage?.total ?? 0)
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
  let remainingMs = null
  if (running && sample && sample.total === index.total) {
    const elapsed = now - sample.at
    const progressed = index.done - sample.done
    if (elapsed >= MIN_RATE_SAMPLE_MS && progressed >= MIN_RATE_SAMPLE_NOTES) {
      remainingMs = Math.round(((index.total - index.done) * elapsed) / progressed)
    }
  }
  return { running, done, total, percent, remainingMs }
}

/** Starts or keeps the rate sample for one index run. */
export function nextIndexSample(sample, index, now = Date.now()) {
  if (index?.status !== 'running') return null
  if (sample && sample.total === index.total && sample.done <= index.done) return sample
  return { at: now, done: index.done, total: index.total }
}

export async function loadIndexBytes(api) {
  const stats = await api.derivedStats({ namespaces: [INDEX_NAMESPACE] })
  return stats?.ok ? stats.bytes : null
}
