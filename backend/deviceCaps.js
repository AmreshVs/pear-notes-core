// What a device's core can do, stored on its syncedDevice record as a comma-separated list.
export const SEALED_NOTES_CAP = 'sealedNotes1'

const capsOf = (caps) => (typeof caps === 'string' && caps ? caps.split(',') : [])

export const hasCap = (caps, cap) => capsOf(caps).includes(cap)

export const withCap = (caps, cap) => (hasCap(caps, cap) ? caps : [...capsOf(caps), cap].join(','))

export const hasSealedNotesCap = (caps) => hasCap(caps, SEALED_NOTES_CAP)
