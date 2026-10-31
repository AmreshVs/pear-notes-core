import test from 'brittle'

import {
  canInsertImageDetailsTable,
  formatImageDetails,
  imageDetailsContent,
  imageDetailsFromText
} from '../store/services/imageDetails.js'
import { buildImageDetailsTransaction } from '../store/services/localAiNoteEdits.js'

const LABELS = {
  types: { receipt: 'Receipt', card: 'Contact', notes: 'Notes from the image' },
  merchant: 'Shop',
  date: 'Date',
  total: 'Total',
  items: 'Items',
  price: 'Price',
  name: 'Name'
}

const DISHOOM =
  'Dishoom Kensington\n08/10/2026 8:14 PM\nHouse black daal £9.50\nChicken ruby £14.90\nGarlic naan x 2 £9.00\nChai x 3 £13.50\nMango lassi x 2 £10.70\nService 12.5% £7.20\nTotal £64.80\nVISA ****4417 £64.80'

test('a receipt gives merchant, date, total and priced items', (t) => {
  const details = imageDetailsFromText(
    'FRESHMART #0412\n12/09/2026 18:42\nMilk 2L 2.49\nBread sourdough 3.80\nSUBTOTAL 12.12\nVAT 5% 0.61\nTOTAL 12.73\nVISA ****4417'
  )
  t.is(details.type, 'receipt')
  t.alike(details.fields, [
    ['merchant', 'FRESHMART #0412'],
    ['date', '12/09/2026 · 18:42'],
    ['total', '12.73']
  ])
  t.alike(details.items, [
    { label: 'Milk 2L', amount: '2.49', charge: false },
    { label: 'Bread sourdough', amount: '3.80', charge: false },
    { label: 'VAT 5%', amount: '0.61', charge: true }
  ])
  t.alike(details.check, { addsUp: false, itemsTotal: '6.90' })
})

test('items plus service add up to the total', (t) => {
  const details = imageDetailsFromText(DISHOOM)
  t.is(details.items.length, 6, 'the card payment line is not an item')
  t.ok(details.items.at(-1).charge)
  t.alike(details.check, { addsUp: true, itemsTotal: '£64.80' })
})

test('items that already include the tax still add up', (t) => {
  const details = imageDetailsFromText('CAFE\nTea 2,50\nCake 3,50\nVAT 1,00\nTOTAL 6,00')
  t.alike(details.check, { addsUp: true, itemsTotal: '6,00' })
})

test('a business card gives contact fields', (t) => {
  const details = imageDetailsFromText(
    'Priya Raman\nHead of Product\nNorthwind Labs\n+44 20 7946 0958\npriya@northwind.io\nnorthwind.io'
  )
  t.is(details.type, 'card')
  t.alike(details.fields, [
    ['name', 'Priya Raman'],
    ['jobTitle', 'Head of Product'],
    ['company', 'Northwind Labs'],
    ['phone', '+44 20 7946 0958'],
    ['email', 'priya@northwind.io'],
    ['website', 'northwind.io']
  ])
  t.is(details.check, null)
  t.ok(canInsertImageDetailsTable(details))
})

test('anything else is kept as points', (t) => {
  const details = imageDetailsFromText('Sprint 14 goals\n- ship offline sync fix\nOwner: Priya')
  t.is(details.type, 'notes')
  t.is(details.items.length, 3)
  t.is(details.items[1].label, 'ship offline sync fix')
  t.absent(canInsertImageDetailsTable(details))
})

test('a receipt with each price on its own line still reads', (t) => {
  const details = imageDetailsFromText('FRESHMART\nMilk 2L\n2.49\nTOTAL\n12.73')
  t.is(details.type, 'receipt')
  t.alike(details.items, [{ label: 'Milk 2L', amount: '2.49', charge: false }])
  t.is(details.fields.find(([key]) => key === 'total')[1], '12.73')
})

test('text and table content', (t) => {
  const details = imageDetailsFromText('FRESHMART\nMilk 2L 2.49\nTOTAL 2.49')
  t.is(
    formatImageDetails(details, LABELS),
    'Receipt\nShop: FRESHMART\nTotal: 2.49\nItems\n- Milk 2L — 2.49'
  )
  const text = imageDetailsContent(details, LABELS)
  t.alike(
    text.map((block) => block.type),
    ['paragraph', 'paragraph', 'paragraph', 'paragraph', 'bulletList']
  )
  const table = imageDetailsContent(details, LABELS, { table: true })
  t.alike(
    table.map((block) => block.type),
    ['paragraph', 'table', 'table']
  )
  t.is(table[1].content[0].content[0].type, 'tableHeader')
  t.is(table[2].content.length, 2, 'a header row and one item')
  const notes = imageDetailsContent(imageDetailsFromText('one\ntwo'), LABELS, { table: true })
  t.alike(
    notes.map((block) => block.type),
    ['paragraph', 'bulletList'],
    'points never become a table'
  )
})

function fakeState(blocks) {
  const ops = []
  const sizes = blocks.map((block) => block.size)
  const state = {
    schema: {
      nodeFromJSON(json) {
        if (json.type === 'unknown') throw new Error('Unknown node type')
        return json
      }
    },
    doc: {
      content: { size: sizes.reduce((sum, size) => sum + size, 0) },
      descendants(callback) {
        let pos = 0
        for (const block of blocks) {
          if (block.image)
            callback({ type: { name: 'image' }, attrs: block.attrs, nodeSize: block.size }, pos)
          pos += block.size
        }
      },
      resolve: () => ({ depth: 0 })
    },
    get tr() {
      return {
        insert: (pos, nodes) => ops.push(['insert', pos, nodes.length]),
        delete: (from, to) => ops.push(['delete', from, to])
      }
    }
  }
  return { state, ops }
}

test('details go right after the image, and replace it when the photo is off', (t) => {
  const blocks = [{ size: 5 }, { size: 1, image: true, attrs: { src: 'a' } }, { size: 4 }]
  const keep = fakeState(blocks)
  t.alike(
    buildImageDetailsTransaction(keep.state, { src: 'a', blocks: [{ type: 'paragraph' }] })
      .removedImage,
    false
  )
  t.alike(keep.ops, [['insert', 6, 1]])
  const drop = fakeState(blocks)
  buildImageDetailsTransaction(drop.state, {
    src: 'a',
    blocks: [{ type: 'paragraph' }],
    keepImage: false
  })
  t.alike(drop.ops, [
    ['insert', 6, 1],
    ['delete', 5, 6]
  ])
  const missing = fakeState(blocks)
  buildImageDetailsTransaction(missing.state, {
    src: 'gone',
    blocks: [{ type: 'paragraph' }],
    keepImage: false
  })
  t.alike(missing.ops, [['insert', 10, 1]], 'no image: appended, nothing deleted')
  t.is(buildImageDetailsTransaction(keep.state, { src: 'a', blocks: [{ type: 'unknown' }] }), null)
})
