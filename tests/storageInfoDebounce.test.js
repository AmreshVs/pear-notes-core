import test from 'brittle'

import { debounceWithMaxWait } from '../backend/debounceWithMaxWait.js'
import {
  STORAGE_INFO_DEBOUNCE_MS,
  STORAGE_INFO_MAX_WAIT_MS,
  TRANSFER_INFO_DEBOUNCE_MS,
  TRANSFER_INFO_MAX_WAIT_MS
} from '../constant.js'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('debounceWithMaxWait - a quiet burst still collapses to one run', async (t) => {
  let runs = 0
  const schedule = debounceWithMaxWait(() => runs++, 20, 200)

  schedule()
  schedule()
  schedule()
  await wait(80)

  t.is(runs, 1, 'three events in one burst ran the callback once')
  schedule.cancel()
})

test('debounceWithMaxWait - a steady stream cannot starve the callback', async (t) => {
  let runs = 0
  const schedule = debounceWithMaxWait(() => runs++, 30, 60)

  const ticker = setInterval(schedule, 20)
  schedule()
  await wait(260)
  clearInterval(ticker)

  t.ok(runs >= 3, `a source faster than the debounce still ran (${runs} runs)`)
  schedule.cancel()
})

test('debounceWithMaxWait - cancel stops a pending run', async (t) => {
  let runs = 0
  const schedule = debounceWithMaxWait(() => runs++, 20, 40)

  schedule()
  schedule.cancel()
  await wait(80)

  t.is(runs, 0, 'nothing ran after cancel')
})

test('storage info timings leave room for the transfer ticker', (t) => {
  t.ok(
    STORAGE_INFO_MAX_WAIT_MS > STORAGE_INFO_DEBOUNCE_MS,
    'the full rescan has a max wait above its debounce'
  )
  t.ok(
    TRANSFER_INFO_MAX_WAIT_MS > TRANSFER_INFO_DEBOUNCE_MS,
    'transfer pushes have a max wait above their debounce'
  )
  t.ok(
    TRANSFER_INFO_MAX_WAIT_MS < STORAGE_INFO_MAX_WAIT_MS,
    'transfer numbers refresh faster than the expensive rescan'
  )
})
