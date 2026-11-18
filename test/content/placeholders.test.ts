import { describe, expect, it } from 'vitest';
import { BOUNTY_KIND, CONTENT_KINDS, CONTRACT_KIND, DEITY_KIND, DOCTRINE_KIND, ITEM_KIND, MONSTER_KIND, OMEN_KIND } from '../../src/content';

const PLACEHOLDERS = [
  [MONSTER_KIND, 'monster'],
  [ITEM_KIND, 'item'],
  [CONTRACT_KIND, 'contract'],
  [BOUNTY_KIND, 'bounty'],
  [OMEN_KIND, 'omen'],
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
