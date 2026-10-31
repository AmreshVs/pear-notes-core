import test from 'brittle'

import { FOLDER_ERROR, FOLDER_NAME_MAX_LENGTH } from '../constant.js'
import { findDuplicateFolder, normalizeFolderName, validateFolderName } from '../utils.js'

const folders = [
  { id: 'a', name: 'Work' },
  { id: 'b', name: 'Personal Notes' },
  { key: 'c', title: 'Recipes' }
]

test('normalizeFolderName - trims and collapses whitespace', (t) => {
  t.is(normalizeFolderName('  Work  '), 'Work', 'outer whitespace is trimmed')
  t.is(normalizeFolderName('My   Folder'), 'My Folder', 'inner runs collapse to one space')
  t.is(normalizeFolderName(null), '', 'null becomes an empty string')
})

test('findDuplicateFolder - matches case and whitespace insensitively', (t) => {
  t.ok(findDuplicateFolder(folders, 'work'), 'differing case is still a duplicate')
  t.ok(findDuplicateFolder(folders, '  Personal   Notes '), 'padded name is still a duplicate')
  t.ok(findDuplicateFolder(folders, 'Recipes'), 'folders keyed by key/title are matched too')
  t.absent(findDuplicateFolder(folders, 'Archive'), 'a fresh name is not a duplicate')
})

test('findDuplicateFolder - excludes the folder being renamed', (t) => {
  t.absent(
    findDuplicateFolder(folders, 'Work', 'a'),
    'renaming a folder to its own name is allowed'
  )
  t.ok(findDuplicateFolder(folders, 'Work', 'b'), 'another folder taking the name is a duplicate')
})

test('validateFolderName - rejects empty and duplicate names', (t) => {
  const empty = validateFolderName(folders, '   ')
  t.absent(empty.valid, 'a whitespace-only name is invalid')
  t.is(empty.error, FOLDER_ERROR.EMPTY_NAME, 'empty name reports EMPTY_NAME')

  const duplicate = validateFolderName(folders, 'work')
  t.absent(duplicate.valid, 'a duplicate name is invalid')
  t.is(duplicate.error, FOLDER_ERROR.DUPLICATE_NAME, 'duplicate name reports DUPLICATE_NAME')
  t.is(duplicate.name, 'work', 'the normalized name is returned for the error message')

  const ok = validateFolderName(folders, '  Travel  ')
  t.ok(ok.valid, 'a fresh name is valid')
  t.is(ok.name, 'Travel', 'the normalized name is returned')
  t.is(ok.error, null, 'no error is reported')
})

test('folder name limit is a sane length', (t) => {
  t.ok(FOLDER_NAME_MAX_LENGTH > 0, 'a positive maximum is configured')
  t.is(typeof FOLDER_NAME_MAX_LENGTH, 'number', 'the limit is numeric')
})
