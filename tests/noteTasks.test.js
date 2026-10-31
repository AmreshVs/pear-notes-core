import test from 'brittle'

import {
  isAppointment,
  countOpenUpcoming,
  extractNoteTasks,
  getNoteFindings,
  groupUpcoming,
  parseDue,
  splitYearly,
  taskDoneId
} from '../store/services/noteTasks.js'

// Saturday 10 October 2026, 09:00 local.
const ANCHOR = new Date(2026, 9, 10, 9, 0).getTime()

const para = (text) => `<p>${text}</p>`
const item = (text, checked = false) =>
  `<li data-checked="${checked}" data-type="taskItem"><label><input type="checkbox"${checked ? ' checked' : ''}><span></span></label><div><p>${text}</p></div></li>`
const list = (...items) => `<ul data-type="taskList">${items.join('')}</ul>`

// [html, expected tasks as [date, time] or [] when nothing should be found]
const CASES = [
  [para('Call Sam Friday 5pm'), [['2026-10-16', '17:00']]],
  [para('Dentist on Oct 21 at 9:15'), [['2026-10-21', '09:15']]],
  [para('Pay council tax by 31 October'), [['2026-10-31', null]]],
  [para('Submit the expense report tomorrow'), [['2026-10-11', null]]],
  [para('Book flights to Lisbon next week'), [['2026-10-12', null]]],
  [para('Meeting with Priya on Tuesday at 10am'), [['2026-10-13', '10:00']]],
  [para('Renew passport in 2 weeks'), [['2026-10-24', null]]],
  [para('Flight EK 2041 on 2026-11-03 at 07:55'), [['2026-11-03', '07:55']]],
  [para('Pick up dry cleaning today'), [['2026-10-10', null]]],
  [para('Interview at Monzo, Thursday 14:30'), [['2026-10-15', '14:30']]],
  [para('Send the deck to Ana before Monday'), [['2026-10-12', null]]],
  [para('Remind me to water plants on Sunday'), [['2026-10-11', null]]],
  [list(item('Buy a birthday gift for Mum by Oct 18')), [['2026-10-18', null]]],
  [list(item('Return library books Wednesday')), [['2026-10-14', null]]],
  [list(item('Pay rent Oct 1')), [['2026-10-01', null]]],
  [list(item('Order paint, done Oct 3', true)), []],
  [list(item('Email the landlord')), []],
  [para('Remind to pay on 20/12/2026'), [['2026-12-20', null]]],
  [para('Pay rent 20.12.2026'), [['2026-12-20', null]]],
  [para('- Internet bill due 05/11/26'), [['2026-11-05', null]]],
  [para('[ ] Pay EMI on the 5th'), [['2026-11-05', null]]],
  [para('Submit the claim by end of month'), [['2026-10-31', null]]],
  [para('Renew the car insurance in a month'), [['2026-11-10', null]]],
  [para('Score was 3/11 at half time'), []],
  [para('Version 2.4.10 shipped'), []],
  [para('We met on Friday and talked about the budget.'), []],
  [para('Last Tuesday was a long day.'), []],
  [para('The project started in March 2024 and went well.'), []],
  [para('Revenue grew 12% in October.'), []],
  [para('My birthday is in June.'), []],
  [para('She called me yesterday about the lease.'), []],
  [para('Version 2.4 shipped.'), []],
  [para('Recipe: bake at 180 for 25 minutes.'), []],
  [para('Thursday Next is a book character I like reading about on weekends.'), []],
  [para('Monday mornings are the worst, honestly.'), []],
  [para('It happened on 3 May, two years ago.'), []],
  [para('The meeting was moved, we had it on Wednesday.'), []],
  [para('Total: 12.73, paid with VISA 4417'), []],
  [para('Room 204, floor 3'), []],
  [para('Wifi password is Kestrel-2291'), []]
]

test('tasks and dates are found with precision of at least 0.9', (t) => {
  let found = 0
  let correct = 0
  let expected = 0
  const misses = []
  for (const [html, want] of CASES) {
    const got = extractNoteTasks(html, { anchor: ANCHOR })
      .filter((task) => !task.done)
      .map((task) => [task.date, task.time])
    expected += want.length
    found += got.length
    const ok = got.filter((pair) => want.some((w) => w[0] === pair[0] && w[1] === pair[1])).length
    correct += ok
    if (ok !== got.length || got.length !== want.length) misses.push({ html, want, got })
  }
  const precision = found ? correct / found : 1
  const recall = expected ? correct / expected : 1
  t.comment(
    `precision ${precision.toFixed(2)} recall ${recall.toFixed(2)} (${misses.length} misses)`
  )
  for (const miss of misses) t.comment(JSON.stringify(miss))
  t.ok(precision >= 0.9, 'precision ≥ 0.9')
  t.ok(recall >= 0.75, 'recall ≥ 0.75')
})

