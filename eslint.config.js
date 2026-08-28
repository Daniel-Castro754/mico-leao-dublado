import js from '@eslint/js'
import globals from 'globals'

export default [
  {
    ignores: ['coverage/**', 'node_modules/**']
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    },
    rules: {
      'no-console': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'always']
    }
  },
  {
    files: ['src/http/admin-ui/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser
      }
    }
  }
]
