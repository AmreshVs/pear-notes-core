import test from 'brittle'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'

import { migrateLegacyPreferences } from '../backend/PreferenceBase.js'
import { PREFERENCE_DIR, PREFERENCE_LEGACY_DIR } from '../constant.js'

const makeRoot = (name) =>
  path.join(tmpdir(), 'pear-notes-pref-' + name + '-' + Math.random().toString(36).substring(7))

const setup = (name) => {
  const root = makeRoot(name)
  fs.mkdirSync(root, { recursive: true })
  return { root, target: path.join(root, PREFERENCE_DIR) }
}

const cleanup = (root) => fs.rmSync(root, { recursive: true, force: true })

test('fresh install has nothing to migrate', (t) => {
  const { root, target } = setup('fresh')
  migrateLegacyPreferences(root, target)
  t.alike(fs.readdirSync(root), [], 'no directories created by migration')
  cleanup(root)
})

test('chromium Preferences file does not block the preference store', (t) => {
  const { root, target } = setup('collision')
  fs.writeFileSync(path.join(root, 'Preferences'), '{"chromium":true}')
  migrateLegacyPreferences(root, target)
  t.alike(fs.readdirSync(root), ['Preferences'], 'chromium file left untouched')
  t.absent(fs.existsSync(target), 'no directory created from a file')
  cleanup(root)
})

test('legacy preference directory is migrated with its contents', (t) => {
  const { root, target } = setup('legacy')
  const legacy = path.join(root, PREFERENCE_LEGACY_DIR)
  fs.mkdirSync(legacy, { recursive: true })
  fs.writeFileSync(path.join(legacy, 'CORESTORE'), 'seed')

  migrateLegacyPreferences(root, target)

  t.alike(fs.readdirSync(root), [PREFERENCE_DIR], 'legacy directory renamed')
  t.is(fs.readFileSync(path.join(target, 'CORESTORE'), 'utf8'), 'seed', 'contents preserved')
  cleanup(root)
})

test('a legacy name that is a file is left alone', (t) => {
  const { root, target } = setup('legacyfile')
  fs.writeFileSync(path.join(root, PREFERENCE_LEGACY_DIR), 'not a directory')
  migrateLegacyPreferences(root, target)
  t.ok(fs.statSync(path.join(root, PREFERENCE_LEGACY_DIR)).isFile(), 'file untouched')
  t.absent(fs.existsSync(target), 'nothing migrated')
  cleanup(root)
})

test('an existing preference store is never overwritten by a legacy one', (t) => {
  const { root, target } = setup('both')
  fs.mkdirSync(target, { recursive: true })
  fs.writeFileSync(path.join(target, 'CORESTORE'), 'current')
  fs.mkdirSync(path.join(root, PREFERENCE_LEGACY_DIR), { recursive: true })

  migrateLegacyPreferences(root, target)

  t.is(fs.readFileSync(path.join(target, 'CORESTORE'), 'utf8'), 'current', 'current store kept')
  t.ok(fs.existsSync(path.join(root, PREFERENCE_LEGACY_DIR)), 'legacy left for inspection')
  cleanup(root)
})
