/** ETH-036: classes and races are revealed by a milestone, bought in the town, and teased as random recruits. */
import { describe, expect, it } from 'vitest';
import { requirementKey, UPGRADES } from '../../src/content';
import type { Requirement } from '../../src/content';
import {
  applyRunResult,
  availableClasses,
  availableRaces,
  buildRunConfig,
  canPurchase,
  checkProfile,
  decodeSave,
  defaultRunChoices,
  encodeSave,
  isMilestoneOpen,
  isTeaser,
  latestUnlocks,
  masteryClasses,
  milestoneRequirements,
  newProfile,
  purchase,
  TEASER_CHANCE,
} from '../../src/meta';
import type { Profile } from '../../src/meta';
import { emptyRunResult } from '../../src/sim';
import type { RunResult } from '../../src/sim';
import { trainingFields } from '../../src/ui/codex/trainingField';
import { unlockLines } from '../../src/ui/shell/runSummaryText';

const OUTRIDER = 'upgrade.outrider_training';
const LOREKEEPER = 'upgrade.lorekeeper_training';
const REAVER = 'upgrade.reaver_training';
const STONEKIN = 'upgrade.stonekin_recruitment';
const SMITHY = 'building.smithy';
const REAVER_REQ: Requirement = { cond: 'cond.run_kills', params: { min: 40 } };
const LOREKEEPER_REQ: Requirement = { cond: 'cond.run_identified', params: { min: 5 } };

const rich = (p: Profile = newProfile()): Profile => ({ ...p, currencies: { renown: 10_000, trophies: 10_000, favor: {} } });
const reached = (depth: number, outcome: RunResult['outcome'] = 'retreat'): RunResult => ({ ...emptyRunResult(outcome), deepestDepth: depth });
const metReq = (req: Requirement, depth = 1, outcome: RunResult['outcome'] = 'retreat'): RunResult => ({
  ...reached(depth, outcome),
  extras: { 'track.requirements': { met: [requirementKey(req)] } },
});
const smithyOpen = (p: Profile): Profile => ({ ...p, milestones: { unlocked: [...p.milestones.unlocked, { id: SMITHY, run: 1 }] } });
const classIds = (p: Profile) => availableClasses(p).map((d) => d.id);
const raceIds = (p: Profile) => availableRaces(p).map((d) => d.id);

describe('revealing a class or race', () => {
  it('seals the node until a run meets its milestone, with the cost still shown', () => {
    const p = rich();
    expect(canPurchase(p, OUTRIDER)).toMatchObject({ ok: false, status: 'locked', reason: 'Revealed when you reach floor 4.' });
    expect(() => purchase(p, OUTRIDER)).toThrow(/Revealed when you reach floor 4/);
    expect(UPGRADES.get(OUTRIDER).cost).toEqual({ renown: 150 });
    expect(isMilestoneOpen(p, OUTRIDER)).toBe(false);
  });

  it('records the reveal once, with a run-summary line, and then lets the node be bought', () => {
    let p = applyRunResult(rich(), reached(3));
    expect(isMilestoneOpen(p, OUTRIDER)).toBe(false);
    p = applyRunResult(p, reached(4));
    expect(p.milestones.unlocked).toEqual([{ id: OUTRIDER, run: 2 }]);
    expect(latestUnlocks(p)).toEqual([{ id: OUTRIDER, run: 2 }]);
    const lines = unlockLines(p);
    expect(lines).toEqual([{ id: OUTRIDER, name: 'Outrider Training', why: 'you reached floor 4', reveals: { building: 'Guild Hall' } }]);
    expect(checkProfile(p)).toEqual([]);

    p = applyRunResult(p, reached(6));
    expect(p.milestones.unlocked.filter((u) => u.id === OUTRIDER)).toHaveLength(1);

    expect(classIds(p)).not.toContain('class.outrider');
    expect(canPurchase(p, OUTRIDER)).toEqual({ ok: true });
    p = purchase(p, OUTRIDER);
    expect(classIds(p)).toContain('class.outrider');
  });

  it('keeps the Smithy classes behind the Smithy and the milestone, and prices them in Trophies', () => {
    expect(UPGRADES.get(REAVER).cost).toEqual({ trophies: 200 });
    expect(UPGRADES.get(STONEKIN).cost).toEqual({ trophies: 200 });
    expect(canPurchase(smithyOpen(rich()), REAVER)).toMatchObject({
      ok: false,
      status: 'locked',
      reason: 'Revealed when you achieve in one run: killed 40 monsters.',
    });
    // Revealed (40 kills in a run) but the Smithy is shut.
    const shut = applyRunResult(rich(), metReq(REAVER_REQ, 1));
    expect(isMilestoneOpen(shut, REAVER)).toBe(true);
    expect(canPurchase(shut, REAVER)).toMatchObject({ ok: false, status: 'locked' });
    const open = smithyOpen(shut);
    expect(canPurchase(open, REAVER)).toEqual({ ok: true });
    expect(raceIds(purchase(open, REAVER))).not.toContain('race.stonekin');
    // The Stonekin want a victory.
    expect(canPurchase(open, STONEKIN)).toMatchObject({ ok: false, reason: 'Revealed when you win a run.' });
    const won = smithyOpen(applyRunResult(rich(), reached(1, 'victory')));
    expect(raceIds(purchase(won, STONEKIN))).toContain('race.stonekin');
  });

  it('reveals the Lorekeeper at 5 identifications in one run, words sealed/Codex/summary text, and keeps old fallback saves (ETH-184)', () => {
    expect(canPurchase(rich(), LOREKEEPER)).toMatchObject({
      ok: false,
      status: 'locked',
      reason: 'Revealed when you achieve in one run: identified 5 items.',
    });
    expect(trainingFields('class.reaver')[0]?.value).toBe('Achieve in one run: killed 40 monsters. Then bought at the Smithy for 200 Trophies.');
    expect(trainingFields('class.lorekeeper')[0]?.value).toBe(
      'Achieve in one run: identified 5 items. Then bought at the Guild Hall for 250 Renown.',
    );

    const afterReaver = applyRunResult(rich(), metReq(REAVER_REQ, 1));
    expect(unlockLines(afterReaver)).toEqual([
      { id: REAVER, name: 'Reaver Training', why: 'you achieved in one run: killed 40 monsters', reveals: { building: 'Smithy' } },
    ]);

    let p = applyRunResult(rich(), metReq(LOREKEEPER_REQ, 1));
    expect(isMilestoneOpen(p, LOREKEEPER)).toBe(true);
    expect(unlockLines(p)).toEqual([
      { id: LOREKEEPER, name: 'Lorekeeper Training', why: 'you achieved in one run: identified 5 items', reveals: { building: 'Guild Hall' } },
    ]);
    p = applyRunResult(p, metReq(LOREKEEPER_REQ, 1));
    expect(p.milestones.unlocked.filter((u) => u.id === LOREKEEPER)).toHaveLength(1);
    expect(classIds(purchase(p, LOREKEEPER))).toContain('class.lorekeeper');

    // Old fallback saves that already recorded Reaver (floor 5) or Lorekeeper (5 runs) keep the reveal.
    const legacy: Profile = {
      ...smithyOpen(rich()),
      milestones: {
        unlocked: [
          { id: SMITHY, run: 1 },
          { id: REAVER, run: 2 },
          { id: LOREKEEPER, run: 5 },
        ],
      },
    };
    const decoded = decodeSave(encodeSave(legacy, 1234));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error('expected legacy save to decode');
    expect(checkProfile(decoded.profile)).toEqual([]);
    expect(isMilestoneOpen(decoded.profile, REAVER)).toBe(true);
    expect(isMilestoneOpen(decoded.profile, LOREKEEPER)).toBe(true);
    expect(milestoneRequirements(decoded.profile)).toEqual([]);
    expect(canPurchase(decoded.profile, REAVER)).toEqual({ ok: true });
    expect(canPurchase(decoded.profile, LOREKEEPER)).toEqual({ ok: true });
    // Banking a later run that meets neither new condition leaves both recorded reveals intact.
    const afterQuietRun = applyRunResult(decoded.profile, reached(1));
    expect(afterQuietRun.milestones.unlocked).toEqual(legacy.milestones.unlocked);
  });
});

