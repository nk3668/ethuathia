/**
 * Content kinds and their validation (docs/ARCHITECTURE.md §2.1, §5).
 *
 * A kind is a registry plus the Zod schema its defs must match and, optionally, the ids each def
 * refers to. `checkKinds` checks every def's shape, then (once everything is registered) that
 * every id a def mentions exists. Every problem names the def it was found in.
 */
import type { z } from 'zod';
import type { Def, Registry } from '../core';

/** An id one def mentions, which must exist in the registry of `kind` (e.g. `generation step`). */
export interface ContentRef {
  /** Where in the def, e.g. `steps[1].step`. */
  readonly path: string;
  /** The `kind` of the registry the id belongs to. */
  readonly kind: string;
  readonly id: string;
}

/** Anything ids can be looked up in: a `Registry` of content or of sim code. */
export interface RefTarget {
  readonly kind: string;
  has(id: string): boolean;
}

export interface ContentKind<T extends Def = Def> {
  readonly registry: Registry<T>;
  /** The shape every def must have. Defs are checked against it, never rebuilt from it. */
  readonly schema: z.ZodType<T>;
  /** The ids `def` mentions. Only called on defs whose shape is valid. */
  refs?(def: T): readonly ContentRef[];
  /**
   * Rules that span several defs of this kind (e.g. no prerequisite cycles), as problem lines.
   * Called once with every def whose shape is valid, after the refs are checked.
   */
  check?(defs: readonly T[]): readonly string[];
}

/** Thrown by `validateContent` and the sim's `validateGame`, listing every problem found. */
export class ContentError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Content failed validation (${problems.length} problem${problems.length === 1 ? '' : 's'}):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ContentError';
  }
}

/** How a problem names its def: `class "class.vanguard"`, or its position if it has no usable id. */
function defLabel(kind: string, def: unknown, index: number): string {
  const id = typeof def === 'object' && def !== null ? (def as { id?: unknown }).id : undefined;
  return typeof id === 'string' && id !== '' ? `${kind} "${id}"` : `${kind} #${index + 1} (no id)`;
}

/** `steps[1].step` from a Zod issue path; `(def)` for the def as a whole. */
function formatPath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const key of path) {
    if (typeof key === 'number') out += `[${key}]`;
    else out += out === '' ? String(key) : `.${String(key)}`;
  }
  return out === '' ? '(def)' : out;
}

/** An issue's message. A bad record key reports why the key is bad, not just that it is. */
function issueMessage(issue: z.core.$ZodIssue): string {
  if (issue.code === 'invalid_key' && issue.issues.length > 0) return issue.issues.map((i) => i.message).join('; ');
  return issue.message;
}

/**
 * Every problem with the defs of `kinds`, as readable lines naming the def: shape errors from
 * each kind's schema, then ids that refer to nothing. A ref is looked up among `kinds` and
 * `targets` (registries outside content, such as the sim's generation steps), matched by `kind`.
 * An empty list means the content is valid.
 */
export function checkKinds(kinds: readonly ContentKind[], targets: readonly RefTarget[] = []): string[] {
  const problems: string[] = [];
  const byKind = new Map<string, RefTarget>();
  for (const target of [...kinds.map((k) => k.registry), ...targets]) byKind.set(target.kind, target);

  const valid: [ContentKind, Def][] = [];
  for (const kind of kinds) {
    kind.registry.all().forEach((def, i) => {
      const label = defLabel(kind.registry.kind, def, i);
      const result = kind.schema.safeParse(def);
      if (result.success) {
        valid.push([kind, def]);
        return;
      }
      for (const issue of result.error.issues) problems.push(`${label}: ${formatPath(issue.path)}: ${issueMessage(issue)}`);
    });
  }

  for (const [kind, def] of valid) {
    for (const ref of kind.refs?.(def) ?? []) {
      const target = byKind.get(ref.kind);
      const label = `${kind.registry.kind} "${def.id}"`;
      if (target === undefined) {
        problems.push(`${label}: ${ref.path} refers to a ${ref.kind}, but there is no ${ref.kind} registry to check it in`);
      } else if (!target.has(ref.id)) {
        problems.push(`${label}: ${ref.path} refers to unknown ${ref.kind} "${ref.id}"`);
      }
    }
  }

  for (const kind of kinds) {
    if (!kind.check) continue;
    const defs = valid.filter(([k]) => k === kind).map(([, def]) => def);
    problems.push(...kind.check(defs));
  }
  return problems;
}
