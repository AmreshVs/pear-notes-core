// Runs inside apply, so it must stay pure and deterministic.
export function mapActivityToNote(record) {
  if (record.targetKind !== 'note') return []
  if (!record.targetKey) return []
  if (record.event === 'note.deleted') return []
  return [record.targetKey]
}