describe('no grandfathering', () => {
  it('loads a save that played a now-locked class with it locked and its Mastery intact', () => {
    const old: Profile = { ...newProfile(), mastery: { classes: { 'class.reaver': { xp: 120, runs: 3 } } } };
    expect(checkProfile(old)).toEqual([]);
    expect(classIds(old)).toEqual(['class.vanguard']);
    expect(raceIds(old)).toEqual(['race.human']);
    expect(masteryClasses(old).map((d) => d.id)).toContain('class.reaver');
    expect(old.mastery.classes['class.reaver']?.xp).toBe(120);
    // A later run does not take the Mastery away.
    expect(applyRunResult(old, reached(2)).mastery.classes['class.reaver']?.xp).toBe(120);
  });
});

describe('teaser recruits', () => {
  const draw = (profile: Profile, seeds: number) =>
    Array.from({ length: seeds }, (_, seed) => buildRunConfig(profile, defaultRunChoices(), seed + 1).party[0]);

  it('offers none while nothing is revealed', () => {
    const p = rich();
    for (const m of draw(p, 200)) {
      expect(m?.classId).toBe('class.vanguard');
      expect(m?.raceId).toBe('race.human');
    }
    expect(isTeaser(p, 'class.outrider')).toBe(false);
  });

  it('draws a revealed, unbought class or race at about TEASER_CHANCE, and only those', () => {
    // Reveals Outrider (depth 4) and Reaver (40 kills in one run); the Smithy is shut but the reveal counts.
    const p = applyRunResult(rich(), metReq(REAVER_REQ, 4));
    expect(isTeaser(p, 'class.outrider')).toBe(true);
    expect(isTeaser(p, 'class.lorekeeper')).toBe(false);
    const party = draw(p, 1000);
    const classes = party.map((m) => m?.classId);
    // Two teaser classes share the 10% roll, so each shows at TEASER_CHANCE / 2.
    const rate = classes.filter((c) => c === 'class.outrider' || c === 'class.reaver').length / party.length;
    expect(rate).toBeGreaterThan(TEASER_CHANCE * 0.6);
    expect(rate).toBeLessThan(TEASER_CHANCE * 1.5);
    expect(new Set(classes)).toEqual(new Set(['class.vanguard', 'class.outrider', 'class.reaver']));
    expect(party.every((m) => m?.raceId === 'race.human')).toBe(true);
  });

  it('stops teasing a class once it is bought', () => {
    const p = purchase(applyRunResult(rich(), reached(4)), OUTRIDER);
    expect(isTeaser(p, 'class.outrider')).toBe(false);
    // Now an ordinary pick, at an even share with the Vanguard.
    const rate = draw(p, 600).filter((m) => m?.classId === 'class.outrider').length / 600;
    expect(rate).toBeGreaterThan(0.4);
  });
});
