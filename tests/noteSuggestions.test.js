import test from 'brittle'

import { ALL_NOTES_KEY, RECENTLY_DELETED_KEY } from '../constant.js'
import { cleanTitleSuggestion, pickFolderSuggestion } from '../store/services/noteSuggestions.js'

const folders = {
  a: 'recipes',
  b: 'recipes',
  c: 'work',
  d: '',
  e: RECENTLY_DELETED_KEY,
  f: 'recipes'
}
const folderOf = (key) => folders[key]

test('a folder is suggested only when close neighbours agree', (t) => {
  t.is(
    pickFolderSuggestion(
      [
        { key: 'a', score: 0.8 },
        { key: 'b', score: 0.7 },
        { key: 'c', score: 0.55 }
      ],
      folderOf
    ),
    'recipes'
  )
  t.is(
    pickFolderSuggestion([{ key: 'a', score: 0.9 }], folderOf),
    null,
    'one neighbour is not enough'
  )
  t.is(
    pickFolderSuggestion(
      [
        { key: 'a', score: 0.6 },
        { key: 'b', score: 0.6 },
        { key: 'c', score: 0.62 },
        { key: 'd', score: 0.61 }
      ],
      folderOf
    ),
    null,
    'a split vote is not a suggestion'
  )
  t.is(
    pickFolderSuggestion(
      [
        { key: 'a', score: 0.45 },
        { key: 'b', score: 0.4 }
      ],
      folderOf
    ),
    null,
    'weak matches do not count'
  )
  t.is(
    pickFolderSuggestion(
      [
        { key: 'e', score: 0.9 },
        { key: 'e', score: 0.9 },
        { key: 'd', score: 0.8 }
      ],
      (key) => (key === 'd' ? ALL_NOTES_KEY : folderOf(key))
    ),
    null,
    'trash and unfiled are never suggested'
  )
})

test('titles from the model are cleaned to one short line', (t) => {
  t.is(cleanTitleSuggestion('Title: "Lisbon trip plan"'), 'Lisbon trip plan')
  t.is(cleanTitleSuggestion('**Weekly groceries**\nMore text'), 'Weekly groceries')
  t.is(cleanTitleSuggestion(''), null)
  t.ok(
    cleanTitleSuggestion('word '.repeat(40)).length <= 80,
    'long titles are trimmed like the title tool'
  )
})

test('turned-down folders stop being suggested and accepted ones need less agreement', async (t) => {
  const { pickFolderSuggestion: pick } = await import('../store/services/noteSuggestions.js')
  const hits = [
    { key: 'a', score: 0.8 },
    { key: 'b', score: 0.6 },
    { key: 'c', score: 0.6 },
    { key: 'd', score: 0.55 }
  ]
  const where = { a: 'recipes', b: 'recipes', c: 'work', d: '' }
  const folderOf = (key) => where[key]
  t.is(pick(hits, folderOf), null, 'recipes holds 55% of the weight, under the 60% bar')
  t.is(
    pick(hits, folderOf, { feedback: { folders: { recipes: { accepted: 2, dismissed: 0 } } } }),
    'recipes'
  )
  t.is(
    pick(
      [
        { key: 'a', score: 0.8 },
        { key: 'b', score: 0.7 }
      ],
      folderOf,
      {
        feedback: { folders: { recipes: { accepted: 0, dismissed: 3 } } }
      }
    ),
    null
  )
})

test('the default Untitled folder counts as unfiled; folder names are cleaned', async (t) => {
  const { defaultFolderKeys, isUnfiled, cleanFolderName, findFolderByName } =
    await import('../store/services/noteSuggestions.js')
  const folders = { a: { title: 'Untitled' }, b: { title: '  ' }, c: { title: 'Travel' } }
  const keys = defaultFolderKeys(folders)
  t.alike([...keys].sort(), ['a', 'b'])
  t.ok(isUnfiled('a', keys))
  t.absent(isUnfiled('c', keys))
  t.is(cleanFolderName('Folder: "Work meetings"'), 'Work meetings')
  t.is(cleanFolderName('Untitled'), null)
  t.is(cleanFolderName('A very long folder name that goes on and on'), null)
  t.is(findFolderByName(folders, 'travel'), 'c')
})
