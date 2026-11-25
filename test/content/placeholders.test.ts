import { describe, expect, it } from 'vitest';
import { BOUNTY_KIND, CONTENT_KINDS, DEITY_KIND, DOCTRINE_KIND } from '../../src/content';

const PLACEHOLDERS = [
  [BOUNTY_KIND, 'bounty'],
  [DEITY_KIND, 'deity'],
  [DOCTRINE_KIND, 'doctrine'],
] as const;

describe('placeholder content kinds', () => {
  it.each(PLACEHOLDERS)('%# %s is registered and checks a minimal def', (kind, prefix) => {
    expect(CONTENT_KINDS).toContain(kind);
    expect(kind.registry.kind).toBe(prefix);
    const def = { id: `${prefix}.example`, name: 'Example', description: 'An example definition.', tags: [] };
    expect(kind.schema.safeParse(def).success).toBe(true);
    expect(kind.schema.safeParse({ ...def, id: `other.example` }).success).toBe(false);
    expect(kind.schema.safeParse({ ...def, extra: 1 }).success).toBe(false);
  });
});
