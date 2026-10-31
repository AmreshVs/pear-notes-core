import createTestnet from 'hyperdht/testnet.js'
import { setDefaultSwarmBootstrap } from '../../backend/NoteBase.js'

const TESTNET_SIZE = 4

export async function withTestnet(t) {
  const testnet = await createTestnet(TESTNET_SIZE, t.teardown.bind(t))
  setDefaultSwarmBootstrap(testnet.bootstrap)
  t.teardown(() => setDefaultSwarmBootstrap(null))
  return { testnet, bootstrap: testnet.bootstrap }
}
