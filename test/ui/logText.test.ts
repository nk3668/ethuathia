import { describe, expect, it } from 'vitest';
import { ITEMS } from '../../src/content';
import { CHRONICLE_TRACKER, discoveriesOf } from '../../src/sim';
import type { SimEvent, SimEventType } from '../../src/sim';
import { COMBAT_LOG_TEXT, COMBAT_MOMENT_TEXT, HIGHLIGHT_OOD_SIGHTED } from '../../src/ui/shell/logText/combat';
import { CORE_LOG_TEXT } from '../../src/ui/shell/logText/core';
import { FLOORS_LOG_TEXT } from '../../src/ui/shell/logText/floors';
import { ITEMS_LOG_TEXT } from '../../src/ui/shell/logText/items';
import { QUESTS_LOG_TEXT } from '../../src/ui/shell/logText/quests';
import { RUN_DOMAIN_LOG_TEXT } from '../../src/ui/shell/logText/run';
import { STATS_LOG_TEXT } from '../../src/ui/shell/logText/stats';
import type { LogTextRecord } from '../../src/ui/shell/logText/types';
import { describe as describeEvent, highlightOf, LOG_TEXT, logLines } from '../../src/ui/shell/text';

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

  it('leaves out only moves, waits, floor arrivals (the stairs line says it), floor respawns (dungeonStirred says it once), kills (the death line says it), recovery ticks and XP grants (the level-up line says it)', () => {
    const quiet = Object.entries(LOG_TEXT)
      .filter(([, entry]) => entry.quiet === true)
      .map(([type]) => type as SimEventType);
    expect(quiet.sort()).toEqual(['floorEntered', 'floorRespawned', 'killed', 'moved', 'recovered', 'waited', 'xpGained']);
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

    // Unidentified pickups/drops render plain text (no Codex mention spoiler) and do not highlight as valuable finds; itemIdentified and itemUncursed format cleanly (ETH-044).
    const unknownPickEvent = {
      type: 'pickedUp' as const,
      turn: 2,
      actor: 1,
      item: 'item.quickstep_tonic',
      name: 'Cloudy red vial',
      identified: false as const,
      qty: 1,
      value: 60,
      floor: 'd1',
      pos: { x: 0, y: 0 },
    };
    expect(ITEMS_LOG_TEXT.pickedUp.text(unknownPickEvent, () => 'Mira')).toEqual(['Mira picks up ', 'Cloudy red vial', '.']);
    expect(ITEMS_LOG_TEXT.pickedUp.highlightWhen?.(unknownPickEvent)).toBe(false);
    expect(ITEMS_LOG_TEXT.pickedUp.highlightWhen?.({ ...unknownPickEvent, identified: undefined })).toBe(true);

    const unknownDrop = ITEMS_LOG_TEXT.dropped.text(
      { type: 'dropped', turn: 2, actor: 1, item: 'item.mending_draught', name: 'Cloudy red vial', identified: false, qty: 1, floor: 'd1', pos: { x: 0, y: 0 } },
      () => 'Mira',
    );
    expect(unknownDrop).toEqual(['Mira drops ', 'Cloudy red vial', '.']);

    const identified = ITEMS_LOG_TEXT.itemIdentified.text(
      { type: 'itemIdentified', turn: 3, actor: 1, item: 'item.iron_hatchet', name: '-1 cursed Iron hatchet', was: 'Iron hatchet', method: 'equip', cursed: true, floor: 'd1', pos: { x: 0, y: 0 } },
      () => 'Mira',
    );
    expect(identified).toEqual(['Mira identifies Iron hatchet as ', { ref: 'item.iron_hatchet', label: '-1 cursed Iron hatchet' }, ' — it is cursed!']);
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

  it('highlights and warns on out-of-depth monster sightings and formats oodSighted moments (ETH-134)', () => {
    const base = { type: 'monsterSighted' as const, turn: 4, actor: 1, monster: 9, def: 'monster.basalt_giant', floor: 'd4', pos: { x: 2, y: 3 } };
    const normal = describeEvent(base, () => 'Mira');
    expect(normal.text).toBe('Mira spots the basalt giant.');
    expect(highlightOf(base)).toBeUndefined();

    const oodEvent = { ...base, ood: true as const };
    const oodLine = describeEvent(oodEvent, () => 'Mira');
    expect(oodLine.text).toBe('Mira spots the basalt giant — far above its usual depth!');
    expect(highlightOf(oodEvent)).toEqual({ kind: HIGHLIGHT_OOD_SIGHTED, place: { floor: 'd4', pos: { x: 2, y: 3 } } });

    const moment = CHRONICLE_TRACKER.reduce(CHRONICLE_TRACKER.init(), oodEvent).entries[0];
    expect(moment).toBeDefined();
    if (moment !== undefined) {
      const worded = COMBAT_MOMENT_TEXT.oodSighted?.text(moment, () => 'Mira');
      expect(worded).toEqual(['Mira spotted ', 'the ', { ref: 'monster.basalt_giant', label: 'basalt giant' }, ' far above its usual depth on floor 4.']);
    }
  });

  it('words surged return-trip floorRespawned events distinctly while preserving dungeonStirred and quiet status (ETH-136)', () => {
    const stirredPlain = { type: 'dungeonStirred' as const, turn: 10, floor: 'd2', depth: 2 };
    const stirredSurged = { ...stirredPlain, surged: true as const };
    expect(describeEvent(stirredPlain, () => '').text).toBe('The dungeon stirs.');
    expect(describeEvent(stirredSurged, () => '').text).toBe('The dungeon stirs.');

    const plainOne = { type: 'floorRespawned' as const, turn: 10, floor: 'd2', depth: 2, count: 1, wave: 1 };
    const plainMany = { ...plainOne, count: 3 };
    const surgedOne = { ...plainOne, surged: true as const };
    const surgedMany = { ...plainMany, surged: true as const };

    expect(FLOORS_LOG_TEXT.floorRespawned.quiet).toBe(true);
    expect(describeEvent(plainOne, () => '').text).toBe('1 new creature stirs on floor 2.');
    expect(describeEvent(plainMany, () => '').text).toBe('3 new creatures stir on floor 2.');
    expect(describeEvent(surgedOne, () => '').text).toBe('1 deep creature surges onto floor 2.');
    expect(describeEvent(surgedMany, () => '').text).toBe('3 deep creatures surge onto floor 2.');
  });

  it('mentions the first floor type in runStarted when present and omits it for hand-built floors (ETH-079)', () => {
    type RunStartedEvent = Extract<SimEvent, { type: 'runStarted' }>;
    const party = [{ actor: 1, name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' }];
    const generated: RunStartedEvent = { type: 'runStarted', turn: 0, party, depth: 10, floorType: 'floor.halls' };
    expect(RUN_DOMAIN_LOG_TEXT.runStarted.text(generated, () => 'Mira')).toEqual([
      'Mira enters the dungeon (',
      { ref: 'floor.halls' },
      ', 10 floors deep).',
    ]);
    expect(describeEvent(generated, () => 'Mira').text).toBe('Mira enters the dungeon (Hewn Halls, 10 floors deep).');

    const handBuilt: RunStartedEvent = { type: 'runStarted', turn: 0, party, depth: 3, floorType: null };
    expect(RUN_DOMAIN_LOG_TEXT.runStarted.text(handBuilt, () => 'Mira')).toBe('Mira enters the dungeon, 3 floors deep.');

    const singleFloor: RunStartedEvent = { type: 'runStarted', turn: 0, party, depth: 1, floorType: null };
    expect(RUN_DOMAIN_LOG_TEXT.runStarted.text(singleFloor, () => 'Mira')).toBe('Mira enters the dungeon, 1 floor deep.');

    const hiddenGenerated: RunStartedEvent = { type: 'runStarted', turn: 0, party, depth: null, floorType: 'floor.halls' };
    expect(describeEvent(hiddenGenerated, () => 'Mira').text).toBe('Mira enters the dungeon (Hewn Halls).');

    const hiddenHandBuilt: RunStartedEvent = { type: 'runStarted', turn: 0, party, depth: null, floorType: null };
    expect(RUN_DOMAIN_LOG_TEXT.runStarted.text(hiddenHandBuilt, () => 'Mira')).toBe('Mira enters the dungeon.');
  });

  it('logs ruleFired skip explanations even when the fallback rule did not change, and folds repeats (ETH-094)', () => {
    const rule = { set: 'baseline' as const, index: 6 };
    const events: { seq: number; event: SimEvent }[] = [
      {
        seq: 1,
        event: {
          type: 'ruleFired',
          turn: 10,
          actor: 1,
          rule,
          condition: 'cond.always',
          action: 'act.explore',
          detail: 'Explore: heading for unexplored ground',
        },
      },
      {
        seq: 2,
        event: {
          type: 'ruleFired',
          turn: 11,
          actor: 1,
          rule,
          condition: 'cond.always',
          action: 'act.explore',
          detail: 'Explore: heading for unexplored ground; skipped fountain (brackish water is harmful)',
          skipped: ['skipped fountain (brackish water is harmful)'],
        },
      },
      {
        seq: 3,
        event: {
          type: 'ruleFired',
          turn: 12,
          actor: 1,
          rule,
          condition: 'cond.always',
          action: 'act.explore',
          detail: 'Explore: heading for unexplored ground; skipped fountain (brackish water is harmful)',
          skipped: ['skipped fountain (brackish water is harmful)'],
        },
      },
    ];
    const lines = logLines(events, () => 'Mira');
    expect(lines).toHaveLength(2);
    expect(lines[0]?.text).toBe('Mira: Explore: heading for unexplored ground (baseline #7)');
    expect(lines[1]?.text).toBe('Mira: Explore: heading for unexplored ground; skipped fountain (brackish water is harmful) (baseline #7)');
    expect(lines[1]?.repeat).toEqual({ count: 2, lastTurn: 12 });
  });
});

describe('non-spoiling unidentified item sweep (ETH-131)', () => {
  it('never leaks def refs, Codex discoveries, highlights, or chronicle entries for unidentified items', () => {
    const defId = 'item.quickstep_tonic';
    const realName = ITEMS.get(defId).name;
    const alias = 'Cloudy red vial';
    const events: SimEvent[] = [
      { type: 'itemSighted', turn: 1, actor: 1, item: defId, name: alias, identified: false, qty: 1, floor: 'd1', pos: { x: 1, y: 1 } },
      { type: 'pickedUp', turn: 2, actor: 1, item: defId, name: alias, identified: false, qty: 1, value: 60, floor: 'd1', pos: { x: 1, y: 1 } },
      { type: 'dropped', turn: 3, actor: 1, item: defId, name: alias, identified: false, qty: 1, floor: 'd1', pos: { x: 1, y: 1 } },
      {
        type: 'died',
        turn: 4,
        actor: 2,
        def: 'monster.gloam_rat',
        name: 'Gloam rat',
        cause: 'actor.adventurer',
        killer: 1,
        floor: 'd1',
        pos: { x: 2, y: 1 },
        drops: [{ item: defId, qty: 1, name: alias, identified: false }],
      },
    ];

    for (const event of events) {
      const desc = describeEvent(event, () => 'Mira');
      const spoiledMentions = desc.parts.filter((p) => typeof p !== 'string' && p.ref === defId);
      expect(spoiledMentions, event.type).toEqual([]);
      expect(desc.text, event.type).not.toContain(realName);
      expect(desc.text, event.type).toContain(alias);
      expect(highlightOf(event), event.type).toBeUndefined();
      expect(discoveriesOf(event).some((d) => d.id === defId), event.type).toBe(false);
      expect(CHRONICLE_TRACKER.reduce(CHRONICLE_TRACKER.init(), event).entries, event.type).toEqual([]);
    }
  });
});
