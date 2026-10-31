import b4a from 'b4a'
import c from 'compact-encoding'
import RocksDB from 'rocksdb-native'
import sodium from 'sodium-universal'

export const DERIVED_DIR = 'derived'
const KEY_CONTEXT = b4a.from('pear-notes/derived-store/v1')
const CHECK_KEY = b4a.from([1])
const CHECK_PLAINTEXT = b4a.from('pear-notes derived store')
const NAMESPACE = /^[a-z0-9-]{1,32}$/
const SEPARATOR = 0

const record = {
  preencode(state, m) {
    c.string.preencode(state, m.key)
    c.uint.preencode(state, m.version)
    c.buffer.preencode(state, m.value)
  },
  encode(state, m) {
    c.string.encode(state, m.key)
    c.uint.encode(state, m.version)
    c.buffer.encode(state, m.value)
  },
  decode(state) {
    return {
      key: c.string.decode(state),
      version: c.uint.decode(state),
      value: c.buffer.decode(state)
    }
  }
}

export function deriveStoreKey(vaultKey) {
  const key = b4a.alloc(sodium.crypto_secretbox_KEYBYTES)
  sodium.crypto_generichash(key, KEY_CONTEXT, vaultKey)
  return key
}

function seal(key, plaintext) {
  const out = b4a.alloc(
    sodium.crypto_secretbox_NONCEBYTES + plaintext.byteLength + sodium.crypto_secretbox_MACBYTES
  )
  const nonce = out.subarray(0, sodium.crypto_secretbox_NONCEBYTES)
  sodium.randombytes_buf(nonce)
  sodium.crypto_secretbox_easy(out.subarray(nonce.byteLength), plaintext, nonce, key)
  return out
}

function open(key, sealed) {
  const nonceBytes = sodium.crypto_secretbox_NONCEBYTES
  if (!sealed || sealed.byteLength < nonceBytes + sodium.crypto_secretbox_MACBYTES) return null
  const plaintext = b4a.alloc(sealed.byteLength - nonceBytes - sodium.crypto_secretbox_MACBYTES)
  const ok = sodium.crypto_secretbox_open_easy(
    plaintext,
    sealed.subarray(nonceBytes),
    sealed.subarray(0, nonceBytes),
    key
  )
  return ok ? plaintext : null
}

const assertNamespace = (namespace) => {
  if (!NAMESPACE.test(namespace)) throw new Error(`invalid derived namespace: ${namespace}`)
}

const prefix = (namespace) => b4a.concat([b4a.from(namespace), b4a.from([SEPARATOR])])
const prefixEnd = (namespace) => b4a.concat([b4a.from(namespace), b4a.from([SEPARATOR + 1])])
const recordKey = (namespace, id) => b4a.concat([prefix(namespace), b4a.from(String(id))])

/**
 * Local, sealed, rebuildable storage for AI-derived data (vectors, entities,
 * suggestions), one per vault. It lives beside the vault's Corestore, never
 * inside it, so nothing here can replicate. Every value is sealed with a key
 * derived from the vault key and carries its own record key, so a value
 * moved to another key fails to open. Anything that fails to open reads as
 * missing: the data is derived and is rebuilt.
 */
export class DerivedStore {
  constructor(dir, vaultKey) {
    if (!vaultKey || vaultKey.byteLength !== 32)
      throw new Error('derived store needs the vault key')
    this.dir = dir
    this._key = deriveStoreKey(vaultKey)
    this._db = new RocksDB(dir)
    this.opened = false
    this.wiped = false
  }

  async ready() {
    if (this.opened) return
    await this._db.ready()
    const check = await this._db.get(CHECK_KEY)
    const plaintext = check ? open(this._key, check) : null
    if (!plaintext || !b4a.equals(plaintext, CHECK_PLAINTEXT)) {
      if (check) {
        await this._db.deleteRange(b4a.alloc(0), b4a.alloc(1, 0xff))
        this.wiped = true
      }
      await this._db.put(CHECK_KEY, seal(this._key, CHECK_PLAINTEXT))
    }
    this.opened = true
  }

  async close() {
    if (this._db.closing || this._db.closed) return
    await this._db.close()
    sodium.sodium_memzero(this._key)
  }

  _seal(namespace, id, version, value) {
    const key = `${namespace}/${id}`
    return seal(this._key, c.encode(record, { key, version, value: b4a.from(value) }))
  }

  _open(namespace, id, sealed) {
    const plaintext = open(this._key, sealed)
    if (!plaintext) return null
    try {
      const decoded = c.decode(record, plaintext)
      if (decoded.key !== `${namespace}/${id}`) return null
      return { id: String(id), version: decoded.version, value: decoded.value }
    } catch {
      return null
    }
  }

  async get(namespace, id) {
    assertNamespace(namespace)
    const sealed = await this._db.get(recordKey(namespace, id))
    return sealed ? this._open(namespace, id, sealed) : null
  }

  /** @param {string} namespace @param {{ id: string, version: number, value: Uint8Array | null }[]} entries */
  async putMany(namespace, entries) {
    assertNamespace(namespace)
    const batch = this._db.write()
    for (const { id, version, value } of entries) {
      const key = recordKey(namespace, id)
      if (value === null) batch.delete(key)
      else batch.put(key, this._seal(namespace, id, Math.max(0, Math.floor(version || 0)), value))
    }
    await batch.flush()
    batch.destroy()
  }

  put(namespace, id, version, value) {
    return this.putMany(namespace, [{ id, version, value }])
  }

  delete(namespace, id) {
    return this.putMany(namespace, [{ id, version: 0, value: null }])
  }

  async *entries(namespace) {
    assertNamespace(namespace)
    const start = prefix(namespace)
    for await (const { key, value } of this._db.iterator({
      gte: start,
      lt: prefixEnd(namespace)
    })) {
      const id = b4a.toString(key.subarray(start.byteLength))
      const entry = this._open(namespace, id, value)
      if (entry) yield entry
    }
  }

  /** Versions only, for deciding what to rebuild without opening every value. */
  async versions(namespace) {
    const out = new Map()
    for await (const entry of this.entries(namespace)) out.set(entry.id, entry.version)
    return out
  }

  async clear(namespace = null) {
    if (namespace === null) {
      await this._db.deleteRange(b4a.from([2]), b4a.alloc(1, 0xff))
      return
    }
    assertNamespace(namespace)
    await this._db.deleteRange(prefix(namespace), prefixEnd(namespace))
  }

  async stats(namespaces = []) {
    const counts = {}
    for (const namespace of namespaces) {
      let count = 0
      for await (const entry of this.entries(namespace)) if (entry) count++
      counts[namespace] = count
    }
    return { bytes: await this._db.approximateSize(b4a.alloc(0), b4a.alloc(1, 0xff)), counts }
  }
}
