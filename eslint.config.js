import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettierConfig from 'eslint-config-prettier'

export default [
  { ignores: ['dist', 'node_modules', 'test', 'spec', 'tests', 'spikes'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module'
      }
    },
    settings: { react: { version: '18.3' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react/jsx-no-target-blank': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'react/prop-types': 'off',
      ...prettierConfig.rules,
      // Core ships inside the mobile Bare bundle and the desktop worker, where
      // raw console output reaches logcat / Console.app on user devices. Use
      // `log.js` instead - it gates on level and provides redaction helpers.
      'no-console': 'error'
    }
  },
  {
    // The backend runs on Bare, which provides these timers globally.
    files: ['backend/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser, setImmediate: 'readonly', clearImmediate: 'readonly' }
    }
  },
  {
    // The logger is the one place allowed to reach console directly.
    files: ['log.js'],
    rules: { 'no-console': 'off' }
  }
]
