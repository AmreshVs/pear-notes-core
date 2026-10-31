// Release @pear-notes/core: check, test, bump, tag, push, then start the npm publish workflow.
//
//   npm run release -- patch|minor|major|X.Y.Z
//   npm run release -- current      # tag and publish the version already in package.json
//   npm run release -- 1.2.0 --dry-run --skip-tests

import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import readline from 'readline/promises'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SEMVER = /^\d+\.\d+\.\d+$/
const RELEASE_BRANCH = /^(main|v\d+\.\d+\.\d+)$/
const WORKFLOW = 'publish.yml'
const VERSION_FILES = ['package.json', 'package-lock.json']
const NOT_SHIPPED = /^(tests|evals|legacy|spikes|scripts)\/|^\.|\.test\.js$/

const args = process.argv.slice(2)
const flags = new Set(args.filter((arg) => arg.startsWith('--')))
const target = args.find((arg) => !arg.startsWith('--'))
const DRY_RUN = flags.has('--dry-run')
const SKIP_TESTS = flags.has('--skip-tests')

class ReleaseError extends Error {}

function run(command, commandArgs, { capture = true, allowFail = false } = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit'
  })
  if (result.error) {
    throw new ReleaseError(`${command} could not start: ${result.error.message}`)
  }
  if (result.status !== 0 && !allowFail) {
    const output = capture ? `:\n${(result.stderr || result.stdout).trim()}` : ''
    throw new ReleaseError(`${command} ${commandArgs.join(' ')} failed${output}`)
  }
  return {
    ok: result.status === 0,
    out: (result.stdout || '').trim(),
    err: (result.stderr || '').trim()
  }
}

const git = (gitArgs, options) => run('git', gitArgs, options)
const npm = (npmArgs, options) => run('npm', npmArgs, options)

function step(title) {
  console.log(`\n==> ${title}`)
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'))
}

