// Offline accuracy check for the writing tools: fix grammar, rewrite, shorter,
// professional and friendly. Runs the shipping pipeline against a real model
// and checks what a user would notice: lost or invented facts, broken lines,
// untouched errors, chatter, a changed language, or obeying the note's text.
//
//   node evals/rewriteEval.mjs [--suite=cases-rewrite|cases-rewrite-holdout] [--best | --model=<name>]
//                              [--repeat=3] [--only=id,id] [--out=report.json]
import fs from 'fs'

import { detectTextLanguage } from '../store/services/localAiLanguage.js'
import * as prompts from '../store/services/localAiPrompts.js'
import { diffRewriteText } from '../store/services/localAiRewriteDiff.js'
import * as writing from '../store/services/localAiWritingTools.js'
import { flag, loadQvac, summarize } from './qvacRuntime.mjs'

const SUITE = flag('suite', 'cases-rewrite')
const { CASES } = await import(`./${SUITE}.mjs`)
const ONLY = flag('only', '')
const OUT = flag('out', '')
const REPEAT = Number(flag('repeat', '1'))

const { loadMs, complete, close } = await loadQvac('pear-notes-rewrite-eval')
console.log(`model loaded in ${loadMs}ms, repeat ${REPEAT}`)

const rewrite = (task, text, trace) => writing.runNoteRewrite({ task, text, complete, trace })

const NUMBER = /\d(?:[\d.,:]*\d)?/g
const numbers = (text) =>
  new Set((String(text).match(NUMBER) ?? []).map((value) => value.replace(/,(?=\d{3}\b)/g, '')))
const lines = (text) =>
  String(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
const words = (text) => String(text).split(/\s+/).filter(Boolean).length
const CHATTER =
  /^(?:here(?:'s| is| are)|sure|certainly|of course|okay)\b|\b(?:rewritten|corrected|revised|improved) (?:text|version)\b|\bI (?:have|'ve) (?:corrected|rewritten|fixed)\b/im

function check(testCase, output) {
  const fails = []
  const input = testCase.input
  if (!output.trim()) return ['empty output']
  if (CHATTER.test(output)) fails.push('chatter or label in the output')
  for (const needle of testCase.keep ?? []) {
    const options = [needle].flat()
    if (!options.some((option) => output.includes(option))) fails.push(`lost "${options[0]}"`)
  }
  const invented = [...numbers(output)].filter((value) => !numbers(input).has(value))
  if (invented.length) fails.push(`invented numbers ${invented.join(', ')}`)
  const inLines = lines(input).length
  const outLines = lines(output).length
  if (testCase.task === prompts.NOTE_TASK.MAKE_SHORTER) {
    if (outLines > inLines) fails.push(`lines ${inLines} -> ${outLines}`)
    if (words(output) > words(input) * (testCase.shorterRatio ?? 0.75)) {
      fails.push(`not shorter: ${words(input)} -> ${words(output)} words`)
    }
  } else if (outLines !== inLines) {
    fails.push(`lines ${inLines} -> ${outLines}`)
  }
  const diff = diffRewriteText(input, output)
  if (testCase.task === prompts.NOTE_TASK.FIX_GRAMMAR) {
    const limit = testCase.maxChange ?? 0.35
    if (diff.changedRatio > limit)
      fails.push(`changed ${Math.round(diff.changedRatio * 100)}% of words`)
  } else if (diff.unchanged && !testCase.mayStay) {
    fails.push('returned the text unchanged')
  } else if (diff.changedRatio < (testCase.minChange ?? 0)) {
    fails.push(`barely changed: ${Math.round(diff.changedRatio * 100)}% of words`)
  }
  for (const line of lines(output)) {
    if (
      words(line) <= 3 &&
      /\d/.test(line) &&
      !/[a-z]{3}/i.test(line.replace(/\d+(st|nd|rd|th|am|pm)?/gi, ''))
    ) {
      fails.push(`degenerate line "${line}"`)
    }
  }
  for (const [wrong, right] of testCase.fixes ?? []) {
    if (output.includes(wrong) || !output.toLowerCase().includes(right.toLowerCase())) {
      fails.push(`not fixed: "${wrong}" -> "${right}"`)
    }
  }
  for (const line of testCase.unchanged ?? []) {
    if (!output.includes(line)) fails.push(`changed a correct line: "${line}"`)
  }
  for (const needle of testCase.forbid ?? []) {
    if (output.toLowerCase().includes(needle.toLowerCase())) fails.push(`has "${needle.trim()}"`)
  }
  const fromLanguage = detectTextLanguage(input)
  const toLanguage = detectTextLanguage(output)
  if (fromLanguage && toLanguage && fromLanguage !== toLanguage) {
    fails.push(`language ${fromLanguage} -> ${toLanguage}`)
  }
  return fails
}

const selected = ONLY ? CASES.filter((item) => ONLY.split(',').includes(item.id)) : CASES
const results = []
for (const testCase of selected) {
  for (let pass = 0; pass < REPEAT; pass++) {
    const started = Date.now()
    const trace = {}
    let output = ''
    let fails
    try {
      output = String((await rewrite(testCase.task, testCase.input, trace)) ?? '')
      fails = check(testCase, output)
    } catch (error) {
      fails = [String(error?.stack ?? error)]
    }
    const ms = Date.now() - started
    results.push({
      id: testCase.id,
      group: testCase.group,
      ok: !fails.length,
      ms,
      fails,
      output,
      trace
    })
    console.log(
      `${fails.length ? 'FAIL' : 'PASS'} ${testCase.id} (${ms}ms) ${fails.join(' | ').slice(0, 300)}`
    )
  }
}

const passed = summarize(results, `suite=${SUITE}`)
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ results }, null, 2))
await close()
process.exit(passed === results.length ? 0 : 1)
