import b4a from 'b4a'
import c from 'compact-encoding'
import crypto from 'hypercore-crypto'
import Protomux from 'protomux'

import * as log from '../../log.js'
import { VERDICT } from './memberGate.js'

export const AI_OFFLOAD_PROTOCOL = 'pear-notes/ai-offload/v1'
export const AI_OFFLOAD_VERSION = 1
export const AI_OFFLOAD_KINDS = ['vault-answer', 'vault-ask', 'ask-note', 'note-task']
export const AI_OFFLOAD_MAX_BYTES = 256 * 1024
export const AI_OFFLOAD_FIRST_REPLY_MS = 10000
export const AI_OFFLOAD_STALL_MS = 60000
export const AI_OFFLOAD_MAX_OUTSTANDING = 2
export const AI_OFFLOAD_KEEPALIVE_MS = 5000
export const AI_OFFLOAD_WAIT_MS = 3 * 60 * 1000
export const AI_OFFLOAD_PROBE_EVERY_MS = 15000
export const AI_OFFLOAD_PROBE_TIMEOUT_MS = 5000
const AI_OFFLOAD_PROBE_KIND = 'probe'

export const AI_OFFLOAD_ERROR = Object.freeze({
  UNAVAILABLE: 'unavailable',
  UNSUPPORTED: 'unsupported',
  NOT_SERVING: 'not-serving',
  BUSY: 'busy',
  ON_BATTERY: 'on-battery',
  TOO_LARGE: 'too-large',
  NOT_MEMBER: 'not-member',
  TIMEOUT: 'timeout',
  OFFLINE: 'offline',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
})

const hex = (value) => b4a.toString(value, 'hex')
const isId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 64

const offloadError = (code, started = false) =>
  Object.assign(new Error(`ai offload ${code}`), { code, started })

/**
 * Ask jobs between devices of one vault. Opened only on connections whose
 * writer is a current member; the serving side checks again per job.
 */
export class AiOffload {
  constructor({
    discoveryKey,
    verdict,
    onJob = () => {},
    onJobCancel = () => {},
    onStatus = () => {},
    firstReplyMs = AI_OFFLOAD_FIRST_REPLY_MS,
    stallMs = AI_OFFLOAD_STALL_MS,
    keepaliveMs = AI_OFFLOAD_KEEPALIVE_MS,
    waitMs = AI_OFFLOAD_WAIT_MS,
    probeEveryMs = AI_OFFLOAD_PROBE_EVERY_MS,
    probeTimeoutMs = AI_OFFLOAD_PROBE_TIMEOUT_MS
  }) {
    this.discoveryKey = discoveryKey
    this.verdict = verdict
    this.onJob = onJob
    this.onJobCancel = onJobCancel
    this.onStatus = onStatus
    this.firstReplyMs = firstReplyMs
    this.stallMs = stallMs
    this.keepaliveMs = keepaliveMs
    this.waitMs = waitMs
    this.probeEveryMs = probeEveryMs
    this.probeTimeoutMs = probeTimeoutMs
    this.probes = new Map()
    this.probeTimer = null
    this.serving = false
    this.closed = false
    this.peers = new Set()
    this.waiting = new Map()
    this.paired = new WeakSet()
    this.jobs = new Map()
    this.runs = new Map()
  }

  async attach(stream, writer) {
    if (!writer || this.closed || stream.destroyed) return
    if ([...this.peers].some((peer) => peer.stream === stream)) return
    const mux = Protomux.from(stream)
    if (!this.paired.has(stream)) {
      // An open from the other side before ours would be refused without this.
      this.paired.add(stream)
      mux.pair({ protocol: AI_OFFLOAD_PROTOCOL, id: this.discoveryKey }, () =>
        this.attach(stream, writer)
      )
      stream.once('close', () =>
        mux.unpair({ protocol: AI_OFFLOAD_PROTOCOL, id: this.discoveryKey })
      )
    }
    const verdict = await this.verdict(writer).catch(() => VERDICT.UNKNOWN)
    if (this.closed || stream.destroyed) return
    if (verdict !== VERDICT.MEMBER) {
      // A device that just joined sees an empty member list until it syncs.
      if (!this.waiting.has(stream)) {
        this.waiting.set(stream, writer)
        stream.once('close', () => this.waiting.delete(stream))
      }
      return
    }
    this.waiting.delete(stream)
    if ([...this.peers].some((peer) => peer.stream === stream)) return
    const peer = {
      stream,
      writer,
      key: hex(writer),
      serving: false,
      unresponsive: false,
      messages: null
    }
    const channel = mux.createChannel({
      protocol: AI_OFFLOAD_PROTOCOL,
      id: this.discoveryKey,
      onopen: () => this._sendHello(peer),
      onclose: () => {
        this._forget(peer)
        // Refused while the other side wasn't sure of us yet: try again later.
        if (!this.closed && !stream.destroyed) this.waiting.set(stream, writer)
      }
    })
    if (!channel) return
    const message = (onmessage) => channel.addMessage({ encoding: c.json, onmessage })
    peer.messages = {
      hello: message((m) => this._onHello(peer, m)),
      request: message((m) => this._onRequest(peer, m)),
      reply: message((m) => this._onReply(peer, m)),
      cancel: message((m) => this._onCancel(peer, m))
    }
    this.peers.add(peer)
    channel.open()
  }

