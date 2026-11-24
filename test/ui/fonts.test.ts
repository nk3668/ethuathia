import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
// Resolved the way Node does, so it also works in a git worktree whose node_modules is in a parent checkout.
const nodeRequire = createRequire(join(ROOT, 'package.json'));
const CSS = readFileSync(join(ROOT, 'src/ui/fonts.css'), 'utf8');

/** Every @font-face rule in fonts.css as { family, weight, url }. */
const FACES = [...CSS.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body = '']) => ({
  family: /font-family:\s*'([^']+)'/.exec(body)?.[1],
  weight: /font-weight:\s*(\d+)/.exec(body)?.[1],
  urls: [...body.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1] ?? ''),
}));

describe('bundled fonts (ETH-018)', () => {
  it('ships only .woff2 files, from node_modules, that exist', () => {
    const urls = FACES.flatMap((f) => f.urls);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url).toMatch(/^@fontsource\/[\w-]+\/files\/[\w-]+\.woff2$/);
      expect(existsSync(join(dirname(nodeRequire.resolve(`${url.split('/').slice(0, 2).join('/')}/package.json`)), url.split('/').slice(2).join('/'))), url).toBe(true);
    }
    expect(CSS).not.toMatch(/@import/);
  });

  it('keeps the latin and latin-ext subsets for every weight the UI uses', () => {
    const want: Record<string, string[]> = {
      Inter: ['400', '500', '600'],
      'JetBrains Mono': ['400', '700'],
    };
    const got = FACES.map((f) => `${f.family} ${f.weight} ${/-(latin(?:-ext)?)-\d+-normal/.exec(f.urls[0] ?? '')?.[1]}`);
    const expected = Object.entries(want).flatMap(([family, weights]) =>
      weights.flatMap((w) => [`${family} ${w} latin`, `${family} ${w} latin-ext`]),
    );
    expect(got.sort()).toEqual(expected.sort());
  });
});
