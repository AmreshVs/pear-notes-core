import test from 'brittle'

import { getFirstImageUrl } from '../utils.js'

test('first image prefers an image attachment over an inline image', (t) => {
  t.is(getFirstImageUrl(''), undefined)
  t.is(getFirstImageUrl('<p>no images</p>'), undefined)
  t.is(
    getFirstImageUrl('<p>x</p><img class="c" src="http://h/x?a=1&amp;b=2">'),
    'http://h/x?a=1&b=2'
  )
  t.is(
    getFirstImageUrl(
      '<img src="inline.png"><div data-file-attachment="" url="att.png" filetype="image/png"></div>'
    ),
    'att.png'
  )
  t.is(
    getFirstImageUrl(
      '<div filetype="image/jpeg" url="first.jpg"></div><div url="second.jpg" filetype="image/png"></div>'
    ),
    'first.jpg'
  )
  t.is(
    getFirstImageUrl('<div filetype="application/pdf" url="doc.pdf"></div><img src="pic.png">'),
    'pic.png'
  )
  t.is(getFirstImageUrl('<p>a &gt; b</p><img alt="x" src="q.png"'), 'q.png')
})

test('first image stays fast on long runs of unclosed tags', (t) => {
  const started = Date.now()
  t.is(getFirstImageUrl('<div'.repeat(50000)), undefined)
  t.is(getFirstImageUrl('<img'.repeat(50000)), undefined)
  t.ok(Date.now() - started < 200)
})