test('parseDue reads common spellings and ignores impossible dates', (t) => {
  t.is(parseDue('Feb 30', ANCHOR), null)
  t.is(parseDue('on the 3rd of December', ANCHOR).date, '2026-12-03')
  t.is(parseDue('Jan 5', ANCHOR).date, '2027-01-05', 'a passed month means next year')
  t.is(parseDue('noon tomorrow', ANCHOR).time, '12:00')
  t.is(parseDue('at 7 tonight', ANCHOR).time, '19:00')
})

test('parseDue reads numeric and relative dates', (t) => {
  t.is(parseDue('pay on 20/12/2026', ANCHOR).date, '2026-12-20')
  t.is(parseDue('pay on 20-12-2026', ANCHOR).date, '2026-12-20')
  t.is(parseDue('pay on 2026/12/20', ANCHOR).date, '2026-12-20')
  t.is(parseDue('pay on 12/20/2026', ANCHOR).date, '2026-12-20', 'a part over 12 settles the order')
  t.is(parseDue('pay on 05/06/2026', ANCHOR).date, '2026-06-05', 'day first by default')
  t.is(parseDue('pay on 05/06/2026', ANCHOR, { order: 'month-first' }).date, '2026-05-06')
  t.is(parseDue('pay by 20/12', ANCHOR).date, '2026-12-20')
  t.is(parseDue('pay 20-Dec-2026', ANCHOR).date, '2026-12-20')
  t.is(
    parseDue('Monday, 20/12/2026', ANCHOR).date,
    '2026-12-20',
    'the written date beats the weekday'
  )
  t.is(parseDue('day after tomorrow', ANCHOR).date, '2026-10-12')
  t.is(parseDue('tmrw 6pm', ANCHOR).time, '18:00')
  t.is(parseDue('in two weeks', ANCHOR).date, '2026-10-24')
  t.is(parseDue('next weekend', ANCHOR).date, '2026-10-17')
  t.is(parseDue('due on the 5th', ANCHOR).date, '2026-11-05')
  t.is(parseDue('pay on 31/02/2026', ANCHOR), null)
})

test('past plain lines move to Past for a week; undone checkboxes are overdue', (t) => {
  const tasks = [
    { text: 'a', date: '2026-10-09', time: null, checklist: true },
    { text: 'b', date: '2026-10-09', time: null, checklist: false },
    { text: 'c', date: '2026-10-10', time: '17:00', checklist: false },
    { text: 'd', date: '2026-10-10', time: '09:00', checklist: false },
    { text: 'e', date: '2026-10-11', time: null, checklist: true },
    { text: 'f', date: '2026-10-14', time: null, checklist: true },
    { text: 'g', date: '2026-12-01', time: null, checklist: true },
    { text: 'h', date: '2026-10-02', time: null, checklist: false }
  ]
  t.alike(
    groupUpcoming(tasks, ANCHOR).map(({ group, items }) => [group, items.map((task) => task.text)]),
    [
      ['overdue', ['a']],
      ['today', ['c']],
      ['tomorrow', ['e']],
      ['thisWeek', ['f']],
      ['later', ['g']],
      ['past', ['d', 'b']]
    ]
  )
  t.is(countOpenUpcoming(groupUpcoming(tasks, ANCHOR)), 5)
})

test('birthdays written with the birth year come round every year', (t) => {
  const birthdays = [
    para('Mum - 21 October 1962'),
    para('Sam: Nov 2, 1990'),
    para('Ana 1988-03-05'),
    para('Leo - Oct 12')
  ].join('')
  const found = extractNoteTasks(birthdays, { anchor: ANCHOR, title: 'Birthdays' })
  t.alike(
    found.map((task) => [task.text, task.yearly, task.sinceYear]),
    [
      ['Mum - 21 October 1962', true, 1962],
      ['Sam: Nov 2, 1990', true, 1990],
      ['Ana 1988-03-05', true, 1988],
      ['Leo - Oct 12', true, null]
    ]
  )
  const grouped = groupUpcoming(found, ANCHOR)
  t.alike(
    grouped.map(({ group, items }) => [group, items.map((task) => task.date)]),
    [
      ['thisWeek', ['2026-10-12']],
      ['later', ['2026-10-21', '2026-11-02', '2027-03-05']]
    ],
    'every birthday shows; a passed one waits for next year'
  )
  t.is(countOpenUpcoming(grouped), 3, 'one more than a month away is listed but not counted')
  const cue = extractNoteTasks(para("Priya's birthday 14 Oct 1991"), { anchor: ANCHOR })
  t.is(cue[0].yearly, true, 'the line alone can say it is yearly')
  const gift = extractNoteTasks(list(item('Buy a birthday gift for Mum by Oct 18')), {
    anchor: ANCHOR
  })
  t.absent(gift[0].yearly, 'an errand about a birthday is a one-off')
  const leap = groupUpcoming(
    [{ text: 'x', date: '2000-02-29', time: null, checklist: false, yearly: true }],
    new Date(2027, 1, 20).getTime()
  )
  t.is(leap[0].items[0].date, '2027-02-28', 'Feb 29 falls on Feb 28 outside leap years')
})

