import test from 'brittle'

import { noteAttachmentText, pdfAttachmentsIn } from '../store/services/attachmentText.js'

const html =
  '<p>x</p><div data-file-attachment="" filename="Lease.pdf" filetype="application/pdf" filesize="900" url="hyper://a?x=1&amp;y=2"></div>' +
  '<div data-file-attachment="" filename="photo.jpg" filetype="image/jpeg" url="hyper://b"></div>'

test('finds PDF attachments and reads their text', async (t) => {
  t.alike(pdfAttachmentsIn(html), [{ fileName: 'Lease.pdf', url: 'hyper://a?x=1&y=2', size: 900 }])
  const text = await noteAttachmentText(
    { note: html },
    { resolveUrl: (url) => `http://local/${url}`, readPdf: async () => 'Rent is due monthly' }
  )
  t.is(text, 'Lease.pdf\nRent is due monthly')
  t.is(
    await noteAttachmentText({ note: html }, { resolveUrl: () => null, readPdf: async () => 'x' }),
    ''
  )
})
