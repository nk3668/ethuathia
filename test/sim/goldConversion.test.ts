/**
 * Gold-to-Trophies conversion (ETH-083): leftover in-run gold converts to Trophies on exit
 * (victory and retreat) after the Omen multiplier, is never in `rewards.atRisk`, and is lost on
 * a wipe. Fixed seeds, hand-built floors.
 */
import { describe, expect, it } from 'vitest';
import { GOLD_PER_TROPHY, goldToTrophies, ITEM_GOLD, MONSTERS } from '../../src/content';
import { applyRunResult, checkRunResult, newProfile } from '../../src/meta';
import {
  checkInvariants,
  createRun,
  emptyRunResult,
  favorKey,
  getEntity,
  placeItem,
  runResult,
  spawnMonster,
  step,
  TROPHIES,
  trophiesForKill,
  VICTORY_CHECKS,
  wipeLoss,
} from '../../src/sim';
import type { ActorEntity, Command, EntityId, RunConfig, RunModifierConfig, RunState, SimEvent, VictoryCheck } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const D1 = ['#######', '#<@.$.#', '#######'].map((r) => r.replace('$', '.'));
const CONFIG: RunConfig = { party: [HERO], depth: 1, floorTexts: [D1], monsters: false };

const OMEN_BONUS: RunModifierConfig = {
  key: 'omen.test_gold_bonus',
  source: { id: 'bundle.test_gold_bonus', label: 'Test Omen (+50%)' },
  scope: 'party',
  rewardBonus: 0.5,
};

function setup(runModifiers?: RunModifierConfig[]): { state: RunState; hero: ActorEntity } {
  const state = createRun({ ...CONFIG, ...(runModifiers ? { runModifiers } : {}) }, 1);
  return { state, hero: getEntity(state, state.party[0] as EntityId) as ActorEntity };
}

function withVictoryCheck<T>(fn: () => T): T {
  const check: VictoryCheck = { id: 'victory.test_gold', check: () => ({ applies: true, met: true, detail: 'Contract met.' }) };
  VICTORY_CHECKS.push(check);
  try {
    return fn();
  } finally {
    VICTORY_CHECKS.splice(VICTORY_CHECKS.indexOf(check), 1);
  }
}

/**
 * Kills a 1-HP monster (`threat: 2`, so ×1.5 Omen = 3 at-risk Trophies) and picks up `gold`
 * via real sim actions, leaving the run active and ready to exit or wipe.
 */
function earnKillAndGold(state: RunState, hero: ActorEntity, gold: number): { events: SimEvent[]; baseKillTrophies: number } {
  const events: SimEvent[] = [];
  const defId = 'monster.mire_toad';
  const threat = MONSTERS.get(defId).threat;
  const foe = spawnMonster(state, defId, 'd1', { x: hero.pos.x + 1, y: hero.pos.y });
  if (foe.actor === undefined) throw new Error('Expected monster actor');
  foe.actor.hp = 1;
  if (gold > 0) placeItem(state, 'd1', hero.pos, { def: ITEM_GOLD.id, qty: gold });

  for (let i = 0; i < 30 && (state.entities[foe.id] !== undefined || state.domains.items.gold < gold); i++) {
    const batch = step(state, [], {
      decide: ({ actor }) => {
        if (actor.id !== hero.id) return { id: 'wait' };
        if (state.domains.items.gold < gold) return { id: 'pickup' };
        return { id: 'attack', dir: { x: 1, y: 0 } };
      },
    });
    events.push(...batch);
    expect(checkInvariants(state)).toEqual([]);
  }
  expect(state.entities[foe.id]).toBeUndefined();
  expect(state.domains.items.gold).toBe(gold);
  return { events, baseKillTrophies: trophiesForKill(threat) };
}

function exitDungeon(state: RunState): SimEvent[] {
  const events: SimEvent[] = [];
  let commands: Command[] = [{ type: 'retreat' }];
  for (let i = 0; i < 20 && state.domains.run.end === null; i++) {
    events.push(...step(state, commands));
    commands = [];
    expect(checkInvariants(state)).toEqual([]);
  }
  return events;
}

