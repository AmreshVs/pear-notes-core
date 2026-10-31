import b4a from 'b4a'

const SEALED_NAMESPACE = 'sealed-prefs'
const SEALED_KEYS = new Set(['askVaultThreads', 'askNoteThreads'])

export const isSealedPreference = (key) => SEALED_KEYS.has(key)

const isSealedStoredKey = (storedKey) => SEALED_KEYS.has(String(storedKey).split(':')[0])

export async function readSealedPreference(store, key) {
  const entry = await store.get(SEALED_NAMESPACE, key)
  return entry ? JSON.parse(b4a.toString(entry.value)) : null
}

export async function writeSealedPreference(store, key, value) {
  const bytes = value === null || value === undefined ? null : b4a.from(JSON.stringify(value))
  await store.put(SEALED_NAMESPACE, key, Date.now(), bytes)
}

// The preference log is append-only: moved values stay on disk until it is rewritten.
export async function moveSealedPreferences(store, prefs, storedKeysOf) {
  let found = false
  for (const key of SEALED_KEYS) {
    for (const storedKey of storedKeysOf(key)) {
      const value = await prefs.get(storedKey)
      if (value === null || value === undefined) continue
      found = true
      if ((await readSealedPreference(store, key)) === null) {
        await writeSealedPreference(store, key, value)
      }
    }
  }
  if (found) await prefs.rewrite((storedKey) => !isSealedStoredKey(storedKey))
  return found
}
