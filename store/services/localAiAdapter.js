let adapter = null

export const setLocalAiAdapter = (nextAdapter) => {
  adapter = nextAdapter
}

export const getLocalAiAdapter = () => adapter

export const hasLocalAiAdapter = () => adapter !== null

export const LOCAL_AI_WIPE_TIMEOUT_MS = 5000

export async function wipeLocalAi(timeoutMs = LOCAL_AI_WIPE_TIMEOUT_MS) {
  if (!adapter?.closeAndWipe) return false
  let timer = null
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs)
  })
  try {
    return await Promise.race([
      Promise.resolve()
        .then(() => adapter.closeAndWipe())
        .then(() => true)
        .catch(() => false),
      timeout
    ])
  } finally {
    clearTimeout(timer)
  }
}
