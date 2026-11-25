import test from 'brittle'

import { mediaKind, selectStorageByKind } from '../store/slices/storageSlice.js'

test('media kind - a file without a name counts as a file', (t) => {
  t.is(mediaKind(null), 'file')
  t.is(mediaKind(undefined), 'file')
  t.is(mediaKind(''), 'file')
  t.is(mediaKind('Photo.PNG'), 'image')
  t.is(mediaKind('clip.mp4'), 'video')
})

test('media kind - the storage breakdown survives a nameless file', (t) => {
  const state = {
    storage: {
      notesStorageInfo: [
        {
          contentSize: 5,
          media: [
            { name: null, size: 10 },
            { name: 'a.png', size: 3 }
          ]
        }
      ]
    }
  }
  const buckets = selectStorageByKind(state)
  t.alike(buckets.file, { count: 1, size: 10 })
  t.alike(buckets.image, { count: 1, size: 3 })
})
