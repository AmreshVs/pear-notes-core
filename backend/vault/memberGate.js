import b4a from 'b4a'
import c from 'compact-encoding'
import Hypercore from 'hypercore'
import crypto from 'hypercore-crypto'
import Protomux from 'protomux'

import * as log from '../../log.js'

export const MEMBER_PROTOCOL = 'pear-notes/member/v1'
export const EVICT_GRACE_MS = 3000
export const DEPARTED_GRACE_MS = 60000
// Lets the removal notice reach the peer before its connection is cut.
export const NOTICE_FLUSH_MS = 1000

const NOTICE_REMOVED = 1

export const VERDICT = Object.freeze({
  MEMBER: 'member',
  REMOVED: 'removed',
  // Removed itself: it is wiping its storage and only waits for the leader's ack.
  DEPARTED: 'departed',
  UNKNOWN: 'unknown',
  // Nothing to protect yet: a fresh joiner has to learn the member list from someone.
  OPEN: 'open'
})

const NAMESPACE = b4a.from(MEMBER_PROTOCOL)

const proofEncoding = {
  preencode(state, m) {
    c.buffer.preencode(state, m.manifest)
    c.fixed64.preencode(state, m.signature)
  },
  encode(state, m) {
    c.buffer.encode(state, m.manifest)
    c.fixed64.encode(state, m.signature)
  },
  decode(state) {
    return { manifest: c.buffer.decode(state), signature: c.fixed64.decode(state) }
  }
}

// Bound to this Noise session and to the side that signs, so a proof can be
// neither replayed on another connection nor reflected back at its sender.
function signable(stream, discoveryKey, initiator) {
  return crypto.hash([NAMESPACE, stream.handshakeHash, discoveryKey, b4a.from([initiator ? 1 : 0])])
}

export function createProof(stream, discoveryKey, core) {
  const manifest = core.getManifest({ raw: true })
  const secretKey = core.keyPair?.secretKey
  if (!manifest || !secretKey) return null
  const signature = crypto.sign(signable(stream, discoveryKey, stream.isInitiator), secretKey)
  return { manifest, signature }
}

// Returns the writer key the remote proved it owns, or null.
export function verifyProof(stream, discoveryKey, proof) {
  try {
    if (!proof?.manifest || !proof?.signature || !stream.handshakeHash) return null
    const manifest = Hypercore.parseManifest(proof.manifest)
    if (!manifest || manifest.signers.length !== 1 || manifest.quorum !== 1) return null
    const ok = crypto.verify(
      signable(stream, discoveryKey, !stream.isInitiator),
      proof.signature,
      manifest.signers[0].publicKey
    )
    return ok ? Hypercore.key(manifest) : null
  } catch (err) {
    log.debug('[member] bad proof', err?.message || err)
    return null
  }
}

export class MemberGate {
  constructor({
    discoveryKey,
    localCore,
    verdict,
    admit,
    onRemoved = () => {},
    graceMs = EVICT_GRACE_MS,
    departedGraceMs = DEPARTED_GRACE_MS,
    noticeFlushMs = NOTICE_FLUSH_MS
  }) {
    this.discoveryKey = discoveryKey
    this.localCore = localCore
    this.verdict = verdict
    this.admit = admit
    this.onRemoved = onRemoved
    this.graceMs = graceMs
    this.departedGraceMs = departedGraceMs
    this.noticeFlushMs = noticeFlushMs
    this.peers = new Set()
    this.closed = false
  }

  add(stream) {
    if (this.closed) return
    const peer = {
      stream,
      writer: null,
      admitted: false,
      open: false,
      evictTimer: null,
      checking: false,
      again: false,
      notice: null,
      noticeSent: false
    }
    const mux = Protomux.from(stream)
    const channel = mux.createChannel({
      protocol: MEMBER_PROTOCOL,
      id: this.discoveryKey,
      onopen: () => this._sendProof(peer, proofMessage)
    })
    if (!channel) return
    const proofMessage = channel.addMessage({
      encoding: proofEncoding,
      onmessage: (message) => this._onProof(peer, message)
    })
    // A removed device that is behind is never served the removal itself.
    peer.notice = channel.addMessage({
      encoding: c.uint,
      onmessage: (code) => this._onNotice(peer, code)
    })
    this.peers.add(peer)
    stream.once('close', () => this._forget(peer))
    channel.open()
  }

