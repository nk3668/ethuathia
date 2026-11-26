/**
 * Ability tags (ETH-192): the closed vocabulary, every usable item tagged, and the `bestByTag`
 * resolver on hand-built states, including that it never reads an unidentified item.
 */
import { describe, expect, it } from 'vitest';
import { ABILITY_TAGS, abilityTagsSchema, isUsable, ITEM_KIND, ITEMS, STATUSES } from '../../src/content';
import type { AbilityTag } from '../../src/content';
import { bestByTag, createRun, getEntity, sourcesByTag } from '../../src/sim';
import type { ActorEntity, AiActor, AiCtx, EntityId, ItemInstance, RunState } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const ROOM = ['#########', '#@......#', '#.......#', '#########'];
const DRAUGHT = 'item.mending_draught';
const TONIC = 'item.quickstep_tonic';
const RENEWAL = 'item.scroll_of_renewal';
const BISCUIT = 'item.trail_biscuit';

function setup(items: ItemInstance[], hp?: number, seed = 5): { state: RunState; hero: ActorEntity; ctx: AiCtx } {
  const state = createRun({ party: [HERO], depth: 1, floorTexts: [ROOM], monsters: false }, seed);
  const hero = getEntity(state, state.party[0] as EntityId) as ActorEntity;
  hero.inventory = { items };
  if (hp !== undefined) hero.actor.hp = hp;
  return { state, hero, ctx: { state, actor: hero as AiActor } };
}
const one = (def: string, extra: Partial<ItemInstance> = {}): ItemInstance => ({ def, qty: 1, ...extra });

describe('the tag vocabulary', () => {
  it('is closed: unknown or repeated tags are rejected', () => {
    expect(abilityTagsSchema.safeParse(['heal', 'area']).success).toBe(true);
    expect(abilityTagsSchema.safeParse(['heal', 'fireball']).success).toBe(false);
    expect(abilityTagsSchema.safeParse(['heal', 'heal']).success).toBe(false);
  });

  it('is required on exactly the usable items, validated by the item schema', () => {
    const base = ITEMS.get(DRAUGHT);
    const check = (patch: Record<string, unknown>) => ITEM_KIND.schema.safeParse({ ...base, ...patch }).success;
    expect(check({})).toBe(true);
    expect(check({ abilityTags: [] })).toBe(false);
    expect(check({ abilityTags: undefined })).toBe(false);
    expect(check({ abilityTags: ['nonsense'] })).toBe(false);
    const sword = ITEMS.get('item.iron_hatchet');
    expect(ITEM_KIND.schema.safeParse({ ...sword, abilityTags: ['damage'] }).success).toBe(false);
  });

  it('tags every usable item, and the tags match what its effects do', () => {
    for (const def of ITEMS.all()) {
      const tags = def.abilityTags ?? [];
      expect(tags.length > 0, def.id).toBe(isUsable(def));
      for (const e of def.bundle?.effects ?? []) {
        if (e.kind === 'heal') expect(tags, def.id).toContain('heal');
        if (e.kind === 'damage') expect(tags, def.id).toContain('damage');
        if (e.kind === 'identify' || e.kind === 'uncurse') expect(tags, def.id).toContain('utility');
        if (e.kind === 'applyStatus') {
          const status = STATUSES.get(e.status).tags;
          const wanted: AbilityTag[] = (['buff', 'debuff'] as const).filter((t) => status.includes(t));
          if (wanted.length > 0) expect(tags.some((t) => t === 'heal' || wanted.includes(t)), def.id).toBe(true);
        }
      }
    }
  });

  it('keeps tags in the vocabulary', () => {
    for (const def of ITEMS.all()) for (const t of def.abilityTags ?? []) expect(ABILITY_TAGS).toContain(t);
  });
});

describe('bestByTag', () => {
  it('returns null with nothing of the tag', () => {
    const { ctx } = setup([one(TONIC)]);
    expect(bestByTag(ctx, 'heal')).toBeNull();
    expect(bestByTag(ctx, 'damage')).toBeNull();
    expect(bestByTag(setup([]).ctx, 'heal')).toBeNull();
  });

  it('finds the source for a tag, with a reason that names it', () => {
    const { ctx } = setup([one(TONIC), one(DRAUGHT, { qty: 2 })], 10);
    const heal = bestByTag(ctx, 'heal');
    expect(heal).toMatchObject({ kind: 'item', index: 1, power: 12 });
    expect(heal?.reason).toContain('Mending draught');
    expect(bestByTag(ctx, 'buff')).toMatchObject({ index: 0 });
  });

  it('prefers the weakest heal that covers the missing HP, else the strongest', () => {
    // Only one healing potion exists today, so build the choice from two heal-tagged defs.
    const { ctx } = setup([one(BISCUIT), one(DRAUGHT)], 1);
    // Missing more than either heals: the strongest.
    expect(bestByTag(ctx, 'heal')).toMatchObject({ index: 1, power: 12 });
    // Missing 1 HP: the weakest that still covers it (the biscuit's 2).
    const full = setup([one(BISCUIT), one(DRAUGHT)]);
    full.hero.actor.hp = full.hero.actor.hp - 1;
    expect(bestByTag(full.ctx, 'heal')).toMatchObject({ index: 0, power: 2 });
  });

  it('ranks healing over time after healing at once', () => {
    const { ctx } = setup([one(RENEWAL), one(DRAUGHT)], 5);
    expect(bestByTag(ctx, 'heal')).toMatchObject({ index: 1 });
    const only = setup([one(RENEWAL)], 5);
    const slow = bestByTag(only.ctx, 'heal');
    expect(slow).toMatchObject({ index: 0, power: 0 });
    expect(slow?.reason).toContain('over time');
  });

  it('honours a filter', () => {
    const { ctx } = setup([one(BISCUIT), one(DRAUGHT)], 5);
    expect(bestByTag(ctx, 'heal', undefined, (_i, def) => def.category === 'potion')).toMatchObject({ index: 1 });
    expect(sourcesByTag(ctx, 'heal')).toHaveLength(2);
  });

  it('has no source for another target yet, and works on the actor itself', () => {
    const { ctx, hero } = setup([one(DRAUGHT)], 5);
    expect(bestByTag(ctx, 'heal', hero)).not.toBeNull();
    const other = { ...hero, id: 9999 as EntityId } as ActorEntity;
    expect(bestByTag(ctx, 'heal', other)).toBeNull();
  });

  it('never reads an unidentified item: the answer is the same whatever it really is', () => {
    const answers = [DRAUGHT, TONIC, RENEWAL].flatMap((def) =>
      [undefined, 'blessed' as const, 'cursed' as const].map((blessing) => {
        const { ctx } = setup([one(def, { identified: false, ...(blessing === undefined ? {} : { blessing }) })], 5);
        return ABILITY_TAGS.map((tag) => bestByTag(ctx, tag));
      }),
    );
    for (const a of answers) expect(a.every((x) => x === null)).toBe(true);
  });

  it('uses an unidentified item once its type is known', () => {
    const { ctx, state } = setup([one(DRAUGHT, { identified: false })], 5);
    expect(bestByTag(ctx, 'heal')).toBeNull();
    state.domains.items.identifiedTypes.push(DRAUGHT);
    expect(bestByTag(ctx, 'heal')).toMatchObject({ index: 0 });
  });
});
