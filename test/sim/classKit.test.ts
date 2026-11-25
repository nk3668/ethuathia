/**
 * Class starting kits (ETH-176): a class's `kit` is worn, identified and marked as kit from the
 * first turn; a class without one starts empty-handed; bad kits fail content validation; the
 * run-start log line names what each adventurer carries; kit items earn no Trophies.
 */
import { describe, expect, it } from 'vitest';
import { checkKinds, CLASS_KIND, CLASS_VANGUARD, defineClass, ITEMS, ITEM_ASHWOOD_STAFF, ITEM_FLANGED_MACE, ITEM_OAK_CUDGEL, ITEM_ROUND_SHIELD } from '../../src/content';
import type { ClassDef, ContentKind } from '../../src/content';
import { Registry } from '../../src/core';
import type { Def } from '../../src/core';
import {
  checkInvariants,
  createRun,
  deserialize,
  getEntity,
  isKitItem,
  itemsAt,
  runResult,
  KIT_NOTE,
  serialize,
  snapshot,
  step,
  waitDecide,
} from '../../src/sim';
import type { ActionRequest, ActorEntity, Command, EntityId, RunState, SimEvent } from '../../src/sim';
import { RUN_DOMAIN_LOG_TEXT } from '../../src/ui/shell/logText/run';

const ROOM = ['#########', '#@......#', '#.......#', '#########'];
const BARE = defineClass({
  id: 'class.test_bare',
  name: 'Bare',
  description: 'A test class with no kit.',
  hint: 'Hands only.',
  tags: [],
  attributes: { brawn: 10, finesse: 10, wits: 10, grit: 10 },
  growth: { brawn: { min: 1, max: 1 } },
});

function setup(classId: string = CLASS_VANGUARD.id): { state: RunState; hero: ActorEntity } {
  const state = createRun({ party: [{ name: 'Mira', classId, raceId: 'race.human' }], depth: 1, floorText: ROOM, monsters: false }, 1);
  return { state, hero: getEntity(state, state.party[0] as EntityId) as ActorEntity };
}

const act = (actor: EntityId, action: ActionRequest): Command => ({ type: 'playerAction', actor, action });
const by = (state: RunState, ...commands: Command[]): SimEvent[] => step(state, commands, { decide: waitDecide });

