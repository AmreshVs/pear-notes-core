// Renders cases.mjs to PNGs via render.swift: node evals/vision/render.mjs [outdir]
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

import { CASES } from './cases.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = process.argv[2] ?? path.join(here, 'images')
fs.mkdirSync(outDir, { recursive: true })
const json = path.join(os.tmpdir(), 'vision-cases.json')
fs.writeFileSync(json, JSON.stringify(CASES))
execFileSync('swift', [path.join(here, 'render.swift'), json, outDir], { stdio: 'inherit' })
