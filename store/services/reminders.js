export const REMINDERS_PREFERENCE_KEY = 'reminders'

export async function isRemindersEnabled(api) {
  try {
    const raw = await api.getPreference({ key: REMINDERS_PREFERENCE_KEY })
    const parsed = typeof raw === 'string' && raw ? JSON.parse(raw) : raw
    return parsed?.enabled === true
  } catch {
    return false
  }
}

export const setRemindersEnabled = (api, enabled) =>
  api.updatePreference({
    key: REMINDERS_PREFERENCE_KEY,
    value: JSON.stringify({ enabled: !!enabled })
  })
