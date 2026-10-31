import * as log from '../log.js'

const SUBSCRIPTION_COMMAND_PREFIX = '@notes/command-subscribe-'

// Not bound to the notes database, and closing pairing mid-flight breaks linking.
const BASE_INDEPENDENT_SUBSCRIPTIONS = new Set([
  '@notes/command-subscribe-pairing',
  '@notes/command-subscribe-pair-user',
  '@notes/command-subscribe-device-status'
])

/**
 * Owns the lifetime of every streaming subscription the backend serves.
 *
 * hrpc awaits a stream handler and discards what it returns, so the cleanup each
 * subscription handler hands back was never run: every stream the frontend
 * closed (each resync, each retry) left its watcher alive. The server-side
 * RPCStream wrapper does not report the remote close either; only its inner
 * writeStream does, so that is what gets listened to.
 *
 * When the base is reopened (error recovery, pairing), every database watcher is
 * bound to the closed view and goes silent without closing its stream, which
 * left the frontend waiting forever. closeBaseBound() ends those streams so the
 * frontend's reconnect rebuilds them against the new base.
 */
export default class SubscriptionTracker {
  constructor(rpc) {
    this.rpc = rpc
    this.live = new Set()
  }

  install() {
    const handlers = this.rpc._handlers
    for (const command of Object.keys(handlers)) {
      if (!command.startsWith(SUBSCRIPTION_COMMAND_PREFIX)) continue
      if (!this.rpc._responseIsStream(command) || this.rpc._requestIsStream(command)) continue
      const handler = handlers[command]
      handlers[command] = async (stream) => {
        const cleanup = await handler(stream)
        this.track(command, stream, cleanup)
        return cleanup
      }
    }
  }

  track(command, stream, cleanup) {
    const entry = { command, disposed: false, dispose: null }
    entry.dispose = () => {
      if (entry.disposed) return
      entry.disposed = true
      this.live.delete(entry)
      const run = typeof cleanup === 'function' ? cleanup : () => stream.destroy()
      Promise.resolve()
        .then(run)
        .catch((e) => log.error('[subscriptions] cleanup failed ' + command, e))
    }
    this.live.add(entry)

    const transport = stream.writeStream || stream
    if (transport.destroyed || stream.destroyed) {
      entry.dispose()
      return
    }
    transport.on('close', entry.dispose)
    stream.on('close', entry.dispose)
  }

  closeBaseBound() {
    let closed = 0
    for (const entry of [...this.live]) {
      if (BASE_INDEPENDENT_SUBSCRIPTIONS.has(entry.command)) continue
      entry.dispose()
      closed++
    }
    return closed
  }

  get size() {
    return this.live.size
  }
}
