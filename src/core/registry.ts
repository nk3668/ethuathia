/**
 * An id-keyed store of content definitions (docs/ARCHITECTURE.md §2.1). One registry per
 * content type: monsters, items, Omens, rule conditions and so on.
 *
 * Shape validation and cross-reference checks live in `src/content`; this class only
 * guarantees that ids are unique and that looking up a missing id fails loudly.
 */

/** The fields every definition carries, which the Codex and tooltips rely on. */
export interface Def {
  /** Namespaced id, e.g. `monster.cave_rat`. Saves and sim state store this, never the def. */
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Riddle-like Codex hint shown while the entry is undiscovered (ETH-091). */
  readonly hint?: string;
  readonly tags: readonly string[];
}

export class Registry<T extends Def> {
  private readonly byId = new Map<string, T>();
  private readonly ordered: T[] = [];

  /** `kind` names the content type in error messages, e.g. `"monster"`. */
  constructor(readonly kind: string) {}

  /** Adds `def` and returns it. Throws if its id is already registered. */
  register(def: T): T {
    if (this.byId.has(def.id)) {
      throw new Error(`Duplicate ${this.kind} id "${def.id}"`);
    }
    this.byId.set(def.id, def);
    this.ordered.push(def);
    return def;
  }

  /** The def with this id. Throws if there is none. */
  get(id: string): T {
    const def = this.byId.get(id);
    if (def === undefined) throw new Error(`Unknown ${this.kind} id "${id}"`);
    return def;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** Every def, in registration order. */
  all(): readonly T[] {
    return this.ordered;
  }

  get size(): number {
    return this.ordered.length;
  }
}
