// A plain debounce starves under a steady event stream: a source that fires
// every tick keeps pushing the timer out and the callback never runs. The
// max-wait timer is armed once per burst and is never reset, so a burst can
// delay a run by at most maxWaitMs.
export function debounceWithMaxWait(fn, waitMs, maxWaitMs) {
  let waitTimer = null
  let maxWaitTimer = null

  const run = () => {
    clearTimeout(waitTimer)
    clearTimeout(maxWaitTimer)
    waitTimer = null
    maxWaitTimer = null
    fn()
  }

  const schedule = () => {
    clearTimeout(waitTimer)
    waitTimer = setTimeout(run, waitMs)
    if (maxWaitTimer === null) maxWaitTimer = setTimeout(run, maxWaitMs)
  }

  schedule.cancel = () => {
    clearTimeout(waitTimer)
    clearTimeout(maxWaitTimer)
    waitTimer = null
    maxWaitTimer = null
  }

  return schedule
}