test('yearly names drop the date; splitYearly keeps to-dos clear of birthdays', (t) => {
  const note = [
    para('Mum - 21 October 1962'),
    para('Sam: Nov 2, 1990'),
    para('Ana 1988-03-05'),
    para('Ravi (11/10/1990)'),
    para('Mom & Dad anniversary, 12 Oct 1986'),
    para('Priya DOB: 15/10/1994')
  ].join('')
  const found = extractNoteTasks(note, { anchor: ANCHOR, title: 'Birthdays' })
  t.alike(
    found.map((task) => task.name),
    ['Mum', 'Sam', 'Ana', 'Ravi', 'Mom & Dad anniversary', 'Priya'],
    'text keeps the whole line, name drops the date'
  )
  t.is(found[0].text, 'Mum - 21 October 1962')

  const tasks = [
    ...found.map((task) => ({ ...task, noteKey: 'b' })),
    { text: 'Call Sam today', date: '2026-10-10', time: null, checklist: false, noteKey: 'a' },
    { text: 'Book train', date: '2026-10-14', time: null, checklist: true, noteKey: 'a' },
    { text: 'Car service', date: '2026-11-20', time: null, checklist: true, noteKey: 'a' }
  ]
  const { groups, yearly } = splitYearly(groupUpcoming(tasks, ANCHOR))
  t.alike(
    groups.map(({ group, items }) => [group, items.map((task) => task.name ?? task.text)]),
    [
      ['today', ['Call Sam today']],
      ['tomorrow', ['Ravi']],
      ['thisWeek', ['Book train']],
      ['later', ['Car service']],
      ['birthdays', ['Mom & Dad anniversary', 'Priya', 'Mum', 'Sam']]
    ],
    'today and tomorrow keep their birthdays; the rest go to Birthdays, next 30 days only'
  )
  t.is(yearly.length, 6, 'the full list has every yearly date')
  t.alike(
    splitYearly([{ group: 'today', items: [tasks[6]] }]).groups.map((g) => g.group),
    ['today']
  )
})

// Written after the rules above were tuned; scored as is (M3 eval rule: never tune against it).
const HELD_OUT = [
  [para('Parents evening Thursday 6.30pm'), [['2026-10-15', '18:30']]],
  [para('Car MOT due 14 Nov'), [['2026-11-14', null]]],
  [para('Ring the bank on Monday morning'), [['2026-10-12', null]]],
  [para('Haircut Sat 11am'), [['2026-10-10', '11:00']]],
  [para('Get flu jab this week'), []],
  [list(item('Finish slides for Wed')), [['2026-10-14', null]]],
  [list(item('Collect parcel from the depot tomorrow 8am')), [['2026-10-11', '08:00']]],
  [para('Team offsite 12–14 November'), [['2026-11-12', null]]],
  [para('Doctor appointment 3/11 at 4pm'), []],
  [para('Conference talk accepted! It is on December 2nd.'), []],
  [para('I may go to the gym later.'), []],
  [para('On Friday nights we usually order pizza.'), []],
  [para('Born on 4 July 1990'), []],
  [para('Watched the match on Sunday with Leo.'), []],
  [para('Next week will be busy at work'), []],
  [para('The sale ends today, 20% off.'), []],
  [para('Q4 targets: 1.2M by December'), []],
  [para('Train at 7:42 from platform 3, every weekday'), []]
]

