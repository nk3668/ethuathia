import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/**
 * Checks that the project's ESLint config enforces the layer rule and the Math.random ban
 * (docs/ARCHITECTURE.md §1 and §3.4). The expectations are written out by hand rather than
 * read from eslint.config.js, so a mistake in the config's table shows up here.
 */

const eslint = new ESLint();

const LAYER_RULE = '@typescript-eslint/no-restricted-imports';
const RANDOM_RULE = 'no-restricted-properties';

/** Lints `code` as if it were the file at `filePath` and returns the ids of the rules it broke. */
async function brokenRules(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  if (!result) throw new Error(`ESLint ignored ${filePath}`);
  const fatal = result.messages.find((m) => m.fatal);
  if (fatal) throw new Error(`${filePath} failed to parse: ${fatal.message}`);
  return result.messages.map((m) => m.ruleId ?? '');
}

const LAYERS = ['core', 'content', 'sim', 'meta', 'platform', 'ui'] as const;
type Layer = (typeof LAYERS)[number];

/** What each layer may import, copied from the table in docs/ARCHITECTURE.md §1. */
const MAY_IMPORT: Record<Layer, readonly Layer[]> = {
  core: [],
  content: ['core'],
  sim: ['core', 'content'],
  meta: ['core', 'content', 'sim'],
  platform: ['core'],
  ui: ['core', 'content', 'sim', 'meta', 'platform'],
};

const valueImport = (from: Layer) => `import { thing } from '../${from}/thing';\nexport const x = thing;\n`;
const typeImport = (from: Layer) => `import type { Thing } from '../${from}/thing';\nexport type X = Thing;\n`;

describe('layer rule', { timeout: 30_000 }, () => {
  for (const layer of LAYERS) {
    for (const other of LAYERS) {
      if (other === layer) continue;
      const allowed = MAY_IMPORT[layer].includes(other);
      it(`${layer} ${allowed ? 'may' : 'may not'} import ${other}`, async () => {
        const rules = await brokenRules(`src/${layer}/example.ts`, valueImport(other));
        if (allowed) expect(rules).not.toContain(LAYER_RULE);
        else expect(rules).toContain(LAYER_RULE);
      });
    }
  }

  it('platform may import types from meta, but not values', async () => {
    expect(await brokenRules('src/platform/example.ts', typeImport('meta'))).not.toContain(LAYER_RULE);
    expect(await brokenRules('src/platform/example.ts', valueImport('meta'))).toContain(LAYER_RULE);
  });

  it('a type-only import does not get around the rule elsewhere', async () => {
    expect(await brokenRules('src/sim/example.ts', typeImport('ui'))).toContain(LAYER_RULE);
  });

  it('catches upward imports from nested folders, re-exports and an @/ alias', async () => {
    const nested = `import { thing } from '../../ui/thing';\nexport const x = thing;\n`;
    expect(await brokenRules('src/sim/ai/example.ts', nested)).toContain(LAYER_RULE);

    const reExport = `export { thing } from '../ui/thing';\n`;
    expect(await brokenRules('src/sim/example.ts', reExport)).toContain(LAYER_RULE);

    const alias = `import { thing } from '@/ui/thing';\nexport const x = thing;\n`;
    expect(await brokenRules('src/sim/example.ts', alias)).toContain(LAYER_RULE);
  });

  it('leaves imports inside a layer and from packages alone', async () => {
    const code = [
      `import { a } from './sibling';`,
      `import { b } from '../sibling';`,
      `import { c } from './ui/helper';`,
      `import { d } from '@dnd-kit/core';`,
      `export const x = [a, b, c, d];`,
      '',
    ].join('\n');
    expect(await brokenRules('src/sim/ai/example.ts', code)).not.toContain(LAYER_RULE);
  });
});

describe('Math.random ban', { timeout: 30_000 }, () => {
  const code = `export const roll = Math.random();\n`;

  for (const layer of ['core', 'content', 'sim', 'meta'] as const) {
    it(`fails lint in ${layer}`, async () => {
      expect(await brokenRules(`src/${layer}/example.ts`, code)).toContain(RANDOM_RULE);
    });
  }

  it('is allowed in ui, where it cannot affect a run', async () => {
    expect(await brokenRules('src/ui/example.ts', code)).not.toContain(RANDOM_RULE);
  });
});
