import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

/** `--name: value;` declarations in the `:root` block of tokens.css (the first block). */
function parseTokens(css: string): Map<string, string> {
  const rootBlock = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  const tokens = new Map<string, string>();
  for (const [, name, value] of rootBlock.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (name && value) tokens.set(name, value.trim());
  }
  return tokens;
}

const TOKENS = parseTokens(read('src/ui/tokens.css'));

/** Follows `var(--x)` references to a final value. */
function resolve(name: string): string {
  let value = TOKENS.get(name);
  for (let hops = 0; value?.startsWith('var(') && hops < 10; hops++) {
    value = TOKENS.get(value.slice(4, -1).trim());
  }
  if (value === undefined) throw new Error(`token ${name} is not defined`);
  return value;
}

/** WCAG 2 relative luminance of a `#rrggbb` color. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** The design doc's §2, where every token is named. */
const DOC_TOKENS_SECTION = (() => {
  const doc = read('docs/VISUAL-DESIGN.md');
  const start = doc.indexOf('## 2. Tokens');
  const end = doc.indexOf('## 3.', start);
  return doc.slice(start, end);
})();

describe('tokens.css', () => {
  it('defines every token named in docs/VISUAL-DESIGN.md §2', () => {
    const named = new Set([...DOC_TOKENS_SECTION.matchAll(/`(--[\w-]+)`/g)].map((m) => m[1] as string));
    expect(named.size).toBeGreaterThan(30);
    const missing = [...named].filter((name) => !TOKENS.has(name));
    expect(missing).toEqual([]);
  });

  it('matches the hex values in the design doc', () => {
    const rows = [...DOC_TOKENS_SECTION.matchAll(/\|\s*`(--[\w-]+)`\s*\|\s*`(#[0-9a-f]{6})`/gi)];
    expect(rows.length).toBeGreaterThan(20);
    for (const [, name, hex] of rows) {
      expect({ name, value: resolve(name as string).toLowerCase() }).toEqual({ name, value: hex?.toLowerCase() });
    }
  });

  describe('text on background contrast is at least 4.5:1', () => {
    const surfaces = ['--bg-app', '--bg-panel', '--bg-raised', '--bg-hover'];
    const text = [
      '--text',
      '--text-muted',
      '--accent',
      '--hp',
      '--mp',
      '--xp',
      '--renown',
      '--trophies',
      '--favor',
      '--good',
      '--warn',
      '--danger',
      '--log-combat',
      '--log-loot',
      '--log-discovery',
      '--log-ai',
      '--log-system',
    ];
    const pairs: [string, string][] = [
      ...text.flatMap((fg) => surfaces.map((bg): [string, string] => [fg, bg])),
      // Disabled text and placeholders never sit on a hover fill: disabled controls don't hover.
      ...['--bg-app', '--bg-panel', '--bg-raised'].map((bg): [string, string] => ['--text-faint', bg]),
      ['--on-accent', '--accent'],
    ];

    it.each(pairs)('%s on %s', (fg, bg) => {
      expect(contrast(resolve(fg), resolve(bg))).toBeGreaterThanOrEqual(4.5);
    });
  });
});

function cssFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.css'))
    .map((file) => join(dir, file));
}

describe('stylesheets use tokens', () => {
  const kit = cssFiles('src/ui/kit');
  const all = cssFiles('src/ui').filter((file) => !file.endsWith('tokens.css') && !file.endsWith('fonts.css'));

  it.each(kit)('%s has no raw colors, fonts, lengths or durations', (file) => {
    const css = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i);
    expect(css).not.toMatch(/font-family:\s*(?!var\()/);
    expect(css).not.toMatch(/\b\d+(\.\d+)?(px|rem|em|ms|s)\b/);
  });

  it.each(all)('%s only refers to defined tokens', (file) => {
    const css = read(file);
    const local = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    // Set from component code through inline styles.
    const inline = new Set(['--bar-fraction', '--swatch', '--log-height', '--row-height', '--row-gap', '--columns']);
    const unknown = [...css.matchAll(/var\((--[\w-]+)/g)]
      .map((m) => m[1] as string)
      .filter((name) => !TOKENS.has(name) && !local.has(name) && !inline.has(name));
    expect({ file: relative(ROOT, join(ROOT, file)), unknown }).toEqual({
      file: relative(ROOT, join(ROOT, file)),
      unknown: [],
    });
  });
});
