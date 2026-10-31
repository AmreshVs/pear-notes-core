import test from 'brittle'
import b4a from 'b4a'
import http from 'bare-http1'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import Corestore from 'corestore'
import Hyperblobs from 'hyperblobs'
import { GuardedBlobServer } from '../backend/vault/media.js'
import { HYPERDRIVE_URL_PREFIX, normalizeAttachmentUrls } from '../constant.js'

const SECRET = 'a'.repeat(32)
const BYTES = b4a.from('guarded-blob-bytes')

function get(port, requestPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: requestPath, method: 'GET' },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body: b4a.concat(chunks) })
        )
      }
    )
    req.on('error', reject)
    req.end()
  })
}

async function setup(t) {
  const dir = path.join(tmpdir(), 'pear-notes-blob-guard-' + Math.random().toString(36).slice(2))
  const store = new Corestore(dir)
  const core = store.get({ name: 'blobs' })
  await core.ready()
  const blob = await new Hyperblobs(core).put(BYTES)
  const server = new GuardedBlobServer(store.session(), { port: 0, secret: SECRET })
  await server.listen()
  t.teardown(async () => {
    await server.close().catch(() => {})
    await core.close().catch(() => {})
    await store.close().catch(() => {})
    fs.rmSync(dir, { recursive: true, force: true })
  })
  return { server, link: server.getLink(core.key, { blob }) }
}

test('blob server - serves a link only through the secret path', async (t) => {
  const { server, link } = await setup(t)
  const url = new URL(link)
  t.ok(url.pathname.startsWith('/' + SECRET + '/'), 'link carries the secret segment')

  const ok = await get(server.port, url.pathname + url.search)
  t.is(ok.status, 200)
  t.alike(ok.body, BYTES, 'bytes served through the secret path')
  t.is(ok.headers['cache-control'], 'no-store', 'decrypted bytes are never disk-cached')

  const bare = await get(server.port, '/' + url.search)
  t.is(bare.status, 404, 'the same query without the secret is refused')

  const wrong = await get(server.port, '/' + 'b'.repeat(32) + '/' + url.search)
  t.is(wrong.status, 404, 'a wrong secret is refused')
})

test('blob server - malformed requests are answered, not fatal', async (t) => {
  const { server, link } = await setup(t)
  const url = new URL(link)

  t.is((await get(server.port, '/?x=1')).status, 404, 'unauthenticated junk')
  t.is((await get(server.port, '/' + SECRET + '/?x=1')).status, 400, 'authenticated junk')
  t.is((await get(server.port, '/' + SECRET + '?x=1')).status, 400, 'secret without slash')
  const badType = await get(server.port, url.pathname + url.search + '&type=a%0D%0AX-Injected:%201')
  t.is(badType.status, 200, 'header-breaking content type still serves the blob')
  t.absent(badType.headers['x-injected'], 'no header injected')
  t.is(badType.headers['content-type'], 'application/octet-stream', 'type replaced')

  const after = await get(server.port, url.pathname + url.search)
  t.is(after.status, 200, 'still serving afterwards')
})

test('normalizeAttachmentUrls - strips the secret segment with the address', (t) => {
  const resolved = `<img src="http://127.0.0.1:49833/${SECRET}/?key=abc&amp;blob=xyz">`
  t.is(
    normalizeAttachmentUrls(resolved),
    `<img src="${HYPERDRIVE_URL_PREFIX}/?key=abc&amp;blob=xyz">`
  )
})
