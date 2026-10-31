// Shared setup for the real-model evals: finds the desktop QVAC runtime and the
// dev build's downloaded models, and loads an LLM the way the apps do.
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

import { LLM_CONTEXT_SIZE } from '../store/services/localAiPrompts.js'

export const HERE = path.dirname(fileURLToPath(import.meta.url))

export const flag = (name, fallback) =>
  (process.argv.find((arg) => arg.startsWith(`--${name}=`)) ?? '').split('=')[1] ?? fallback

export const MODEL =
  flag('model', '') ||
  (process.argv.includes('--best') ? 'QWEN3_1_7B_INST_Q4' : 'QWEN3_600M_INST_Q4')

let sdkPromise = null

// --no-think-switch=off drops the /no_think prompt switch; --reasoning-budget=unset drops
// generationParams.reasoning_budget (the pre-2026-10-14 params).
const STRIP_NO_THINK = flag('no-think-switch', 'on') === 'off'
const UNSET_BUDGET = flag('reasoning-budget', '') === 'unset'
// --no-kv keeps the replayed history of runAsk({ cache: true }) but drops the SDK KV cache.
const DROP_KV = process.argv.includes('--no-kv')

export function applyEvalSwitches(params) {
  let next = params
  if (DROP_KV && 'kvCache' in next) {
    const { kvCache: _dropped, ...rest } = next
    next = rest
  }
  if (UNSET_BUDGET && next.generationParams) {
    const { reasoning_budget: _unused, ...rest } = next.generationParams
    next = { ...next, generationParams: rest }
  }
  if (STRIP_NO_THINK && Array.isArray(next.history)) {
    next = {
      ...next,
      history: next.history.map((message) => ({
        ...message,
        content: String(message.content ?? '').replace(/\s*\/no_think\b/g, '')
      }))
    }
  }
  return next
}

export function importQvacSdk(configName) {
  sdkPromise ??= (async () => {
    const runtimeDir = flag(
      'runtime',
      path.join(HERE, '..', '..', 'pear-notes-desktop', 'local-ai')
    )
    const modelsDir = flag(
      'models',
      path.join(os.homedir(), 'Library', 'Application Support', 'PearNotes-dev-local-ai', 'models')
    )
    const sdkEntry = path.join(
      runtimeDir,
      'node_modules',
      '@qvac',
      'sdk',
      'dist',
      'src',
      'index.js'
    )
    if (!fs.existsSync(sdkEntry)) {
      console.error(
        `No QVAC runtime at ${runtimeDir}.\n` +
          'Install the desktop local-ai runtime first, or pass --runtime=<dir>.'
      )
      process.exit(1)
    }
    const configPath = path.join(os.tmpdir(), `${configName}.json`)
    fs.writeFileSync(configPath, JSON.stringify({ cacheDirectory: modelsDir }))
    process.env.QVAC_CONFIG_PATH = configPath
    process.env.QVAC_WORKER_PATH = path.join(runtimeDir, 'qvac', 'worker.entry.mjs')
    return import(pathToFileURL(sdkEntry).href)
  })()
  return sdkPromise
}

export async function loadQvac(configName) {
  const sdk = await importQvacSdk(configName)

  const loadedAt = Date.now()
  const modelId = await sdk.loadModel({
    modelSrc: sdk[MODEL],
    modelType: 'llm',
    modelConfig: { ctx_size: LLM_CONTEXT_SIZE, tools: true }
  })
  const loadMs = Date.now() - loadedAt

  async function complete(params) {
    const run = sdk.completion({ modelId, ...applyEvalSwitches(params), stream: true })
    return String((await run.final).contentText ?? '')
  }

  // One turn with tools: the text, plus the calls the model asked for.
  async function completeWithTools(params) {
    const run = sdk.completion({ modelId, ...applyEvalSwitches(params), stream: true })
    const final = await run.final
    const text = String(final.contentText ?? '')
    const toolCalls = params.tools ? (final.toolCalls ?? []) : []
    return {
      text,
      toolCalls: toolCalls.map((call) => ({ name: call.name, arguments: call.arguments }))
    }
  }

  async function close() {
    await sdk.unloadModel({ modelId })
    await sdk.close()
  }

  return { sdk, modelId, loadMs, complete, completeWithTools, close }
}

export function summarize(results, label) {
  const passed = results.filter((item) => item.ok).length
  console.log(`\n${passed}/${results.length} passed  model=${MODEL}  ${label}`)
  const groups = new Map()
  const perCase = new Map()
  for (const item of results) {
    for (const [map, key] of [
      [groups, item.group],
      [perCase, item.id]
    ]) {
      const entry = map.get(key) ?? { pass: 0, total: 0 }
      entry.total++
      if (item.ok) entry.pass++
      map.set(key, entry)
    }
  }
  for (const [group, score] of groups) console.log(`  ${group}: ${score.pass}/${score.total}`)
  const shaky = [...perCase].filter(([, score]) => score.pass < score.total)
  if (shaky.length) {
    console.log('\nfailing or flaky:')
    for (const [id, score] of shaky) console.log(`  ${id}: ${score.pass}/${score.total}`)
  }
  return passed
}
