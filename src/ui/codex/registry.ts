/**
 * The Codex's view of content: one renderer per content kind, collected from `renderers/*.tsx`
 * (each file's default export), and look-ups by content id for the tab and `Explain`.
 *
 * A kind with no renderer file still gets a section, titled from its registry's kind, showing
 * each def's name and description.
 */
import { CONTENT_KINDS } from '../../content';
import type { Glyph } from '../../content';
import type { Def } from '../../core';
import type { CodexDiscoveries, CodexMark } from '../../sim';
import type { CodexRenderer } from './types';

/** Picks up every renderer file. Vite resolves the glob at build time; nothing loads at run time. */
const MODULES = import.meta.glob<{ default: CodexRenderer }>('./renderers/*.tsx', { eager: true });

/** Renderers by kind, from `modules`. Throws on a file without a renderer or a kind with two. */
export function collectRenderers(modules: Readonly<Record<string, { default?: CodexRenderer }>>): Map<string, CodexRenderer> {
  const byKind = new Map<string, CodexRenderer>();
  for (const [path, module] of Object.entries(modules).sort(([a], [b]) => a.localeCompare(b))) {
    const renderer = module.default;
    if (renderer === undefined) throw new Error(`Codex renderer file ${path} has no default export`);
    const kind = renderer.registry.kind;
    if (byKind.has(kind)) throw new Error(`Two Codex renderers for the content kind "${kind}" (again in ${path})`);
    byKind.set(kind, renderer);
  }
  return byKind;
}

export const CODEX_RENDERERS: ReadonlyMap<string, CodexRenderer> = collectRenderers(MODULES);

/** The renderer a kind gets when it has no file in `renderers/`. */
function fallback(kind: (typeof CONTENT_KINDS)[number]): CodexRenderer {
  const name = kind.registry.kind;
  return { registry: kind.registry, label: `${name.charAt(0).toUpperCase()}${name.slice(1)}s`, order: 1000 };
}

/** Every content kind's renderer, in section order (then `CONTENT_KINDS` order). */
export const ALL_RENDERERS: readonly CodexRenderer[] = CONTENT_KINDS.map((k, i) => ({
  renderer: CODEX_RENDERERS.get(k.registry.kind) ?? fallback(k),
  i,
}))
  .sort((a, b) => a.renderer.order - b.renderer.order || a.i - b.i)
  .map((x) => x.renderer);

/** A content def and the renderer of its kind. */
export interface CodexEntry {
  readonly def: Def;
  readonly renderer: CodexRenderer;
}

/** The def with this content id and its renderer, or `undefined` if no kind has it. */
export function codexEntry(id: string): CodexEntry | undefined {
  for (const renderer of ALL_RENDERERS) if (renderer.registry.has(id)) return { def: renderer.registry.get(id), renderer };
  return undefined;
}

/** An entry's look: the renderer's, else the def's own `glyph` field. */
export function entryGlyph({ def, renderer }: CodexEntry): Glyph | undefined {
  if (renderer.glyph) return renderer.glyph(def);
  const own = (def as { glyph?: unknown }).glyph;
  return typeof own === 'object' && own !== null && typeof (own as Glyph).ch === 'string' ? (own as Glyph) : undefined;
}

/** How the player has met an entry, or `null` if it is still unknown. Always-known kinds return `[]`. */
export function entryMarks(entry: CodexEntry, discovered: CodexDiscoveries): readonly CodexMark[] | null {
  const marks = discovered[entry.def.id];
  if (marks !== undefined && marks.length > 0) return marks;
  return entry.renderer.alwaysKnown === true ? [] : null;
}