function nextVersion(current, kind) {
  const [major, minor, patch] = current.split('.').map(Number)
  if (kind === 'major') return `${major + 1}.0.0`
  if (kind === 'minor') return `${major}.${minor + 1}.0`
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`
  return kind
}

function isNewer(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i]
  }
  return false
}

function githubSlug() {
  const url = git(['remote', 'get-url', 'origin']).out
  const slug = url.match(/github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/)?.[1]
  if (!slug) {
    throw new ReleaseError(`cannot read a GitHub repository from origin (${url})`)
  }
  return slug
}

function publishedVersions(name) {
  const view = npm(['view', name, 'versions', '--json'], { allowFail: true })
  if (view.ok) return [].concat(JSON.parse(view.out || '[]'))
  if (/E404/.test(view.err)) return []
  throw new ReleaseError(`could not read ${name} from npm:\n${view.err}`)
}

function remoteTag(tag) {
  const listing = git(['ls-remote', '--tags', 'origin', `refs/tags/${tag}`]).out
  return listing ? listing.split('\t')[0] : null
}

function checkTree() {
  step('Checking the checkout')
  const dirty = git(['status', '--porcelain']).out
  if (dirty) {
    throw new ReleaseError(
      `the tree has uncommitted changes - commit or stash them first:\n${dirty}`
    )
  }
  const branch = git(['branch', '--show-current']).out
  if (!RELEASE_BRANCH.test(branch)) {
    throw new ReleaseError(
      `releases come from main or a vX.Y.Z branch, not "${branch || '(detached)'}"`
    )
  }
  git(['fetch', '--quiet', '--tags', 'origin', branch])
  const local = git(['rev-parse', 'HEAD']).out
  const remote = git(['rev-parse', `origin/${branch}`], { allowFail: true }).out
  if (local !== remote) {
    throw new ReleaseError(`${branch} is not level with origin/${branch} - pull or push first`)
  }
  console.log(`  ok: ${branch} at ${local.slice(0, 12)}, clean, level with origin`)
  return branch
}

function currentReleaseCommit(shipped) {
  const commit = git(['log', '-n1', '--format=%H', '-G"version":', '--', 'package.json']).out
  if (!commit) throw new ReleaseError('cannot find the commit that set the version')
  const changed = git(['diff', '--name-only', commit, 'HEAD', '--', ...shipped]).out
  if (changed) {
    throw new ReleaseError(
      `shipped files changed since ${commit.slice(0, 12)} set the version - bump instead:\n${changed}`
    )
  }
  return commit
}

function runChecks() {
  step('Lint and tests')
  npm(['run', 'lint'], { capture: false })
  if (SKIP_TESTS) {
    console.log('  skipped tests (--skip-tests)')
    return
  }
  npm(['run', 'test:fast'], { capture: false })
  npm(['run', 'test:store'], { capture: false })
}

function checkPack() {
  step('Checking the package contents')
  const [pack] = JSON.parse(npm(['pack', '--dry-run', '--json']).out)
  const stray = pack.files.map((file) => file.path).filter((p) => NOT_SHIPPED.test(p))
  if (stray.length) {
    throw new ReleaseError(
      `the package would ship files it should not (${stray.slice(0, 5).join(', ')}) - check "files" in package.json`
    )
  }
  const size = (pack.unpackedSize / 1024 / 1024).toFixed(1)
  console.log(`  ok: ${pack.files.length} files, ${size} MB unpacked`)
}

// tsc exits 2 on the existing type errors but still writes the declarations.
function buildTypes() {
  const result = spawnSync('npx', ['tsc'], { cwd: ROOT, encoding: 'utf8' })
  if (result.status !== 0 && result.status !== 2) {
    throw new ReleaseError(`tsc failed:\n${(result.stderr || result.stdout).trim()}`)
  }
  return git(['status', '--porcelain', '--', 'types']).out
}

function writeVersion(version) {
  for (const file of VERSION_FILES) {
    const full = path.join(ROOT, file)
    if (!fs.existsSync(full)) continue
    const contents = fs.readFileSync(full, 'utf8')
    const json = JSON.parse(contents)
    json.version = version
    if (json.packages?.['']) json.packages[''].version = version
    const indent = contents.match(/\n(\s+)"/)?.[1]?.length ?? 2
    fs.writeFileSync(full, `${JSON.stringify(json, null, indent)}\n`)
  }
}

async function confirm(rl, question) {
  const answer = await rl.question(`\n${question} [y/N] `)
  return /^y(es)?$/i.test(answer.trim())
}

async function main() {
  if (!target) {
    throw new ReleaseError(
      'usage: npm run release -- patch|minor|major|X.Y.Z|current [--dry-run] [--skip-tests]'
    )
  }

  const pkg = readJson('package.json')
  const current = pkg.version
  const reuse = target === 'current'
  const version = reuse ? current : nextVersion(current, target)
  if (!SEMVER.test(version)) {
    throw new ReleaseError(`"${target}" is not patch, minor, major, current or X.Y.Z`)
  }
  if (!reuse && !isNewer(version, current)) {
    throw new ReleaseError(`${version} is not newer than ${current}`)
  }

  const branch = checkTree()
  const slug = githubSlug()

  step('Checking npm and tags')
  const published = publishedVersions(pkg.name)
  if (published.includes(version)) {
    throw new ReleaseError(`${pkg.name}@${version} is already on npm`)
  }
  const newest = published.filter((v) => SEMVER.test(v)).sort((a, b) => (isNewer(a, b) ? -1 : 1))[0]
  if (newest && !isNewer(version, newest)) {
    console.log(
      `  note: npm already has ${newest}, so ${version} goes out under the release-${version.split('.').slice(0, 2).join('.')} dist-tag and "latest" stays ${newest}`
    )
  }
  const tagged = remoteTag(version)
  if (tagged) {
    throw new ReleaseError(
      `origin already has a tag ${version} (${tagged.slice(0, 12)}) but npm does not - ` +
        `rerun the workflow instead: gh workflow run ${WORKFLOW} --repo ${slug} -f tag=${version}`
    )
  }
  if (git(['rev-parse', '--verify', '--quiet', `refs/tags/${version}`], { allowFail: true }).ok) {
    throw new ReleaseError(
      `a local tag ${version} exists but is not on origin - push it (git push origin ${version}) if this script made it, ` +
        `or remove it (git tag -d ${version}); old tags from the private history stay on the "private" remote`
    )
  }
  console.log(
    `  ok: ${version} is not on npm and not tagged (npm has ${published.length ? published.join(', ') : 'nothing yet'})`
  )

  const releaseCommit = reuse ? currentReleaseCommit(pkg.files) : null

  runChecks()
  checkPack()

  const plan = reuse
    ? `tag ${releaseCommit.slice(0, 12)} as ${version} (no version change)`
    : `bump ${current} -> ${version}, regenerate types/, commit "Release core ${version}", tag ${version}`
  step('Plan')
  console.log(`  ${plan}`)
  console.log(`  push ${reuse ? '' : `${branch} and `}tag ${version} to origin (${slug})`)
  console.log(`  start ${WORKFLOW}, which publishes ${pkg.name}@${version} to npm with provenance`)

  if (DRY_RUN) {
    console.log('\n  dry run: nothing was written, tagged or pushed\n')
    return
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    if (!(await confirm(rl, `Release ${pkg.name}@${version}?`))) {
      console.log('  stopped, nothing changed')
      return
    }

    let commit = releaseCommit
    if (!reuse) {
      writeVersion(version)
      if (buildTypes()) console.log('  regenerated types/')
      git(['add', '--all', '--', ...VERSION_FILES, 'types'])
      git(['commit', '--quiet', '-m', `Release core ${version}`])
      commit = git(['rev-parse', 'HEAD']).out
      console.log(`  committed ${commit.slice(0, 12)}`)
    }
    git(['tag', '-a', version, '-m', `Core ${version}`, commit])
    console.log(`  tagged ${version}`)

    const refs = reuse ? [`refs/tags/${version}`] : [branch, `refs/tags/${version}`]
    if (!(await confirm(rl, `Push ${refs.join(' and ')} to origin?`))) {
      console.log(`  not pushed. Later: git push --atomic origin ${refs.join(' ')}`)
      return
    }
    git(['push', '--atomic', '--quiet', 'origin', ...refs])
    console.log('  pushed')

    if (!(await confirm(rl, `Start ${WORKFLOW} to publish ${version} to npm?`))) {
      console.log(
        `  not started. Later: gh workflow run ${WORKFLOW} --repo ${slug} -f tag=${version}`
      )
      return
    }
    run('gh', [
      'workflow',
      'run',
      WORKFLOW,
      '--repo',
      slug,
      '--ref',
      'main',
      '-f',
      `tag=${version}`
    ])
    console.log(`  started: https://github.com/${slug}/actions/workflows/${WORKFLOW}`)
    console.log(
      '  then bump the apps: node scripts/bump.js > Mobile + desktop > Use a core version from npm\n'
    )
  } finally {
    rl.close()
  }
}

main().catch((error) => {
  if (!(error instanceof ReleaseError)) throw error
  console.error(`\n  release: ${error.message}\n`)
  process.exit(1)
})
