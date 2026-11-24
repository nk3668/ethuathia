import { describe, expect, it } from 'vitest';
import { DUNGEON_OLD_DELVE, ENCHANT_HONED, ENCHANT_KEEN, MONSTER_TEMPLATES, MONSTERS } from '../../src/content';
import type { DungeonDef, EnchantmentDef, MonsterDef, MonsterTemplateDef } from '../../src/content';
import { reachabilityProblems } from '../../tools/content-reachability';

const rat = MONSTERS.all()[0] as MonsterDef;
const shallow: DungeonDef = { ...DUNGEON_OLD_DELVE, depth: { min: 1, max: 1 } };

describe('content reachability (ETH-143)', () => {
  it('finds every shipped def reachable in a run', () => {
    expect(reachabilityProblems()).toEqual([]);
  });

  it('names a monster whose Danger band meets no floor', () => {
    const deep: MonsterDef = { ...rat, id: 'monster.too_deep', danger: { min: 50, max: 60 } };
    const problems = reachabilityProblems({ monsters: [...MONSTERS.all(), deep] });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('monster "monster.too_deep"');
    expect(problems[0]).toContain('50..60');
  });

  it('names a monster the dungeon ecology filters out, and lets handPlaced opt out', () => {
    const dungeon: DungeonDef = { ...DUNGEON_OLD_DELVE, ecology: { allowTags: ['beast'] } };
    const other = MONSTERS.all().find((m) => !m.tags.includes('beast')) as MonsterDef;
    const problems = reachabilityProblems({ dungeons: [dungeon], monsters: [other], templates: [] });
    expect(problems.some((p) => p.includes(`monster "${other.id}"`) && p.includes('ecology'))).toBe(true);
    const opted = reachabilityProblems({ dungeons: [dungeon], monsters: [{ ...other, handPlaced: true }], templates: [] });
    expect(opted).toEqual([]);
  });

  it('names a template that fits no spawnable monster', () => {
    const t = { ...(MONSTER_TEMPLATES.all()[0] as MonsterTemplateDef), id: 'template.nobody', families: ['no_such_family'] };
    const problems = reachabilityProblems({ templates: [t] });
    expect(problems).toEqual([expect.stringContaining('template "template.nobody": fits no monster that can spawn')]);
  });

  it('names every template when no dungeon rolls templates', () => {
    const bare: DungeonDef = { ...DUNGEON_OLD_DELVE };
    delete (bare as { encounters?: unknown }).encounters;
    const problems = reachabilityProblems({ dungeons: [bare] });
    expect(problems.length).toBe(MONSTER_TEMPLATES.size);
    expect(problems[0]).toContain('no dungeon rolls templates');
  });

  it('names items whose loot depth is beyond every floor', () => {
    const problems = reachabilityProblems({ dungeons: [shallow], monsters: [], templates: [], enchantments: [] });
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('item "item.riveted_mail": its loot depth 3..any is outside every dungeon floor (1..1)'),
      ]),
    );
  });

  it('names an item with no loot entry and no contract naming it', () => {
    const problems = reachabilityProblems({ contracts: [], monsters: [], templates: [], enchantments: [] });
    expect(problems).toEqual([expect.stringContaining('item "item.ember_reliquary": has no loot entry')]);
  });

  it('names a special enchantment out of reach and an unused base enchantment', () => {
    const farOff: EnchantmentDef = { ...ENCHANT_KEEN, id: 'enchant.far_off', minDepth: 40 };
    const nobody: EnchantmentDef = { ...ENCHANT_KEEN, id: 'enchant.fits_nothing', appliesTo: [] };
    const base: EnchantmentDef = { ...ENCHANT_HONED, id: 'enchant.unused_base', appliesTo: [] };
    const problems = reachabilityProblems({ enchantments: [farOff, nobody, base], monsters: [], templates: [] });
    expect(problems).toHaveLength(3);
    expect(problems[0]).toContain('enchantment "enchant.far_off": none of the gear it fits');
    expect(problems[1]).toContain('enchantment "enchant.fits_nothing": fits no gear item');
    expect(problems[2]).toContain('enchantment "enchant.unused_base": no gear def uses this base enchantment');
  });
});
