/**
 * Zod building blocks shared by every content schema (docs/ARCHITECTURE.md §2.1, §5): ids, the
 * `Def` fields and map glyphs. Each content type's own schema lives beside its definitions.
 */
import { z } from 'zod';

// Zod compiles object parsers with `new Function` when it can. The built app's
// Content-Security-Policy forbids eval (docs/ARCHITECTURE.md §1.1), so even Zod's probe for it
// would log a CSP violation. Validation runs once at start-up, so the plain parser is fast enough.
z.config({ jitless: true });

/** One part of a namespaced id: lowercase letters, digits and underscores, starting with a letter. */
const ID_PART = /^[a-z][a-z0-9_]*$/;

/** A content tag: lowercase letters, digits and underscores, starting with a letter. */
export const tagSchema = z.string().regex(ID_PART, 'must be lowercase letters, digits and _');

/** An id in `prefix`'s namespace, e.g. `idSchema('class')` accepts `class.vanguard`. */
export function idSchema(prefix: string): z.ZodString {
  const pattern = new RegExp(`^${prefix}\\.[a-z][a-z0-9_]*$`);
  return z.string().regex(pattern, `must look like "${prefix}.some_name" (lowercase, digits and _)`);
}

/** The `Def` fields every definition carries, with its id in `prefix`'s namespace. */
export function defShape(prefix: string) {
  return {
    id: idSchema(prefix),
    name: z.string().trim().min(1, 'must not be empty'),
    description: z.string().trim().min(1, 'must not be empty'),
    hint: z.string().trim().min(1, 'must not be empty').optional(),
    tags: z.array(tagSchema),
  };
}

/** How something is drawn on the map (docs/VISUAL-DESIGN.md §4.1). The Codex shows the same. */
export interface Glyph {
  /** The character drawn: one code point. */
  readonly ch: string;
  /** Lowercase `#rrggbb`, in full view. The renderer dims remembered tiles itself. */
  readonly color: string;
  /** Drawn in the bold weight, e.g. stairs. */
  readonly bold?: boolean;
}

export const glyphSchema: z.ZodType<Glyph> = z.strictObject({
  ch: z.string().refine((s) => [...s].length === 1, 'must be exactly one character'),
  color: z.string().regex(/^#[0-9a-f]{6}$/, 'must be a lowercase #rrggbb color'),
  bold: z.boolean().optional(),
});

/** A positive whole number, e.g. a stat. */
export const positiveInt = z.number().int('must be a whole number').positive('must be above 0');

/** A whole number of 0 or more. */
export const nonNegativeInt = z.number().int('must be a whole number').nonnegative('must not be negative');
