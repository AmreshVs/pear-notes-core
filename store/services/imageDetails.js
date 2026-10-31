// Receipt, business card and note details read from an image's transcribed
// text by code: the vision model only transcribes, which it does reliably.

export const IMAGE_DETAILS_TYPE = Object.freeze({
  RECEIPT: 'receipt',
  CARD: 'card',
  NOTES: 'notes'
})

const PRICE = /(?:[$€£¥₹]|AED|EUR|USD|GBP)?\s?\d{1,6}(?:[.,]\d{2})(?!\d)/i
const AMOUNT = /(\d{1,6})[.,](\d{2})(?!\d)/
const TOTAL_LINE = /\b(?:grand\s+)?total\b|\bamount\s+due\b|\bbalance\b/i
const SUBTOTAL_LINE = /\bsub\s?-?total\b/i
const CHARGE_LINE = /\bvat\b|\btax\b|\btip\b|\bservice\b|\bgratuity\b/i
const PAYMENT_LINE = /\b(?:cash|change|tendered|visa|mastercard|amex)\b/i
const DATE =
  /\b(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{4})\b/
const TIME = /\b\d{1,2}:\d{2}(?:\s?[AaPp][Mm])?\b/
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/
const PHONE = /(?:\+?\d[\d\s().-]{6,}\d)/
const WEBSITE =
  /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|io|org|net|co|uk|de|fr|ae|in|app|dev)\b(?:\/\S*)?/i
const CARD_HINT = /\b(?:ltd|llc|inc|gmbh|labs|studio|group|company|co\.)\b/i

const priceIn = (line) => line.match(new RegExp(`${PRICE.source}\\s*$`, 'i'))?.[0]?.trim() ?? null

const toCents = (price) => {
  const match = String(price ?? '').match(AMOUNT)
  return match ? Number(match[1]) * 100 + Number(match[2]) : null
}

const withAmount = (price, cents) =>
  price.replace(AMOUNT, (match) => {
    const separator = match.includes(',') ? ',' : '.'
    return `${Math.floor(cents / 100)}${separator}${String(cents % 100).padStart(2, '0')}`
  })

function receiptCheck(items, total) {
  const totalCents = toCents(total)
  const bought = items.filter((item) => !item.charge)
  if (!bought.length || totalCents === null) return null
  const sum = (list) => list.reduce((cents, item) => cents + (toCents(item.amount) ?? 0), 0)
  const itemsCents = sum(bought)
  const withCharges = itemsCents + sum(items.filter((item) => item.charge))
  const addsUp = itemsCents === totalCents || withCharges === totalCents
  return { addsUp, itemsTotal: withAmount(total, addsUp ? totalCents : withCharges) }
}

function receiptDetails(lines) {
  const totalLine = [...lines]
    .reverse()
    .find((line) => TOTAL_LINE.test(line) && !SUBTOTAL_LINE.test(line))
  if (!totalLine || !priceIn(totalLine)) return null
  const total = priceIn(totalLine)
  const fields = []
  fields.push(['merchant', lines[0]])
  const joined = lines.join(' ')
  const date = joined.match(DATE)?.[0]
  const time = joined.match(TIME)?.[0]
  if (date) fields.push(['date', time ? `${date} · ${time}` : date])
  fields.push(['total', total])
  const items = lines
    .slice(1)
    .filter(
      (line) =>
        line !== totalLine &&
        priceIn(line) &&
        !TOTAL_LINE.test(line) &&
        !SUBTOTAL_LINE.test(line) &&
        !PAYMENT_LINE.test(line)
    )
    .map((line) => {
      const amount = priceIn(line)
      const label = line
        .slice(0, line.lastIndexOf(amount))
        .replace(/[\s.:—-]+$/, '')
        .trim()
      return { label, amount, charge: CHARGE_LINE.test(line) }
    })
  return { type: IMAGE_DETAILS_TYPE.RECEIPT, fields, items, check: receiptCheck(items, total) }
}

