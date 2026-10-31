import test from 'brittle'

import {
  buildLineRewriteTransaction,
  buildNoteEditsTransaction,
  findNoteEditRanges,
  stripEditMarkers
} from '../store/services/localAiNoteEdits.js'

function textNode(text) {
  return { isText: true, text, nodeSize: text.length }
}

function block(children) {
  const size = children.reduce((sum, child) => sum + child.nodeSize, 0)
  return {
    isTextblock: true,
    nodeSize: size + 2,
    forEach(callback) {
      let offset = 0
      for (const child of children) {
        callback(child, offset)
        offset += child.nodeSize
      }
    }
  }
}

function doc(blocks) {
  const size = blocks.reduce((sum, node) => sum + node.nodeSize, 0)
  return {
    content: { size },
    descendants(callback) {
      let pos = 0
      for (const node of blocks) {
        callback(node, pos)
        pos += node.nodeSize
      }
    }
  }
}

const note = doc([
  block([textNode('We met on '), textNode('Tuesday'), textNode(' again.')]),
  block([textNode('Budget 400 dollars.')])
])

test('narrows each edit to the characters that change', (t) => {
  const { ranges, missing } = findNoteEditRanges(note, [
    { find: 'on Tuesday again', replace: 'on Wednesday again' },
    { find: '400 dollars', replace: '600 dollars' },
    { find: 'absent', replace: 'x' }
  ])
  t.alike(ranges, [
    { from: 11, to: 13, text: 'Wedn' },
    { from: 34, to: 35, text: '6' }
  ])
  t.alike(missing, [{ find: 'absent', replace: 'x' }])
})

test('only matches inside the given range', (t) => {
  const { ranges } = findNoteEditRanges(note, [{ find: 'dollars', replace: 'euros' }], {
    from: 0,
    to: 20
  })
  t.is(ranges.length, 0)
})

test('changes only the first match unless the edit asks for all', (t) => {
  const repeated = doc([block([textNode('Lena met Lena.')]), block([textNode('Lena left.')])])
  t.is(findNoteEditRanges(repeated, [{ find: 'Lena', replace: 'Lee' }]).ranges.length, 1)
  t.is(findNoteEditRanges(repeated, [{ find: 'Lena', replace: 'Lee', all: true }]).ranges.length, 3)
})

test('strips the structure markers the model was shown', (t) => {
  t.alike(stripEditMarkers({ find: '- Sun cream', replace: '- Sun cream and hat' }), {
    find: 'Sun cream',
    replace: 'Sun cream and hat'
  })
  t.alike(stripEditMarkers({ find: '3. Tram tour', replace: '' }), {
    find: 'Tram tour',
    replace: ''
  })
  t.alike(stripEditMarkers({ find: '## Scope', replace: '## Plan' }), {
    find: 'Scope',
    replace: 'Plan'
  })
  t.alike(stripEditMarkers({ find: 'no marker', replace: 'still none' }), {
    find: 'no marker',
    replace: 'still none'
  })
})

test('refuses an edit that only changes the marker', (t) => {
  t.is(stripEditMarkers({ find: '- [ ] Renew passport', replace: '- [x] Renew passport' }), null)
  t.is(stripEditMarkers({ find: '- Adapter', replace: '1. Adapter' }), null)
})

test('reports a marker-only edit as missing rather than applying it', (t) => {
  const { ranges, missing } = findNoteEditRanges(note, [
    { find: '- [ ] Budget 400 dollars.', replace: '- [x] Budget 400 dollars.' }
  ])
  t.is(ranges.length, 0)
  t.is(missing.length, 1)
})

test('deleting every word of a block removes the block itself', (t) => {
  const state = {
    doc: note,
    tr: {
      deleted: [],
      inserted: [],
      insertText(text, from, to) {
        this.inserted.push({ text, from, to })
      },
      delete(from, to) {
        this.deleted.push({ from, to })
      }
    }
  }
  const { tr, applied } = buildNoteEditsTransaction(state, [
    { find: 'Budget 400 dollars.', replace: '' }
  ])
  t.is(applied, 1)
  t.alike(tr.deleted, [{ from: 26, to: 47 }])
  t.alike(tr.inserted, [])
})

const recordingState = (document) => ({
  doc: document,
  tr: {
    calls: [],
    insertText(text, from, to) {
      this.calls.push({ text, from, to })
    },
    delete(from, to) {
      this.calls.push({ from, to })
    }
  }
})

test('a line-for-line rewrite changes only the words that differ', (t) => {
  const state = recordingState(note)
  const result = buildLineRewriteTransaction(
    state,
    {},
    'We met on Tuesday again.\nBudget 400 dollars.',
    'We met on Wednesday again.\n'
  )
  t.is(result.applied, 2)
  t.alike(result.tr.calls, [
    { from: 26, to: 47 },
    { text: 'Wedn', from: 11, to: 13 }
  ])
  t.is(buildLineRewriteTransaction(state, {}, 'Something else entirely', 'x'), null)
  t.is(buildLineRewriteTransaction(state, {}, 'We met on Tuesday again.', 'One\nTwo'), null)
})

test('a rewrite never removes an inline node', (t) => {
  const photo = doc([
    block([textNode('Photo '), { isText: false, nodeSize: 1 }, textNode(' of teh hall')])
  ])
  const before = 'Photo   of teh hall'
  const fixed = buildLineRewriteTransaction(recordingState(photo), {}, before, 'Photo of the hall')
  t.is(fixed.applied, 1)
  t.is(fixed.skipped, 0)
  const dropped = buildLineRewriteTransaction(
    recordingState(photo),
    {},
    before,
    'A photo of the hall'
  )
  t.is(dropped.applied, 0)
  t.is(dropped.skipped, 1)
})