describe('a class kit at run start', () => {
  it('equips the Vanguard with a cudgel and a shield, identified and marked as kit', () => {
    const { state, hero } = setup();
    expect(hero.inventory?.equipped).toEqual({
      mainHand: { def: ITEM_OAK_CUDGEL.id, qty: 1, kit: true },
      offHand: { def: ITEM_ROUND_SHIELD.id, qty: 1, kit: true },
    });
    expect(hero.inventory?.items).toEqual([]);
    for (const item of Object.values(hero.inventory?.equipped ?? {})) {
      expect(item.identified).toBeUndefined();
      expect(isKitItem(item)).toBe(true);
    }
    expect(checkInvariants(state)).toEqual([]);
  });

  it('puts the kit in effect before the first turn and says so in the tooltip note', () => {
    const { state, hero } = setup();
    const worn = snapshot(state).domains.items.members[hero.id]?.equipped ?? [];
    expect(worn.map((w) => [w.slot, w.def])).toEqual([
      ['mainHand', ITEM_OAK_CUDGEL.id],
      ['offHand', ITEM_ROUND_SHIELD.id],
    ]);
    for (const w of worn) expect(w.stateNote).toContain(KIT_NOTE);
  });

  it('leaves a class without a kit empty-handed', () => {
    const { state, hero } = setup(BARE.id);
    expect(hero.inventory).toBeUndefined();
    expect(by(state).some((e) => e.type === 'kitIssued')).toBe(false);
  });

  it('keeps the kit mark through a drop, a pickup and a save', () => {
    const { state, hero } = setup();
    by(state, act(hero.id, { id: 'unequip', slot: 'mainHand' }));
    by(state, act(hero.id, { id: 'drop', index: 0 }));
    expect(itemsAt(state, 'd1', hero.pos).map((e) => e.item)).toEqual([{ def: ITEM_OAK_CUDGEL.id, qty: 1, kit: true }]);
    by(state, act(hero.id, { id: 'pickup' }));
    expect(hero.inventory?.items).toEqual([{ def: ITEM_OAK_CUDGEL.id, qty: 1, kit: true }]);
    expect(deserialize(serialize(state))).toEqual(state);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('rejects a kit mark on something that is not gear, a potion, a scroll or food', () => {
    const { state, hero } = setup();
    hero.inventory = { items: [{ def: 'item.bent_nail', qty: 1, kit: true }] };
    expect(checkInvariants(state).join('\n')).toContain('marked as kit but is not gear, a potion, a scroll or food');
  });
});

describe('the run-start log line', () => {
  it('emits one kitIssued per adventurer with a kit, and words it as a sentence', () => {
    const { state, hero } = setup();
    const issued = by(state).filter((e): e is Extract<SimEvent, { type: 'kitIssued' }> => e.type === 'kitIssued');
    expect(issued).toMatchObject([{ actor: hero.id, name: 'Mira', items: [ITEM_OAK_CUDGEL.id, ITEM_ROUND_SHIELD.id] }]);
    const parts = RUN_DOMAIN_LOG_TEXT.kitIssued.text(issued[0] as never, () => 'Mira');
    const text = (Array.isArray(parts) ? parts : [parts]).map((p) => (typeof p === 'string' ? p : (p.label ?? p.ref))).join('');
    expect(text).toBe('Mira shoulders an oak cudgel and a round shield.');
  });
});

describe('kit content validation', () => {
  function problems(kit: string[], upgrade: ClassDef['kitUpgrade'] = CLASS_VANGUARD.kitUpgrade): string[] {
    const registry = new Registry<ClassDef & Def>('class');
    registry.register({ ...CLASS_VANGUARD, kit, ...(upgrade === undefined ? {} : { kitUpgrade: upgrade }) });
    const kind: ContentKind<ClassDef> = { ...CLASS_KIND, registry };
    return checkKinds([kind], [ITEMS]);
  }

  it('accepts the shipped kits and a weapon with armor', () => {
    expect(problems([ITEM_OAK_CUDGEL.id, ITEM_ROUND_SHIELD.id])).toEqual([]);
    expect(problems([ITEM_ASHWOOD_STAFF.id], { weapon: 'item.ironshod_staff' })).toEqual([]);
  });

  it('rejects an unknown item, a non-gear item and two items for one slot', () => {
    expect(problems(['item.nothing_at_all']).join('\n')).toContain('unknown item "item.nothing_at_all"');
    expect(problems(['item.mending_draught']).join('\n')).toContain('is not gear');
    expect(problems([ITEM_OAK_CUDGEL.id, ITEM_FLANGED_MACE.id]).join('\n')).toContain('shares a slot');
    expect(problems([]).join('\n')).toContain('kit');
  });
});

describe('kit items and Trophies', () => {
  it('earns no Trophies from the kit when the party walks out without a kill', () => {
    const state = createRun({ party: [{ name: 'Mira', classId: CLASS_VANGUARD.id, raceId: 'race.human' }], depth: 2, monsters: false }, 1);
    const hero = getEntity(state, state.party[0] as EntityId) as ActorEntity;
    step(state, [{ type: 'retreat' }]);
    for (let i = 0; i < 300 && state.domains.run.end === null; i++) step(state, []);
    expect(state.domains.run.end?.outcome).toBe('retreat');
    // The kit is still carried out, marked, and worth nothing at the exit (ETH-171 skips `isKitItem`).
    expect(Object.values(hero.inventory?.equipped ?? {}).every(isKitItem)).toBe(true);
    const result = runResult(state);
    expect(result.atRisk.trophies ?? 0).toBe(0);
    expect(result.converted?.trophies ?? 0).toBe(0);
  });
});