describe('goldToTrophies', () => {
  it('converts positive finite gold at GOLD_PER_TROPHY rounded down and returns 0 otherwise', () => {
    expect(GOLD_PER_TROPHY).toBe(10);
    expect(goldToTrophies(0)).toBe(0);
    expect(goldToTrophies(-15)).toBe(0);
    expect(goldToTrophies(Number.NaN)).toBe(0);
    expect(goldToTrophies(Number.POSITIVE_INFINITY)).toBe(0);
    expect(goldToTrophies(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(goldToTrophies(1)).toBe(0);
    expect(goldToTrophies(9)).toBe(0);
    expect(goldToTrophies(10)).toBe(1);
    expect(goldToTrophies(19)).toBe(1);
    expect(goldToTrophies(25)).toBe(2);
    expect(goldToTrophies(50)).toBe(5);
    expect(goldToTrophies(25, 5)).toBe(5);
    expect(goldToTrophies(25, 0)).toBe(0);
    expect(goldToTrophies(25, -2)).toBe(0);
    expect(goldToTrophies(25, Number.NaN)).toBe(0);
  });

  it('documents the conversion rate and wipe loss in ITEM_GOLD.description', () => {
    expect(ITEM_GOLD.description).toContain(`${GOLD_PER_TROPHY} gold = 1 Trophy`);
    expect(ITEM_GOLD.description).toContain('lost on a wipe');
  });
});

describe('gold conversion at run end', () => {
  it('converts leftover gold on victory after the Omen multiplier without multiplying gold itself', () => {
    withVictoryCheck(() => {
      const { state, hero } = setup([OMEN_BONUS]);
      const { baseKillTrophies } = earnKillAndGold(state, hero, 25);

      // Gold never enters `rewards.atRisk`; only kill Trophies are multiplied by 1.5.
      const expectedAtRiskTrophies = Math.floor(baseKillTrophies * 1.5);
      expect(state.domains.run.rewards.atRisk[TROPHIES]).toBe(expectedAtRiskTrophies);

      const exitEvents = exitDungeon(state);
      expect(exitEvents.map((e) => e.type).slice(-3)).toEqual(['leftDungeon', 'goldSettled', 'runEnded']);
      expect(exitEvents.find((e) => e.type === 'goldSettled')).toMatchObject({
        type: 'goldSettled',
        gold: 25,
        trophies: 2,
        lost: false,
      });

      const result = runResult(state);
      expect(result.outcome).toBe('victory');
      expect(result.atRisk[TROPHIES]).toBe(expectedAtRiskTrophies);
      expect(result.lost).toEqual({});
      // 25 gold -> 2 Trophies (NOT floor(2 * 1.5) = 3).
      expect(result.converted).toEqual({ [TROPHIES]: 2 });
      expect(result.extras['run.gold']).toEqual({ gold: 25, trophies: 2, rate: GOLD_PER_TROPHY });
      expect(checkInvariants(state)).toEqual([]);

      const after = applyRunResult(newProfile(), result);
      expect(after.currencies.trophies).toBe(expectedAtRiskTrophies + 2);
      expect(after.history.recent[0]?.banked.trophies).toBe(expectedAtRiskTrophies + 2);
      expect(after.history.recent[0]?.gold).toEqual({ gold: 25, trophies: 2, rate: GOLD_PER_TROPHY });
    });
  });

  it('converts leftover gold on retreat after the Omen multiplier and banks the sum', () => {
    const { state, hero } = setup([OMEN_BONUS]);
    const { baseKillTrophies } = earnKillAndGold(state, hero, 40);
    const expectedAtRiskTrophies = Math.floor(baseKillTrophies * 1.5);

    const exitEvents = exitDungeon(state);
    expect(exitEvents.map((e) => e.type).slice(-3)).toEqual(['leftDungeon', 'goldSettled', 'runEnded']);
    expect(exitEvents.find((e) => e.type === 'goldSettled')).toMatchObject({
      type: 'goldSettled',
      gold: 40,
      trophies: 4,
      lost: false,
    });

    const result = runResult(state);
    expect(result.outcome).toBe('retreat');
    expect(result.atRisk[TROPHIES]).toBe(expectedAtRiskTrophies);
    expect(result.lost).toEqual({});
    expect(result.converted).toEqual({ [TROPHIES]: 4 });
    expect(result.extras['run.gold']).toEqual({ gold: 40, trophies: 4, rate: GOLD_PER_TROPHY });
    expect(checkInvariants(state)).toEqual([]);

    const after = applyRunResult(newProfile(), result);
    expect(after.currencies.trophies).toBe(expectedAtRiskTrophies + 4);
  });

  it('loses all gold on a wipe while taking 25% of at-risk currencies, emitting goldSettled after earningsLost', () => {
    const { state, hero } = setup([OMEN_BONUS]);
    const { baseKillTrophies } = earnKillAndGold(state, hero, 35);
    const expectedAtRiskTrophies = Math.floor(baseKillTrophies * 1.5);

    hero.actor.hp = 0;
    const wipeEvents = step(state, []);
    expect(checkInvariants(state)).toEqual([]);
    expect(wipeEvents.map((e) => e.type).slice(-4)).toEqual(['fell', 'earningsLost', 'goldSettled', 'runEnded']);
    expect(wipeEvents.find((e) => e.type === 'goldSettled')).toMatchObject({
      type: 'goldSettled',
      gold: 35,
      trophies: 0,
      lost: true,
    });

    const result = runResult(state);
    expect(result.outcome).toBe('wipe');
    expect(result.atRisk[TROPHIES]).toBe(expectedAtRiskTrophies);
    expect(result.lost).toEqual(wipeLoss(result.atRisk, 'wipe'));
    expect(result.converted).toBeUndefined();
    expect('converted' in result).toBe(false);
    expect(result.extras['run.gold']).toEqual({ gold: 35, trophies: 0, rate: GOLD_PER_TROPHY });

    const after = applyRunResult(newProfile(), result);
    expect(after.currencies.trophies).toBe(expectedAtRiskTrophies - (result.lost[TROPHIES] ?? 0));
    expect(after.history.recent[0]?.gold).toEqual({ gold: 35, trophies: 0, rate: GOLD_PER_TROPHY });
  });

  it('omits goldSettled when gold is 0, and omits converted when gold converts to 0 Trophies', () => {
    const zero = setup();
    const zeroExit = exitDungeon(zero.state);
    expect(zeroExit.some((e) => e.type === 'goldSettled')).toBe(false);
    const zeroResult = runResult(zero.state);
    expect('converted' in zeroResult).toBe(false);
    expect(zeroResult.extras['run.gold']).toEqual({ gold: 0, trophies: 0, rate: GOLD_PER_TROPHY });

    const small = setup();
    earnKillAndGold(small.state, small.hero, 7);
    const smallExit = exitDungeon(small.state);
    expect(smallExit.find((e) => e.type === 'goldSettled')).toMatchObject({ gold: 7, trophies: 0, lost: false });
    const smallResult = runResult(small.state);
    expect('converted' in smallResult).toBe(false);
    expect(smallResult.extras['run.gold']).toEqual({ gold: 7, trophies: 0, rate: GOLD_PER_TROPHY });
  });
});

describe('checkRunResult validation of converted', () => {
  it('accepts valid converted amounts on victory/retreat and rejects invalid or wipe-positive ones', () => {
    expect(checkRunResult({ ...emptyRunResult('victory'), converted: { [TROPHIES]: 3, [favorKey('deity.dawn')]: 1 } })).toEqual([]);
    expect(checkRunResult({ ...emptyRunResult('wipe'), converted: { [TROPHIES]: 0 } })).toEqual([]);

    expect(checkRunResult({ ...emptyRunResult('wipe'), converted: { [TROPHIES]: 1 } })).toEqual([
      expect.stringMatching(/converted\.trophies .* cannot be positive on a wipe/),
    ]);
    expect(checkRunResult({ ...emptyRunResult('retreat'), converted: { [TROPHIES]: -1 } })).toEqual([
      expect.stringMatching(/converted\.trophies .* finite amount/),
    ]);
    expect(checkRunResult({ ...emptyRunResult('retreat'), converted: { [TROPHIES]: Number.NaN } })).toEqual([
      expect.stringMatching(/converted\.trophies .* finite amount/),
    ]);
    expect(checkRunResult({ ...emptyRunResult('retreat'), converted: { gold: 5 } })).toEqual([
      expect.stringMatching(/converted\.gold is not a currency id/),
    ]);
    expect(() => applyRunResult(newProfile(), { ...emptyRunResult('wipe'), converted: { [TROPHIES]: 2 } })).toThrow(RangeError);
  });
});