  /** Tries connections that weren't members yet again, after the member list changes. */
  recheck() {
    for (const [stream, writer] of this.waiting) {
      this.attach(stream, writer).catch((e) => log.debug('[ai-offload] recheck', e?.message))
    }
  }

  setServing(serving) {
    if (this.serving === !!serving) return
    this.serving = !!serving
    for (const peer of this.peers) this._sendHello(peer)
    if (this.serving) return
    for (const [jobId, job] of [...this.jobs]) {
      this._dropJob(jobId)
      this._send(job.peer, 'reply', { id: job.id, error: AI_OFFLOAD_ERROR.NOT_SERVING })
      this.onJobCancel(jobId)
    }
  }

  status() {
    const peer = this._servingPeer()
    return { available: !!peer, writer: peer?.key ?? null }
  }

  /** Sends a job to a serving member. Resolves `{ text, data }`; rejects with `code` and `started`. */
  run({ kind, payload, onText = () => {} }) {
    const peer = this._servingPeer()
    if (!peer) return { id: null, done: Promise.reject(offloadError(AI_OFFLOAD_ERROR.UNAVAILABLE)) }
    const id = hex(crypto.randomBytes(16))
    const done = new Promise((resolve, reject) => {
      const entry = {
        peer,
        resolve,
        reject,
        onText,
        started: false,
        timer: null,
        deadline: Date.now() + this.waitMs
      }
      this.runs.set(id, entry)
      this._armTimer(id, entry, this.firstReplyMs)
    })
    this._send(peer, 'request', { id, kind, payload })
    return { id, done }
  }

  cancel(id) {
    this._failRun(id, AI_OFFLOAD_ERROR.CANCELLED, true)
  }

  reply(jobId, { text, done, error, data } = {}) {
    const job = this.jobs.get(jobId)
    if (!job) return
    const message = { id: job.id }
    if (typeof text === 'string') message.text = text
    if (done && data !== undefined) message.data = data
    if (error) message.error = String(error)
    else if (done) message.done = true
    if (message.error || message.done) this._dropJob(jobId)
    this._send(job.peer, 'reply', message)
  }

  /** Asks each serving member for a reply, so a connection that silently died stops counting. */
  probe() {
    for (const peer of this.peers) {
      if (!peer.serving || [...this.probes.values()].some((p) => p.peer === peer)) continue
      const id = hex(crypto.randomBytes(16))
      const timer = setTimeout(() => {
        this.probes.delete(id)
        this._setResponsive(peer, false)
      }, this.probeTimeoutMs)
      this.probes.set(id, { peer, timer })
      this._send(peer, 'request', { id, kind: AI_OFFLOAD_PROBE_KIND })
    }
  }

  close() {
    this.closed = true
    this._stopProbing()
    this.waiting.clear()
    for (const jobId of [...this.jobs.keys()]) this._dropJob(jobId)
    for (const peer of [...this.peers]) this._forget(peer)
  }

  _servingPeer() {
    for (const peer of this.peers) if (peer.serving && !peer.unresponsive) return peer
    return null
  }

  _setResponsive(peer, responsive) {
    if (peer.unresponsive === !responsive) return
    peer.unresponsive = !responsive
    if (peer.serving) this.onStatus(this.status())
  }

  _syncProbing() {
    const anyServing = [...this.peers].some((peer) => peer.serving)
    if (!anyServing || this.closed) return this._stopProbing()
    if (this.probeTimer) return
    this.probeTimer = setInterval(() => this.probe(), this.probeEveryMs)
    this.probeTimer.unref?.()
  }

  _stopProbing() {
    clearInterval(this.probeTimer)
    this.probeTimer = null
    for (const { timer } of this.probes.values()) clearTimeout(timer)
    this.probes.clear()
  }

  _send(peer, type, message) {
    try {
      peer.messages[type].send(message)
    } catch (e) {
      log.debug('[ai-offload] send failed', e?.message || e)
    }
  }

  _sendHello(peer) {
    this._send(peer, 'hello', { v: AI_OFFLOAD_VERSION, serving: this.serving })
  }

