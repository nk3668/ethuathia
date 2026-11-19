import { describe, expect, it } from 'vitest';
import type { SimEventType } from '../../src/sim';
import { COMBAT_LOG_TEXT } from '../../src/ui/shell/logText/combat';
import { CORE_LOG_TEXT } from '../../src/ui/shell/logText/core';
import { FLOORS_LOG_TEXT } from '../../src/ui/shell/logText/floors';
import { ITEMS_LOG_TEXT } from '../../src/ui/shell/logText/items';
import { QUESTS_LOG_TEXT } from '../../src/ui/shell/logText/quests';
import { RUN_DOMAIN_LOG_TEXT } from '../../src/ui/shell/logText/run';
import { STATS_LOG_TEXT } from '../../src/ui/shell/logText/stats';
import type { LogTextRecord } from '../../src/ui/shell/logText/types';
import { LOG_TEXT } from '../../src/ui/shell/text';

const DOMAIN_TEXT = [
  CORE_LOG_TEXT,
  STATS_LOG_TEXT,
  FLOORS_LOG_TEXT,
  COMBAT_LOG_TEXT,
  ITEMS_LOG_TEXT,
  QUESTS_LOG_TEXT,
  RUN_DOMAIN_LOG_TEXT,
];

describe('log text', () => {
  it('joins the domain records without two domains wording the same event type', () => {
    const types = DOMAIN_TEXT.flatMap((r) => Object.keys(r));
    expect(new Set(types).size).toBe(types.length);
    expect(Object.keys(LOG_TEXT).sort()).toEqual([...types].sort());
  });

  it('leaves out only moves, waits, floor arrivals (the stairs line says it), kills (the death line says it), recovery ticks and XP grants (the level-up line says it)', () => {
    const quiet = Object.entries(LOG_TEXT)
      .filter(([, entry]) => entry.quiet === true)
      .map(([type]) => type as SimEventType);
    expect(quiet.sort()).toEqual(['floorEntered', 'killed', 'moved', 'recovered', 'waited', 'xpGained']);
  });

  it('makes a missing formatter a compile error', () => {
    // @ts-expect-error: the `ping` event has no wording.
    const missing: LogTextRecord<{ type: 'ping' }> = {};
    expect(missing).toEqual({});
  });

  it('words an item with properties by its event name, and a plain one by its def (ETH-118)', () => {
    const base = { turn: 1, actor: 1, item: 'item.iron_hatchet', slot: 'mainHand' as const, floor: 'floor.1', pos: { x: 0, y: 0 } };
    const named = ITEMS_LOG_TEXT.equipped.text(
      { type: 'equipped', ...base, name: '+1 Iron hatchet', replaced: 'item.oak_cudgel', replacedName: 'Oak cudgel of Mist' },
      () => 'Mira',
    );
    expect(named).toEqual([
      'Mira wields ',
      { ref: 'item.iron_hatchet', label: '+1 Iron hatchet' },
      ', packing away ',
      { ref: 'item.oak_cudgel', label: 'Oak cudgel of Mist' },
      '.',
    ]);
    const plain = ITEMS_LOG_TEXT.unequipped.text({ type: 'unequipped', ...base }, () => 'Mira');
    expect(plain).toEqual(['Mira takes off ', { ref: 'item.iron_hatchet' }, ' (main hand).']);
  });

  it('names templated and named monsters by their event names, with and without an article (ETH-117)', () => {
    const at = { turn: 1, floor: 'd1', pos: { x: 0, y: 0 } };
    const hit = COMBAT_LOG_TEXT.attacked.text(
      {
        type: 'attacked',
        ...at,
        actor: 2,
        actorDef: 'monster.gloam_rat',
        target: 1,
        targetDef: 'actor.adventurer',
        damage: 2,
        hp: 5,
        maxHp: 9,
        names: { 2: { name: 'Venomous gloam rat' } },
      },
      () => 'Mira',
    );
    expect(hit).toEqual(['The ', { ref: 'monster.gloam_rat', label: 'venomous gloam rat' }, ' hits ', 'Mira', '', ' for 2 (5/9 HP left).']);
    const died = COMBAT_LOG_TEXT.died.text(
      {
        type: 'died',
        ...at,
        actor: 2,
        def: 'monster.gloam_rat',
        name: 'Vell the Unbowed',
        proper: true,
        cause: 'actor.adventurer',
        killer: 1,
        drops: [{ item: 'item.mending_draught', qty: 2 }],
      },
      () => 'Mira',
    );
    expect(died).toEqual([
      { ref: 'monster.gloam_rat', label: 'Vell the Unbowed' },
      ' dies',
      ', dropping ',
      { ref: 'item.mending_draught' },
      ' ×2',
      '.',
    ]);
  });
});
