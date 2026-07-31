import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dist-ssr']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Allow `any` in error handlers and at API boundaries — the codebase relies
      // on `err: any` to read `err.response?.data?.message` from axios responses,
      // and several Prisma JSON columns flow through the type layer as `any`.
      // Tighten this once those boundaries get proper types.
      '@typescript-eslint/no-explicit-any': 'off',
      // Allow co-locating context hooks with their provider component
      // (e.g. AuthContext exporting both AuthProvider and useAuth).
      'react-refresh/only-export-components': 'warn',
    },
  },
  {
    // The prerender entry is loaded by Node at build time and never by the dev
    // server, so the fast-refresh rule has nothing to say about it — it exports
    // render() and re-exports the route manifest by design.
    files: ['src/entry-server.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