  _onHello(peer, message) {
    const serving = message?.v === AI_OFFLOAD_VERSION && message.serving === true
    const wasResponsive = !peer.unresponsive
    peer.unresponsive = false
    if (peer.serving === serving && wasResponsive) return
    peer.serving = serving
    this._syncProbing()
    this.onStatus(this.status())
  }

  async _onRequest(peer, message) {
    const id = message?.id
    if (!isId(id)) return
    const refuse = (error) => this._send(peer, 'reply', { id, error })
    if (!AI_OFFLOAD_KINDS.includes(message.kind)) return refuse(AI_OFFLOAD_ERROR.UNSUPPORTED)
    if (!this.serving) return refuse(AI_OFFLOAD_ERROR.NOT_SERVING)
    let size = Infinity
    try {
      size = JSON.stringify(message.payload ?? null).length
    } catch (e) {
      log.debug('[ai-offload] payload not serialisable', e?.message)
    }
    if (size > AI_OFFLOAD_MAX_BYTES) return refuse(AI_OFFLOAD_ERROR.TOO_LARGE)
    const jobId = `${peer.key}:${id}`
    if (this.jobs.has(jobId)) return
    if (this.jobs.size >= AI_OFFLOAD_MAX_OUTSTANDING) return refuse(AI_OFFLOAD_ERROR.BUSY)
    this.jobs.set(jobId, { peer, id })
    const verdict = await this.verdict(peer.writer).catch(() => VERDICT.UNKNOWN)
    if (!this.jobs.has(jobId)) return
    if (verdict !== VERDICT.MEMBER) {
      this.jobs.delete(jobId)
      return refuse(AI_OFFLOAD_ERROR.NOT_MEMBER)
    }
    // Queued or loading a model counts as alive, so the asker's timers don't fire.
    this._send(peer, 'reply', { id })
    this.jobs.get(jobId).keepalive = setInterval(
      () => this._send(peer, 'reply', { id }),
      this.keepaliveMs
    )
    this.onJob({ jobId, writer: peer.key, kind: message.kind, payload: message.payload ?? null })
  }

  _onReply(peer, message) {
    const probe = this.probes.get(message?.id)
    if (probe && probe.peer === peer) {
      clearTimeout(probe.timer)
      this.probes.delete(message.id)
      this._setResponsive(peer, true)
      return
    }
    const entry = this.runs.get(message?.id)
    if (!entry || entry.peer !== peer) return
    if (message.error) return this._failRun(message.id, String(message.error), false)
    const hasText = typeof message.text === 'string'
    if (hasText || message.done) this._armTimer(message.id, entry, this.stallMs)
    else if (!entry.started) {
      this._armTimer(message.id, entry, Math.min(this.stallMs, entry.deadline - Date.now()))
    }
    if (hasText) {
      entry.started = true
      entry.text = message.text
      entry.onText(message.text)
    }
    if (message.done) {
      clearTimeout(entry.timer)
      this.runs.delete(message.id)
      entry.resolve({ text: entry.text ?? '', data: message.data ?? null })
    }
  }

  _armTimer(id, entry, ms) {
    clearTimeout(entry.timer)
    entry.timer = setTimeout(() => this._failRun(id, AI_OFFLOAD_ERROR.TIMEOUT, true), ms)
  }

  _onCancel(peer, message) {
    const jobId = `${peer.key}:${message?.id}`
    if (!this._dropJob(jobId)) return
    this.onJobCancel(jobId)
  }

  _dropJob(jobId) {
    const job = this.jobs.get(jobId)
    if (!job) return false
    clearInterval(job.keepalive)
    this.jobs.delete(jobId)
    return true
  }

  _failRun(id, code, notifyPeer) {
    const entry = this.runs.get(id)
    if (!entry) return
    this.runs.delete(id)
    clearTimeout(entry.timer)
    if (notifyPeer) this._send(entry.peer, 'cancel', { id })
    entry.reject(offloadError(code, entry.started))
  }

  _forget(peer) {
    if (!this.peers.delete(peer)) return
    for (const [id, probe] of this.probes) {
      if (probe.peer !== peer) continue
      clearTimeout(probe.timer)
      this.probes.delete(id)
    }
    this._syncProbing()
    for (const [jobId, job] of this.jobs) {
      if (job.peer !== peer) continue
      this._dropJob(jobId)
      this.onJobCancel(jobId)
    }
    for (const [id, entry] of this.runs) {
      if (entry.peer === peer) this._failRun(id, AI_OFFLOAD_ERROR.OFFLINE, false)
    }
    if (peer.serving) this.onStatus(this.status())
  }
}
