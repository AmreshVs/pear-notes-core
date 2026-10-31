import { LOCAL_AI_REGISTRY_MODELS } from './localAiCatalog.js'

export function findLocalAiRegistryMismatches(registry) {
  const problems = []
  for (const [name, entry] of Object.entries(LOCAL_AI_REGISTRY_MODELS)) {
    const registryEntry = registry?.[name]
    if (!registryEntry) {
      problems.push(`${name} is not in the installed QVAC model registry`)
      continue
    }
    const registryBytes = Number(registryEntry.expectedSize)
    if (registryBytes !== entry.bytes) {
      problems.push(
        `${name} is ${entry.bytes} bytes in the Pear Notes catalog but ${registryBytes} in the QVAC registry`
      )
    }
  }
  return problems
}

export function findMissingLocalAiModelNames(modelNames) {
  return Object.keys(LOCAL_AI_REGISTRY_MODELS)
    .filter((name) => typeof modelNames?.[name] !== 'string' || !modelNames[name].trim())
    .map((name) => `${name} has no settings.onDeviceAi.modelNames entry in en.json`)
}
