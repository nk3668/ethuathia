/**
 * Class kit upgrades, Apprentice Trinket and Forge Stamps (ETH-188): purchase to run config to
 * the kit an adventurer wears.
 */
import { describe, expect, it } from 'vitest';
import { BUILDING_SMITHY, CLASSES, ITEMS, smithyKitProblems, tierGateId, UPGRADES } from '../../src/content';
import { buildRunConfig, canPurchase, defaultRunChoices, describeGrant, newProfile, purchase, recruitParty } from '../../src/meta';
import type { Profile } from '../../src/meta';
import { PARTY_CHOICE } from '../../src/meta/prepare/party';
import { createRun, discoveriesOf, getEntity, isTypeIdentified, soldOnExit, step, waitDecide, wornItems } from '../../src/sim';
import { RUN_DOMAIN_LOG_TEXT } from '../../src/ui/shell/logText/run';
import type { ActorEntity, EntityId, ItemInstance, RunConfig, SimEvent } from '../../src/sim';

const SMITHY = BUILDING_SMITHY.id;
const GATE = tierGateId(SMITHY, 4);
const id = (name: string) => `upgrade.${name}`;
const rich = (): Profile => ({
  ...newProfile(),
  currencies: { renown: 100_000, trophies: 100_000, favor: {} },
  milestones: { unlocked: [{ id: SMITHY, run: 1 }] },
});
const tierTwo = (p: Profile): Profile => ({ ...p, milestones: { unlocked: [...p.milestones.unlocked, { id: GATE, run: 2 }] } });
const buy = (p: Profile, ...ids: string[]): Profile => ids.reduce((acc, nodeId) => purchase(acc, nodeId), p);
const config = (p: Profile) => buildRunConfig(p, defaultRunChoices(), 7);
const withCase = (): Profile =>
  buy(tierTwo(buy(rich(), id('fitted_straps'), id('appraisers_eye'), id('reinforced_wagon'))), id('smelting_pit'), id('scroll_case'));

const CLASS_IDS = ['class.vanguard', 'class.outrider', 'class.lorekeeper', 'class.reaver'] as const;
const ROOM = [['#########', '#<@.....#', '#.......#', '#########']];
const worn = (e: ActorEntity) => Object.fromEntries(wornItems(e).map((w) => [w.slot, w.item]));

function party(extra: Partial<RunConfig>, classes: readonly string[] = CLASS_IDS, stamp?: string) {
  const state = createRun(
    {
      party: classes.map((c, i) => ({ name: `H${i}`, classId: c, raceId: 'race.human', ...(stamp === undefined ? {} : { stamp }) })),
      depth: 1,
      floorTexts: ROOM,
      monsters: false,
      ...extra,
    },
    1,
  );
  return state.party.map((pid) => getEntity(state, pid as EntityId) as ActorEntity);
}

describe('Artisan Implements and Tailored Attire', () => {
  it('are a pick-one at the specced price, and put kitTier in the run config', () => {
    expect(UPGRADES.get(id('artisan_implements')).cost).toEqual({ trophies: 360 });
    expect(UPGRADES.get(id('tailored_attire')).cost).toEqual({ trophies: 360 });
    const base = buy(rich(), id('fitted_straps'));
    expect(config(base)).not.toHaveProperty('kitTier');
    const artisan = purchase(base, id('artisan_implements'));
    expect(config(artisan).kitTier).toEqual(['weapon']);
    expect(canPurchase(artisan, id('tailored_attire'))).toMatchObject({ ok: false, status: 'excluded' });
    expect(config(purchase(base, id('tailored_attire'))).kitTier).toEqual(['defense']);
  });

  it('swaps the named piece for every class’s own Tier-1 item, still kit', () => {
    party({ kitTier: ['weapon', 'defense'] }).forEach((e, i) => {
      const def = CLASSES.get(CLASS_IDS[i] as string);
      const gear = Object.values(worn(e)).map((it) => it.def);
      expect(gear, def.id).toContain(def.kitUpgrade?.weapon);
      expect(gear, def.id).toContain(def.kitUpgrade?.defense);
      expect(gear, def.id).not.toContain(def.kit?.[0]);
      for (const it of Object.values(worn(e))) expect(it.kit).toBe(true);
    });
  });

  it('upgrades only the weapon with the weapon perk, and the +1 stacks on the new piece', () => {
    party({ kitTier: ['weapon'], kitEnchant: ['weapon'] }).forEach((e, i) => {
      const def = CLASSES.get(CLASS_IDS[i] as string);
      expect(worn(e).mainHand?.def).toBe(def.kitUpgrade?.weapon);
      expect(worn(e).mainHand?.enchant).toBe(1);
    });
    const vanguard = party({ kitTier: ['weapon'] })[0] as ActorEntity;
    expect(Object.values(worn(vanguard)).map((it) => it.def)).toContain('item.round_shield');
  });
});