  admitted() {
    return [...this.peers].filter((peer) => peer.admitted).map((peer) => peer.writer)
  }

  recheck() {
    for (const peer of this.peers) if (peer.writer) this._evaluate(peer)
  }

  close() {
    this.closed = true
    for (const peer of this.peers) clearTimeout(peer.evictTimer)
    this.peers.clear()
  }

  _sendProof(peer, message) {
    const core = this.localCore()
    const proof = core && createProof(peer.stream, this.discoveryKey, core)
    if (proof) message.send(proof)
    else log.warn('[member] no local writer key to prove membership with')
  }

  _onProof(peer, proof) {
    if (peer.writer) return
    const writer = verifyProof(peer.stream, this.discoveryKey, proof)
    if (!writer) {
      log.warn('[member] invalid membership proof, dropping the connection')
      peer.stream.destroy()
      return
    }
    peer.writer = writer
    this._evaluate(peer)
  }

  async _evaluate(peer) {
    if (peer.checking) {
      peer.again = true
      return
    }
    peer.checking = true
    try {
      do {
        peer.again = false
        const verdict = await this.verdict(peer.writer).catch(() => VERDICT.UNKNOWN)
        if (!this.peers.has(peer)) return
        this._apply(peer, verdict)
      } while (peer.again && this.peers.has(peer))
    } finally {
      peer.checking = false
    }
  }

  _apply(peer, verdict) {
    if (verdict === VERDICT.MEMBER) {
      this._cancelEvict(peer)
      peer.open = false
      this._admit(peer)
    } else if (verdict === VERDICT.OPEN) {
      if (!peer.admitted) peer.open = true
      this._admit(peer)
    } else if (verdict === VERDICT.DEPARTED) {
      if (peer.admitted) this._scheduleEvict(peer, this.departedGraceMs)
      else peer.stream.destroy()
    } else if (verdict === VERDICT.REMOVED) {
      this._sendRemoved(peer)
      this._scheduleEvict(peer, peer.admitted ? this.graceMs : this.noticeFlushMs)
    } else if (verdict === VERDICT.UNKNOWN && peer.open) {
      if (peer.admitted) this._scheduleEvict(peer, this.graceMs)
      else peer.stream.destroy()
    }
  }

  _sendRemoved(peer) {
    if (peer.noticeSent) return
    peer.noticeSent = true
    try {
      peer.notice.send(NOTICE_REMOVED)
    } catch (e) {
      log.debug('[member] could not send the removal notice', e?.message || e)
    }
  }

  _onNotice(peer, code) {
    if (code !== NOTICE_REMOVED || !peer.writer) return
    try {
      this.onRemoved(peer.writer)
    } catch (e) {
      log.error('[member] removal notice handler failed', e)
    }
  }

  _admit(peer) {
    if (peer.admitted) return
    peer.admitted = true
    try {
      this.admit(peer.stream, peer.writer)
    } catch (e) {
      log.error('[member] could not start replication', e)
    }
  }

  _scheduleEvict(peer, graceMs) {
    if (peer.evictTimer) return
    peer.evictTimer = setTimeout(() => {
      peer.evictTimer = null
      if (!this.peers.has(peer)) return
      log.info('[member] dropping a peer that is no longer a member of this vault')
      peer.stream.destroy()
    }, graceMs)
  }

  _cancelEvict(peer) {
    clearTimeout(peer.evictTimer)
    peer.evictTimer = null
  }

  _forget(peer) {
    this._cancelEvict(peer)
    this.peers.delete(peer)
  }
}
