import * as log from '../../log.js'
const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)'

const STORAGE_KEYS = {
  THEME: 'pear-notes-theme',
  FOLDERS: 'pear-notes-folders',
  SETTINGS: 'pear-notes-settings'
}

export const themeStorage = {
  load: () => {
    try {
      const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME)
      return savedTheme || 'system'
    } catch (error) {
      log.error('Failed to load theme:', error)
      return 'system'
    }
  },

  save: (theme) => {
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, theme)
      return true
    } catch (error) {
      log.error('Failed to save theme:', error)
      return false
    }
  },

  apply: (theme) => {
    if (typeof document === 'undefined') return
    document.documentElement.setAttribute('data-theme', resolveTheme(theme))
    watchSystemTheme(theme)
  }
}

const prefersDark = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia(SYSTEM_DARK_QUERY).matches

export const resolveTheme = (theme) => {
  if (theme === 'light' || theme === 'dark') return theme
  return prefersDark() ? 'dark' : 'light'
}

let systemThemeListener = null

const watchSystemTheme = (theme) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  const query = window.matchMedia(SYSTEM_DARK_QUERY)
  if (systemThemeListener) query.removeEventListener('change', systemThemeListener)
  systemThemeListener = null
  if (theme !== 'system') return
  systemThemeListener = () => {
    document.documentElement.setAttribute('data-theme', prefersDark() ? 'dark' : 'light')
  }
  query.addEventListener('change', systemThemeListener)
}

export const settingsStorage = {
  load: () => {
    try {
      const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS)
      if (savedSettings) {
        return JSON.parse(savedSettings)
      }
      return null
    } catch (error) {
      log.error('Failed to load settings:', error)
      return null
    }
  },

  save: (settings) => {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings))
      return true
    } catch (error) {
      log.error('Failed to save settings:', error)
      return false
    }
  }
}

export const foldersStorage = {
  load: () => {
    try {
      const savedFolders = localStorage.getItem(STORAGE_KEYS.FOLDERS)
      if (savedFolders) {
        return JSON.parse(savedFolders)
      }
      return []
    } catch (error) {
      log.error('Failed to load folders:', error)
      return []
    }
  },

  save: (folders) => {
    try {
      const customFolders = folders.filter((f) => !f.isSystem)
      localStorage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(customFolders))
      return true
    } catch (error) {
      log.error('Failed to save folders:', error)
      return false
    }
  }
}