describe('Apprentice Trinket', () => {
  it('is a pick-one with Forge Stamps and gives each class its ring or amulet as kit', () => {
    expect(UPGRADES.get(id('apprentice_trinket')).cost).toEqual({ trophies: 1650 });
    const trinket = purchase(withCase(), id('apprentice_trinket'));
    expect(config(trinket).trinket).toBe(true);
    expect(canPurchase(trinket, id('forge_stamps'))).toMatchObject({ ok: false, status: 'excluded' });
    const state = createRun({ party: CLASS_IDS.map((c, i) => ({ name: `T${i}`, classId: c, raceId: 'race.human' })), depth: 1, floorTexts: ROOM, monsters: false, trinket: true }, 1);
    for (const c of CLASS_IDS) expect(isTypeIdentified(state, CLASSES.get(c).trinket as string), c).toBe(true);
    party({ trinket: true }).forEach((e, i) => {
      const def = CLASSES.get(CLASS_IDS[i] as string);
      const jewelry = wornItems(e).filter((w) => ITEMS.get(w.item.def).category === 'jewelry');
      expect(jewelry.map((w) => w.item.def)).toEqual([def.trinket]);
      expect(jewelry[0]?.item.kit).toBe(true);
      expect(soldOnExit(jewelry[0]?.item as ItemInstance)).toBe(false);
    });
  });
});

describe('Forge Stamps', () => {
  it('are off without the node and stamp the right piece with it', () => {
    expect(config(withCase())).not.toHaveProperty('stamps');
    expect(UPGRADES.get(id('forge_stamps')).cost).toEqual({ trophies: 1650 });
    const cfg = config(purchase(withCase(), id('forge_stamps')));
    expect(cfg.stamps).toBe(true);
    expect(cfg.party.every((m) => m.stamp === CLASSES.get(m.classId).stamp)).toBe(true);
    // Class defaults: Vanguard warding (shield), Outrider nimble (boots), Reaver keen (hatchet).
    const recruits = recruitParty(purchase(withCase(), id('forge_stamps')), 5, 2);
    expect(recruits.every((m) => m.stamp === CLASSES.get(m.classId).stamp)).toBe(true);
    const members = party({ stamps: true }, CLASS_IDS, undefined);
    expect(members).toHaveLength(4);
    const ench = (e: ActorEntity) => Object.fromEntries(wornItems(e).map((w) => [w.item.def, w.item.enchantments?.[0]?.id]));
    expect(ench(members[0] as ActorEntity)['item.round_shield']).toBe('enchant.warding');
    expect(ench(members[1] as ActorEntity)['item.soft_boots']).toBe('enchant.nimble');
    expect(ench(members[3] as ActorEntity)['item.iron_hatchet']).toBe('enchant.keen');
  });

  it('use the stamp the config names per adventurer, and ignore it without the node', () => {
    const keen = party({ stamps: true }, ['class.vanguard'], 'keen')[0] as ActorEntity;
    expect(worn(keen).mainHand?.enchantments).toEqual([{ id: 'enchant.keen', level: 1 }]);
    expect(worn(keen).offHand?.enchantments).toBeUndefined();
    const off = party({}, ['class.vanguard'], 'keen')[0] as ActorEntity;
    expect(worn(off).mainHand?.enchantments).toBeUndefined();
  });

  it('resolve a Prepare pick per slot, falling back to the class default, and load old saved picks', () => {
    const owned = purchase(withCase(), id('forge_stamps'));
    const slots = [
      { classId: 'class.vanguard', raceId: null, stamp: 'nimble' as const },
      { classId: 'class.vanguard', raceId: null },
    ];
    const choices = { ...defaultRunChoices(), party: { slots } };
    const cfg = buildRunConfig(owned, choices, 3);
    expect(cfg.party[0]?.stamp).toBe('nimble');
    if (cfg.party.length > 1) expect(cfg.party[1]?.stamp).toBe('warding');
    const old = PARTY_CHOICE.schema.parse({ slots: [{ classId: null, raceId: null }] });
    expect(old.slots[0]?.stamp ?? null).toBeNull();
    expect(buildRunConfig(rich(), choices, 3).party[0]).not.toHaveProperty('stamp');
  });

  it('say so in the run-start log line and discover kit enchantments and pack supplies properly', () => {
    const state = createRun(
      {
        party: [{ name: 'Mira', classId: 'class.reaver', raceId: 'race.human', stamp: 'keen' }],
        depth: 1,
        floorTexts: ROOM,
        monsters: false,
        stamps: true,
        kitEnchant: ['weapon'],
        startStock: [{ item: 'item.scroll_of_identify', qty: 1 }],
      },
      1,
    );
    const events: SimEvent[] = step(state, [], { decide: waitDecide });
    const issued = events.find((e) => e.type === 'kitIssued') as Extract<SimEvent, { type: 'kitIssued' }>;
    expect(issued.stamped).toEqual([{ item: 'item.iron_hatchet', stamp: 'keen' }]);
    const disc = discoveriesOf(issued);
    expect(disc).toContainEqual({ id: 'enchant.keen', mark: 'used' });
    expect(disc).toContainEqual({ id: 'enchant.honed', mark: 'used' });
    expect(disc).toContainEqual({ id: 'item.scroll_of_identify', mark: 'seen' });
    const parts = RUN_DOMAIN_LOG_TEXT.kitIssued.text(issued as never, () => 'Mira');
    const text = (Array.isArray(parts) ? parts : [parts]).map((p) => (typeof p === 'string' ? p : ((p as { label?: string; ref: string }).label ?? (p as { ref: string }).ref))).join('');
    expect(text).toContain('keen');
  });
});

