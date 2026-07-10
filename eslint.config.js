import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import boundaries from 'eslint-plugin-boundaries'
import { defineConfig, globalIgnores } from 'eslint/config'

/*
 * The README advertises a strict one-direction dependency chain:
 *
 *   components -> hooks -> api/services -> utils/domain
 *
 * It was prose. Prose does not fail a build, and the codebase had drifted from
 * it in two places: `services/savedLocationsSync` imported upward into
 * `hooks/useLocation` for a constant, and the three radar components reached
 * past hooks straight into `api/rainviewer`. Both are fixed; this config is
 * what stops them coming back.
 *
 * `default: 'disallow'` makes the allow-list exhaustive: an edge that is not
 * listed is an error. Adding one should be a deliberate, reviewed change to
 * this file, not something a stray import can do silently.
 */
export default defineConfig([
  globalIgnores(['dist', 'playwright-report/**', 'test-results/**', '.claude/**']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      /*
       * Without eslint-plugin-react, `<Icon />` does not register as a use of
       * `Icon`, so a capitalised identifier rendered as a JSX component reads
       * as unused. `varsIgnorePattern` already covered the `const Icon = …`
       * form; `argsIgnorePattern` extends the same exemption to a component
       * received as a prop (`function TileLabel({ icon: Icon })`).
       */
      'no-unused-vars': [
        'error',
        { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^[A-Z_]' },
      ],
    },
  },

  // ── Layer boundaries ──────────────────────────────────────────────────────
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { boundaries },
    settings: {
      'boundaries/include': ['src/**/*.{js,jsx}'],
      'boundaries/elements': [
        { type: 'app', pattern: 'src/*.{js,jsx}', partialMatch: false },
        { type: 'components', pattern: 'src/components/**' },
        { type: 'hooks', pattern: 'src/hooks/**' },
        { type: 'api', pattern: 'src/api/**' },
        { type: 'services', pattern: 'src/services/**' },
        { type: 'domain', pattern: 'src/domain/**' },
        { type: 'utils', pattern: 'src/utils/**' },
      ],
    },
    rules: {
      'boundaries/no-unknown-files': 'off',
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          message:
            '{{from.type}} may not import {{to.type}} — see the dependency chain at the top of this file',
          policies: [
            // The composition root wires everything together.
            {
              from: [{ element: { type: 'app' } }],
              allow: [{ element: { type: ['app', 'components', 'hooks', 'api', 'services', 'domain', 'utils'] } }],
            },
            // Components render. They orchestrate through hooks and may read
            // pure logic. They never reach the provider layer themselves.
            {
              from: [{ element: { type: 'components' } }],
              allow: [{ element: { type: ['components', 'hooks', 'domain', 'utils'] } }],
            },
            // Hooks orchestrate: the only layer allowed to touch both React
            // and the providers.
            {
              from: [{ element: { type: 'hooks' } }],
              allow: [{ element: { type: ['hooks', 'api', 'services', 'domain', 'utils'] } }],
            },
            // Provider access. Pure logic below it — never React, never a hook.
            {
              from: [{ element: { type: 'api' } }],
              allow: [{ element: { type: ['api', 'domain', 'utils'] } }],
            },
            {
              from: [{ element: { type: 'services' } }],
              allow: [{ element: { type: ['services', 'api', 'domain', 'utils'] } }],
            },
            // The bottom of the chain. `domain` and `utils` may lean on each
            // other, but on nothing above them.
            {
              from: [{ element: { type: 'domain' } }],
              allow: [{ element: { type: ['domain', 'utils'] } }],
            },
            {
              from: [{ element: { type: 'utils' } }],
              allow: [{ element: { type: ['utils', 'domain'] } }],
            },
          ],
        },
      ],
    },
  },

  // Tests sit outside the chain: a test for any layer may import any layer.
  {
    files: ['src/**/*.test.{mjs,js,jsx}'],
    rules: {
      'boundaries/dependencies': 'off',
    },
  },
])
