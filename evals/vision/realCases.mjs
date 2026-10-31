// Real images for realVisionEval.mjs. They are not committed (store screenshots, Apple sample
// photos); put them in evals/vision/real/<id>.png:
//   ios-*   Resources/New screenshots/iOS/<name>.png       and-*  .../Android/<name>.png
//   desk-*  Resources/New screenshots/Desktop/<name>.png   photo-N  iOS Simulator DCIM IMG_000N
//   stitched-long  ios-Activity-Log above ios-Encrypted-Backups (magick -append, 1206 wide)
//   receipt-long   Menlo 22pt receipt rendered at 160% (see the 2026-10-15 notes in README)
//   user-arabic-loop  the user's screenshot of the looping Extract text sheet (2026-10-15)
// `facts` are strings a correct transcription contains; empty means "no text, expect nothing".
// `about` words: a caption must use at least one.
export const REAL_CASES = [
  {
    id: 'ios-Ask-AI',
    facts: [
      'Books to Read',
      'Kaliane Bradley',
      'Sally Rooney',
      'Demon Copperhead',
      'Apply changes',
      'Ask about this note'
    ],
    about: ['book', 'note', 'read', 'app', 'screen', 'list']
  },
  {
    id: 'ios-Activity-Log',
    facts: [
      'Record activity',
      '90 days',
      '31 entries',
      '11.4 KB',
      'Clear activity log',
      '13 saves'
    ],
    about: ['activity', 'log', 'setting', 'screen', 'app']
  },
  {
    id: 'ios-AI-Tools',
    facts: [
      'AI tools',
      'Fix grammar and spelling',
      'Make shorter',
      'Make friendlier',
      'Key points',
      'Summarize selection'
    ],
    about: ['ai', 'tool', 'menu', 'option', 'screen', 'app']
  },
  {
    id: 'ios-Encrypted-Backups',
    facts: [
      'Backup / restore',
      'Create backup',
      'Restore data',
      'Password protected and encrypted',
      'Notes size',
      '2.2 MB'
    ],
    about: ['backup', 'restore', 'screen', 'app', 'setting']
  },
  {
    id: 'ios-Document-Scanner',
    facts: ['Position the document in view', 'Filters', 'Shutter'],
    about: ['camera', 'scan', 'document', 'shutter', 'screen']
  },
  {
    id: 'and-Notes-List',
    facts: [
      'All Notes',
      '16 NOTES',
      'Meeting — Product Sync',
      'Morning Routine',
      '3 photos',
      'Receipts'
    ],
    about: ['note', 'list', 'app', 'screen']
  },
  {
    id: 'and-Storage',
    facts: ['Storage', 'Notes data', 'On-disk footprint', '462.8 KB', 'Compact', '526.7 KB'],
    about: ['storage', 'screen', 'app', 'setting']
  },
  {
    id: 'desk-Storage',
    facts: ['Settings', 'Privacy & security', 'Link devices', 'Notes data', '97.0 MB', '18.1 KB'],
    about: ['storage', 'setting', 'screen', 'app', 'window']
  },
  {
    id: 'desk-Editor',
    facts: [
      'All Notes',
      'Key Decisions',
      'Action Items',
      'Sprint 8',
      'follow-up sync for next Tuesday',
      'Edited Today at 11:44 am'
    ],
    about: ['note', 'app', 'editor', 'meeting', 'window']
  },
  {
    id: 'user-arabic-loop',
    facts: ['160 words found', '18 s', '11:50'],
    about: ['screen', 'text', 'arabic', 'dark', 'list', 'phone']
  },
  {
    id: 'stitched-long',
    facts: [
      'Record activity',
      '31 entries',
      '13 saves',
      'Create backup',
      'Password protected and encrypted',
      '2.2 MB'
    ],
    about: ['activity', 'backup', 'screen', 'app']
  },
  {
    id: 'receipt-long',
    facts: ['CORNER GROCER', 'Cheddar 400g', '4.75', 'Coffee beans 250g', '6.50', '43.83', '8820'],
    about: ['receipt', 'grocery', 'shopping']
  },
  { id: 'photo-1', facts: [], about: ['flower', 'plant', 'beach', 'grass', 'dune'] },
  { id: 'photo-2', facts: [], about: ['leaf', 'leaves', 'plant', 'tree', 'green'] },
  { id: 'photo-3', facts: [], about: ['waterfall', 'river', 'rock', 'cliff'] },
  { id: 'photo-4', facts: [], about: ['water', 'waterfall', 'rock', 'stream', 'moss'] },
  { id: 'photo-5', facts: [], about: ['waterfall', 'cliff', 'valley', 'mist'] },
  { id: 'photo-6', facts: [], about: ['flower', 'pink', 'purple', 'bloom'] }
]