test('held-out task cases (reported, threshold at the exit bar)', (t) => {
  let found = 0
  let correct = 0
  let expected = 0
  for (const [html, want] of HELD_OUT) {
    const got = extractNoteTasks(html, { anchor: ANCHOR })
      .filter((task) => !task.done)
      .map((task) => [task.date, task.time])
    expected += want.length
    found += got.length
    const ok = got.filter((pair) => want.some((w) => w[0] === pair[0] && w[1] === pair[1])).length
    correct += ok
    if (ok !== got.length || got.length !== want.length)
      t.comment(JSON.stringify({ html, want, got }))
  }
  const precision = found ? correct / found : 1
  t.comment(`held-out precision ${precision.toFixed(2)} recall ${(correct / expected).toFixed(2)}`)
  t.ok(precision >= 0.9, 'precision ≥ 0.9')
})

test('reminders fire once at the task time, or 9:00 for a date alone', async (t) => {
  const { dueReminders } = await import('../store/services/noteTasks.js')
  const at = (h, m = 0) => new Date(2026, 9, 16, h, m).getTime()
  const tasks = [
    { noteKey: 'a', text: 'Call Sam', date: '2026-10-16', time: '17:00' },
    { noteKey: 'b', text: 'Pay rent', date: '2026-10-16', time: null }
  ]
  t.alike(
    dueReminders(tasks, { since: at(8, 59), now: at(9, 0) }).map((x) => x.noteKey),
    ['b']
  )
  t.alike(dueReminders(tasks, { since: at(9, 0), now: at(9, 1) }), [], 'not twice')
  t.alike(
    dueReminders(tasks, { since: at(16, 59), now: at(17, 0) }).map((x) => x.noteKey),
    ['a']
  )
  t.alike(dueReminders(tasks, { since: at(0), now: at(19) }), [], 'no backlog after hours away')
})

test('phone reminders cover the next two weeks, soonest first', async (t) => {
  const { buildReminderItems } = await import('../store/services/noteTasks.js')
  const now = new Date(2026, 9, 10, 9).getTime()
  const items = buildReminderItems(
    [
      { noteKey: 'a', text: 'Later', date: '2026-10-30', time: null },
      { noteKey: 'b', text: 'Soon', date: '2026-10-11', time: '08:30' },
      { noteKey: 'c', text: 'Past', date: '2026-10-09', time: null }
    ],
    { now, linkFor: (task) => `pearnotes://note/${task.noteKey}`, bodyFor: () => 'Note' }
  )
  t.alike(
    items.map((item) => item.title),
    ['Soon']
  )
  t.is(items[0].url, 'pearnotes://note/b')
})

test('a checklist item is ticked and unticked in the note by its text', async (t) => {
  const { setChecklistItemChecked } = await import('../store/services/noteTasks.js')
  const html = list(item('Pay rent Friday'), item('Call Sam Friday 5pm & book'))
  const ticked = setChecklistItemChecked(html, 'Call Sam Friday 5pm & book', true)
  t.ok(ticked.includes('data-checked="true"'))
  t.is(ticked.split('data-checked="true"').length, 2, 'only that item')
  const found = extractNoteTasks(ticked, { anchor: ANCHOR })
  t.alike(
    found.map((task) => [task.text, !!task.done]),
    [
      ['Pay rent Friday', false],
      ['Call Sam Friday 5pm & book', true]
    ]
  )
  t.is(setChecklistItemChecked(ticked, 'Call Sam Friday 5pm & book', false), html)
  t.is(setChecklistItemChecked(html, 'Not there', true), null)
})

test('done items move to Completed and stop reminding', async (t) => {
  const { taskDoneId, dueReminders } = await import('../store/services/noteTasks.js')
  const tasks = [
    { noteKey: 'n', text: 'a', date: '2026-10-11', time: null, checklist: false },
    { noteKey: 'n', text: 'b', date: '2026-10-11', time: null, checklist: true, done: true }
  ]
  const doneIds = new Set([taskDoneId(tasks[0])])
  t.alike(
    groupUpcoming(tasks, ANCHOR, { doneIds }).map(({ group, items }) => [
      group,
      items.map((task) => task.text)
    ]),
    [['completed', ['b', 'a']]]
  )
  const at = new Date(2026, 9, 11, 9, 0).getTime()
  t.is(dueReminders(tasks, { since: at - 1000, now: at, doneIds }).length, 0)
})

test('reminders fire at each chosen offset; untimed tasks only take day offsets', async (t) => {
  const { reminderTimes, normalizeReminderPrefs } = await import('../store/services/noteTasks.js')
  const prefs = { offsets: [0, 10, 1440, 7], untimed: '08:00' }
  t.alike(normalizeReminderPrefs(prefs), { offsets: [0, 10, 1440], untimed: '08:00' })
  const timed = { date: '2026-10-16', time: '17:00' }
  const at = new Date(2026, 9, 16, 17, 0).getTime()
  t.alike(
    reminderTimes(timed, prefs).map((r) => [r.offset, r.atMs]),
    [
      [0, at],
      [10, at - 600000],
      [1440, at - 86400000]
    ]
  )
  const untimed = { date: '2026-10-16', time: null }
  t.alike(
    reminderTimes(untimed, { offsets: [10] }).map((r) => r.offset),
    [0],
    'no time and no day offset still reminds on the day'
  )
  t.is(reminderTimes(untimed, prefs)[0].atMs, new Date(2026, 9, 16, 8, 0).getTime())
})