describe('Field Salvage Kit', () => {
  const NODE = id('field_salvage_kit');
  it('is an opt-in node at the specced price that sets config.salvage only when switched on', () => {
    expect(UPGRADES.get(NODE).cost).toEqual({ trophies: 1050 });
    expect(UPGRADES.get(NODE).optIn).toBe(true);
    const owned = purchase(withCase(), NODE);
    expect(config(owned)).not.toHaveProperty('salvage');
    const on = buildRunConfig(owned, { ...defaultRunChoices(), optIns: { enabled: [NODE] } }, 7);
    expect(on.salvage).toBe(true);
    expect(describeGrant(UPGRADES.get(NODE).grants[0] as never)).toMatch(/break plain, identified gear/);
  });
});

describe('class kit content', () => {
  it('names a Tier-1 piece, trinket and stamp for every class with a kit, fitting its slots', () => {
    for (const def of CLASSES.all()) {
      if (def.kit === undefined) continue;
      expect(smithyKitProblems(def), def.id).toEqual([]);
    }
  });

  it('rejects a missing upgrade, a wrong slot, a non-jewelry trinket and a stamp without a kit', () => {
    const v = CLASSES.get('class.vanguard');
    expect(smithyKitProblems({ ...v, kitUpgrade: undefined }).join('\n')).toContain('no kitUpgrade.weapon');
    expect(smithyKitProblems({ ...v, kitUpgrade: { weapon: 'item.round_shield', defense: 'item.banded_shield' } }).join('\n')).toContain('does not fit the slot');
    expect(smithyKitProblems({ ...v, kitUpgrade: { weapon: 'item.oak_cudgel', defense: 'item.banded_shield' } }).join('\n')).toContain('base kit piece');
    expect(smithyKitProblems({ ...v, trinket: 'item.oak_cudgel' }).join('\n')).toContain('not a ring or amulet');
    expect(smithyKitProblems({ ...v, kit: [...(v.kit ?? []), 'item.knotwork_pendant'], trinket: 'item.hearthstone_amulet' }).join('\n')).toContain('no free slot');
    expect(smithyKitProblems({ kit: ['item.ashwood_staff'], kitUpgrade: { weapon: 'item.ironshod_staff' }, trinket: 'item.hearthstone_amulet', stamp: 'warding' }).join('\n')).toContain('does not have');
    expect(smithyKitProblems({ kit: undefined, stamp: 'keen' }).join('\n')).toContain('no kit');
  });
});
