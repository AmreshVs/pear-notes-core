const ATTACHMENT_TAG = /<div\b[^>]*\bdata-file-attachment\b[^>]*>/gi
const PDF_NAME = /\.pdf$/i
const PDF_TYPE = 'application/pdf'

const attr = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'))?.[1] ?? ''

export const isPdfFile = (fileName, fileType) =>
  String(fileType ?? '').toLowerCase() === PDF_TYPE || PDF_NAME.test(String(fileName ?? ''))

/** The PDF attachments in a note's HTML, as written by the editor. */
export function pdfAttachmentsIn(html) {
  const found = []
  for (const [tag] of String(html ?? '').matchAll(ATTACHMENT_TAG)) {
    const fileName = attr(tag, 'filename')
    if (!isPdfFile(fileName, attr(tag, 'filetype'))) continue
    found.push({
      fileName,
      url: attr(tag, 'url').replace(/&amp;/g, '&'),
      size: Number(attr(tag, 'filesize')) || 0
    })
  }
  return found
}

/** Text of every PDF attached to the note, each under its file name; '' when none can be read. */
export async function noteAttachmentText(value, { resolveUrl, readPdf, maxBytes = Infinity }) {
  const parts = []
  for (const { fileName, url, size } of pdfAttachmentsIn(value?.note)) {
    if (size > maxBytes) continue
    const resolved = resolveUrl(url)
    if (!resolved) continue
    const text = await readPdf(resolved, fileName).catch(() => '')
    if (text) parts.push(`${fileName}\n${text}`)
  }
  return parts.join('\n\n')
}