test('a list of old dates is read as birthdays, numeric dates included', (t) => {
  const html = ['Mum 21/10/1962', 'Dad 03.02.60', 'Ana 22-07-1991', 'Leo Oct 12, 1988']
    .map(para)
    .join('')
  const found = extractNoteTasks(html, { anchor: ANCHOR, title: 'Family' })
  t.alike(
    found.map((task) => [task.date.slice(5), task.yearly, task.sinceYear]),
    [
      ['10-21', true, 1962],
      ['02-03', true, 1960],
      ['07-22', true, 1991],
      ['10-12', true, 1988]
    ]
  )
  t.alike(extractNoteTasks(para('Final score 3/11 on 2/10/2019'), { anchor: ANCHOR }), [])
  const log = ['2026-10-01 standup', '2026-10-02 retro', '2026-10-05 planning'].map(para).join('')
  t.absent(
    extractNoteTasks(log, { anchor: ANCHOR }).some((task) => task.yearly),
    'recent dated entries are not birthdays'
  )
})

test('birth dates are found by other wordings too', (t) => {
  for (const line of [
    "Priya's b'day 14/11/1991",
    'Ravi birth date 03/02/1985',
    'Meena DOB: 21-06-1979',
    'Date of birth of Kiran 05.09.2001'
  ]) {
    const [task] = extractNoteTasks(para(line), { anchor: ANCHOR })
    t.ok(task?.yearly, line)
  }
  t.absent(extractNoteTasks(para('Stubborn bug 12/10'), { anchor: ANCHOR })[0]?.yearly)
})

test('a birthday written as a checklist item with its birth year recurs on that date', (t) => {
  const item = (text, checked = false) =>
    `<ul data-type="taskList"><li data-type="taskItem" data-checked="${checked}"><p>${text}</p></li></ul>`
  const html = [
    para('Aditi - 26/12/2023'),
    item('Sam birthday tomorrow - 12/10/1997'),
    item('Book the cake tomorrow'),
    item('Party 20/10/2026')
  ].join('')
  const found = extractNoteTasks(html, { anchor: ANCHOR, title: 'Birthdays' })
  const sam = found.find((task) => task.text.startsWith('Sam'))
  t.alike(
    [sam.date, sam.yearly, sam.checklist],
    ['1997-10-12', true, false],
    'the written date wins'
  )
  t.ok(
    found.find((task) => task.text.startsWith('Party'))?.checklist,
    'a checklist item dated this year stays a checklist task'
  )
})

test('note findings: open dated tasks from today on, plain lines flagged', (t) => {
  const now = new Date(2026, 9, 9, 10, 0).getTime()
  const html = [
    '<p>Budget draft to Maya by Oct 12.</p>',
    '<p>Need to pay the deposit by Oct 16 or we lose the date.</p>',
    '<p>Dentist was on Oct 2.</p>',
    '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Book the coach by Oct 14</p></li>',
    '<li data-type="taskItem" data-checked="true"><p>Send invites by Oct 13</p></li></ul>'
  ].join('')
  const found = getNoteFindings(html, { noteKey: 'n', anchor: now, now })
  t.alike(
    found.map((task) => [task.date, task.checklist]),
    [
      ['2026-10-12', false],
      ['2026-10-14', true],
      ['2026-10-16', false]
    ]
  )
  const doneIds = new Set([taskDoneId(found[0])])
  t.is(getNoteFindings(html, { noteKey: 'n', anchor: now, now, doneIds }).length, 2, 'marked done')
})

test('a timed line that is not an action reads as an appointment', (t) => {
  const task = (text, extra = {}) => ({
    text,
    date: '2026-10-14',
    time: '08:30',
    checklist: false,
    ...extra
  })
  t.ok(isAppointment(task('Dentist, Dr. Okafor')))
  t.absent(isAppointment(task('Call the dentist')))
  t.absent(isAppointment(task('Dentist', { time: null })))
  t.absent(isAppointment(task('Dentist', { checklist: true })))
  t.absent(isAppointment(task('Dentist', { done: true })))
})