function cardDetails(lines) {
  const email = lines.join(' ').match(EMAIL)?.[0]
  const phoneLine = lines.find((line) => PHONE.test(line) && !EMAIL.test(line))
  if (!email && !phoneLine) return null
  if (lines.length > 9) return null
  const contact = (line) =>
    EMAIL.test(line) ||
    (PHONE.test(line) && /\d{6,}/.test(line.replace(/\D/g, ''))) ||
    WEBSITE.test(line)
  const rest = lines.filter((line) => !contact(line))
  const fields = []
  if (rest[0]) fields.push(['name', rest[0]])
  const company = rest.slice(1).find((line) => CARD_HINT.test(line)) ?? rest[2]
  const title = rest.slice(1).find((line) => line !== company)
  if (title) fields.push(['jobTitle', title])
  if (company) fields.push(['company', company])
  if (phoneLine) fields.push(['phone', phoneLine.match(PHONE)[0].trim()])
  if (email) fields.push(['email', email])
  const site = lines.find((line) => WEBSITE.test(line) && !EMAIL.test(line))
  if (site) fields.push(['website', site.match(WEBSITE)[0]])
  return { type: IMAGE_DETAILS_TYPE.CARD, fields, items: [], check: null }
}

/** Details from an image's transcription: a receipt, a contact card, or plain points. */
export function imageDetailsFromText(text) {
  const lines = String(text ?? '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .reduce((joined, line) => {
      // Receipts often come back with each price on a line of its own.
      if (
        joined.length &&
        new RegExp(`^${PRICE.source}$`, 'i').test(line) &&
        !priceIn(joined.at(-1))
      ) {
        joined[joined.length - 1] = `${joined.at(-1)} ${line}`
      } else joined.push(line)
      return joined
    }, [])
  return (
    receiptDetails(lines) ??
    cardDetails(lines) ?? {
      type: IMAGE_DETAILS_TYPE.NOTES,
      fields: [],
      items: lines.map((line) => ({
        label: line.replace(/^[-•*]\s*/, ''),
        amount: null,
        charge: false
      })),
      check: null
    }
  )
}

/** Whether the details can go into a note as a table (receipts and cards). */
export const canInsertImageDetailsTable = (details) =>
  !!details && details.type !== IMAGE_DETAILS_TYPE.NOTES && details.fields.length > 0

const itemText = (item) => (item.amount ? `${item.label} — ${item.amount}` : item.label)

/** The details as note text, with labels from the app's language. */
export function formatImageDetails(details, labels) {
  const fieldLines = details.fields.map(([key, value]) => `${labels[key] ?? key}: ${value}`)
  const itemLines = details.items.map((item) => `- ${itemText(item)}`)
  return [
    labels.types?.[details.type],
    ...fieldLines,
    ...(itemLines.length ? [labels.items ?? '', ...itemLines] : [])
  ]
    .filter((line) => line !== undefined && line !== '')
    .join('\n')
}

const textNode = (text, bold) => ({
  type: 'text',
  text,
  ...(bold ? { marks: [{ type: 'bold' }] } : {})
})

const paragraph = (text, bold = false) =>
  text ? { type: 'paragraph', content: [textNode(text, bold)] } : { type: 'paragraph' }

const tableRow = (cells) => ({
  type: 'tableRow',
  content: cells.map(([text, header]) => ({
    type: header ? 'tableHeader' : 'tableCell',
    content: [paragraph(text)]
  }))
})

/** Editor blocks (Tiptap JSON) for the details, as text lines or as tables. */
export function imageDetailsContent(details, labels, { table = false } = {}) {
  if (!details) return []
  const title = labels.types?.[details.type]
  const blocks = title ? [paragraph(title, true)] : []
  const asTable = table && canInsertImageDetailsTable(details)
  if (asTable) {
    blocks.push({
      type: 'table',
      content: details.fields.map(([key, value]) => tableRow([[labels[key] ?? key, true], [value]]))
    })
  } else {
    for (const [key, value] of details.fields)
      blocks.push(paragraph(`${labels[key] ?? key}: ${value}`))
  }
  if (!details.items.length) return blocks
  if (asTable) {
    blocks.push({
      type: 'table',
      content: [
        tableRow([
          [labels.items ?? '', true],
          [labels.price ?? '', true]
        ]),
        ...details.items.map((item) => tableRow([[item.label], [item.amount ?? '']]))
      ]
    })
    return blocks
  }
  if (details.fields.length) blocks.push(paragraph(labels.items ?? ''))
  blocks.push({
    type: 'bulletList',
    content: details.items.map((item) => ({
      type: 'listItem',
      content: [paragraph(itemText(item))]
    }))
  })
  return blocks
}
