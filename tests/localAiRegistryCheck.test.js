import test from 'brittle'

import { LOCAL_AI_REGISTRY_MODELS } from '../store/services/localAiCatalog.js'
import {
  findLocalAiRegistryMismatches,
  findMissingLocalAiModelNames
} from '../store/services/localAiRegistryCheck.js'

const registryFromCatalog = () =>
  Object.fromEntries(
    Object.entries(LOCAL_AI_REGISTRY_MODELS).map(([name, entry]) => [
      name,
      { name, expectedSize: entry.bytes }
    ])
  )

test('findLocalAiRegistryMismatches accepts a registry that matches the catalog', (t) => {
  t.alike(findLocalAiRegistryMismatches(registryFromCatalog()), [])
})

test('findLocalAiRegistryMismatches reports missing models and changed sizes', (t) => {
  const registry = registryFromCatalog()
  delete registry.OCR_LATIN
  registry.QWEN3_600M_INST_Q4 = { expectedSize: 1 }
  const problems = findLocalAiRegistryMismatches(registry)
  t.is(problems.length, 2)
  t.ok(problems.some((problem) => problem.startsWith('OCR_LATIN is not in')))
  t.ok(problems.some((problem) => problem.startsWith('QWEN3_600M_INST_Q4 is 382156480 bytes')))
})

test('findMissingLocalAiModelNames lists catalog models without a display name', (t) => {
  const names = Object.fromEntries(
    Object.keys(LOCAL_AI_REGISTRY_MODELS).map((name) => [name, name])
  )
  t.alike(findMissingLocalAiModelNames(names), [])
  delete names.OCR_LATIN
  names.QWEN3_600M_INST_Q4 = ' '
  t.is(findMissingLocalAiModelNames(names).length, 2)
})
