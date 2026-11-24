import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Layer rule: imports only point downward (docs/ARCHITECTURE.md §1).
 * Each layer lists the layers it may import from. `typesOnly` layers may be imported
 * with `import type` only.
 */
const LAYERS = {
  core: { allowed: [] },
  content: { allowed: ['core'] },
  sim: { allowed: ['core', 'content'] },
  meta: { allowed: ['core', 'content', 'sim'] },
  platform: { allowed: ['core'], typesOnly: ['meta'] },
  ui: { allowed: ['core', 'content', 'sim', 'meta', 'platform'] },
};

/** The layers that must stay deterministic and free of DOM code. */
const SIM_LAYERS = ['core', 'content', 'sim', 'meta'];

/** Matches an import that climbs out of the current layer into `layer` (or uses an `@/` alias). */
const layerImport = (layer) => `^((\\.\\./)+|@/)${layer}(/|$)`;

const layerConfigs = Object.entries(LAYERS).map(([layer, { allowed, typesOnly = [] }]) => {
  const forbidden = Object.keys(LAYERS).filter(
    (other) => other !== layer && !allowed.includes(other) && !typesOnly.includes(other),
  );
  const may = [...allowed, ...typesOnly.map((l) => `${l} (types only)`)].join(', ') || 'nothing';
  const patterns = [
    ...forbidden.map((other) => ({
      regex: layerImport(other),
      message: `Layer rule: src/${layer} may not import from src/${other}. It may import: ${may}. See docs/ARCHITECTURE.md §1.`,
    })),
    ...typesOnly.map((other) => ({
      regex: layerImport(other),
      allowTypeImports: true,
      message: `Layer rule: src/${layer} may only use \`import type\` from src/${other}. See docs/ARCHITECTURE.md §1.`,
    })),
  ];
  return {
    name: `ethuathia/layers/${layer}`,
    files: [`src/${layer}/**/*.{ts,tsx}`],
    rules: patterns.length > 0 ? { '@typescript-eslint/no-restricted-imports': ['error', { patterns }] } : {},
  };
});

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'src-tauri/target', '.claude', '.sim-compare'] },

  js.configs.recommended,
  tseslint.configs.strict,
  tseslint.configs.stylistic,

  {
    name: 'ethuathia/typescript',
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Needed for the `import type` exception in the layer rule, and matches `verbatimModuleSyntax`.
      '@typescript-eslint/consistent-type-imports': 'error',
      // Same exemption as TypeScript's `noUnusedParameters`: a leading `_` marks a parameter that
      // is part of a signature but not read yet.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  {
    // Sim domain modules start with empty interfaces (state, snapshot, entity parts, config) that
    // their owning items fill in (docs/ARCHITECTURE.md, Contracts).
    name: 'ethuathia/sim-domains',
    files: ['src/sim/*/index.ts'],
    rules: { '@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'always' }] },
  },

  {
    name: 'ethuathia/browser',
    files: ['src/platform/**/*.{ts,tsx}', 'src/ui/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    name: 'ethuathia/react',
    files: ['src/ui/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
  },
  {
    name: 'ethuathia/node',
    files: ['*.config.{js,ts}', 'tools/**/*.ts', 'test/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.node },
  },

  {
    // File size signal (docs/ARCHITECTURE.md §10.1). A warning, not an error: going over is fine
    // with a reasonable argument. Content defs are flat data and exempt.
    name: 'ethuathia/file-size',
    files: ['src/**/*.{ts,tsx}', 'tools/**/*.ts'],
    ignores: ['src/content/**'],
    rules: { 'max-lines': ['warn', { max: 600, skipBlankLines: true, skipComments: true }] },
  },

  ...layerConfigs,

  {
    name: 'ethuathia/determinism',
    files: SIM_LAYERS.map((layer) => `src/${layer}/**/*.ts`),
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'Use the seeded RNG from src/core so runs stay deterministic (docs/ARCHITECTURE.md §3.4).',
        },
      ],
    },
  },
);
