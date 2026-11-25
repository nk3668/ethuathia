import { describe, expect, it } from 'vitest';
import {
  MONSTER_ROLES,
  MONSTER_TEMPLATES,
  MONSTERS,
  monsterRules,
  templateFits,
  validateContent,
} from '../../src/content';
import type { MonsterDef } from '../../src/content';
import {
  checkGame,
  checkInvariants,
  createRun,
  fireTrigger,
  forEachBundle,
  getEntity,
  monstersForDanger,
  spawnHp,
  spawnMonster,
  statValue,
  step,
} from '../../src/sim';
import type { ActorEntity, EntityId, SimEvent } from '../../src/sim';
import { STATS_DOMAIN } from '../../src/sim/stats';
import { GEN_STEPS, RULE_ACTIONS, TRIGGERS } from '../../src/sim/registries';
import { STAT_REFS } from '../../src/sim/stats/statIds';
import { CONDITION_TARGET } from '../../src/sim/ai/requirements';

const BANNED_IDENTITIES = [
  'selyk',
  'kobold',
  'goblin',
  'orc',
  'gnoll',
  'jackal',
  'ogre',
  'troll',
  'wight',
  'wraith',
  'lich',
  'golem',
  'floating eye',
  'grid bug',
  'shrieker',
  'cockatrice',
  'mind flayer',
  'minotaur',
];

const BANDS = [
  { name: 'Outskirts (1–2)', min: 1, max: 2, expectedPeakMin: 4 },
  { name: 'Galleries (3–5)', min: 3, max: 5, expectedPeakMin: 5 },
  { name: 'Deep Workings (6–8)', min: 6, max: 8, expectedPeakMin: 4 },
  { name: 'Abyssal Strata (9–11)', min: 9, max: 11, expectedPeakMin: 4 },
] as const;

const REQUIRED_TAGS = ['beast', 'small_folk', 'swarm', 'fungus', 'undead', 'construct', 'giant'] as const;

const peakOf = (def: MonsterDef): number => def.danger.peak ?? (def.danger.min + def.danger.max) / 2;

describe('ETH-134 expanded bestiary', () => {
  it('passes validateContent and checkGame cleanly', () => {
    expect(() => validateContent([GEN_STEPS, STAT_REFS, CONDITION_TARGET, RULE_ACTIONS, TRIGGERS])).not.toThrow();
    expect(checkGame()).toEqual([]);
  });

  it('has 18–22 original monsters populating all 4 Danger bands, all 5 roles, and all ecology tags', () => {
    const all = MONSTERS.all();
    expect(all.length).toBeGreaterThanOrEqual(18);
    expect(all.length).toBeLessThanOrEqual(22);

    // Every Danger integer 1..11 has a diverse pool, and each band has native peak-centered threats.
    for (let d = 1; d <= 11; d++) {
      expect(monstersForDanger(d).length, `Danger ${d}`).toBeGreaterThanOrEqual(5);
    }
    for (const band of BANDS) {
      const peakedInBand = all.filter((m) => {
        const peak = peakOf(m);
        return peak >= band.min && peak <= band.max;
      });
      expect(peakedInBand.length, band.name).toBeGreaterThanOrEqual(band.expectedPeakMin);
    }

    for (const role of MONSTER_ROLES) {
      const members = all.filter((m) => m.role === role);
      expect(members.length, `role ${role}`).toBeGreaterThanOrEqual(3);
    }

    for (const tag of REQUIRED_TAGS) {
      expect(all.some((m) => m.tags.includes(tag)), `tag ${tag}`).toBe(true);
    }
  });

  it('calibrates stats across all axes per DIFFICULTY_PHILOSOPHY §8.1–8.2 and uses explicit peaks for wide ranges', () => {
    const all = MONSTERS.all();
    // Wide high-Danger ranges (max >= 14) must provide explicit peak so tapering centers properly.
    for (const m of all) {
      if (m.danger.max >= 14) {
        expect(m.danger.peak, `${m.id} needs explicit peak`).toBeDefined();
        expect((m.danger.peak as number) <= 12, `${m.id} peak should sit in target Danger bands`).toBe(true);
      }
      expect(m.stats.hp).toBeGreaterThanOrEqual(3);
      expect(m.stats.speed).toBeGreaterThanOrEqual(75);
      expect(m.stats.speed).toBeLessThanOrEqual(130);
      expect(m.threat).toBeGreaterThanOrEqual(1);
      expect(monsterRules(m).length).toBeGreaterThan(0);
    }

    // Stat scaling check: average brute threat, HP, damage, accuracy, and armor rise from Band 1–2 to Band 9–11.
    const bandStats = (min: number, max: number) => {
      const group = all.filter((m) => {
        const p = peakOf(m);
        return p >= min && p <= max;
      });
      const mean = (fn: (m: MonsterDef) => number) => group.reduce((s, m) => s + fn(m), 0) / group.length;
      return {
        hp: mean((m) => m.stats.hp),
        damage: mean((m) => m.stats.damage),
        accuracy: mean((m) => m.stats.accuracy),
        armor: mean((m) => m.stats.armor),
        threat: mean((m) => m.threat),
      };
    };
    const low = bandStats(1, 2);
    const mid = bandStats(3, 5);
    const deep = bandStats(6, 8);
    const abyss = bandStats(9, 11);
    expect(mid.hp).toBeGreaterThan(low.hp);
    expect(deep.hp).toBeGreaterThan(mid.hp);
    expect(abyss.hp).toBeGreaterThan(deep.hp);
    expect(abyss.damage).toBeGreaterThan(low.damage);
    expect(abyss.accuracy).toBeGreaterThan(low.accuracy);
    expect(abyss.armor).toBeGreaterThan(low.armor);
    expect(abyss.threat).toBeGreaterThan(deep.threat);
    expect(deep.threat).toBeGreaterThan(mid.threat);
    expect(mid.threat).toBeGreaterThan(low.threat);
  });

  it('includes innate Bundle traits (on-hit statuses, turn-start regeneration, statusResist) that work in sim', () => {
    const all = MONSTERS.all();
    const triggerEffects = all.flatMap((m) => m.bundle?.triggers ?? []);
    const appliedStatuses = new Set(
      triggerEffects.flatMap((t) =>
        t.on === 'trigger.hit'
          ? t.effects.flatMap((e) => (e.kind === 'applyStatus' ? [e.status] : []))
          : [],
      ),
    );
    expect(appliedStatuses).toEqual(new Set(['status.poisoned', 'status.dazzled', 'status.queasy']));

    expect(
      triggerEffects.some((t) => t.on === 'trigger.turn_start' && t.effects.some((e) => e.kind === 'heal' && e.amount === 1)),
    ).toBe(true);

    expect(
      all.some((m) => (m.bundle?.modifiers ?? []).some((mod) => mod.stat === 'statusResist' && mod.value > 0)),
    ).toBe(true);

    // Sim check: innate statusResist, on-hit status, and turn_start heal 1 HP all take effect.
    const state = createRun(
      {
        party: [{ name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' }],
        floorText: ['###########', '#@........#', '#.........#', '###########'],
        monsters: false,
      },
      7,
    );
    const hero = getEntity(state, state.party[0] as EntityId) as ActorEntity;
    if (hero.ai !== undefined) hero.ai.rules = [{ condition: { id: 'cond.always' }, action: { id: 'act.wait' }, enabled: true }];

    const sentinel = spawnMonster(state, 'monster.crypt_sentinel', 'd1', { x: 8, y: 2 }) as ActorEntity;
    expect(statValue(state, sentinel, 'statusResist')).toBe(30);

    const giant = spawnMonster(state, 'monster.basalt_giant', 'd1', { x: 9, y: 2 }) as ActorEntity;
    expect(spawnHp(MONSTERS.get('monster.basalt_giant'), undefined)).toBe(giant.actor.hp);
    giant.actor.hp -= 3;
    const beforeHeal = giant.actor.hp;
    const events: SimEvent[] = [];
    STATS_DOMAIN.turnStart?.({ state, actor: giant, emit: (e) => events.push({ ...e, turn: state.turn } as SimEvent), events });
    expect(giant.actor.hp).toBe(beforeHeal + 1);
    expect(events.some((e) => e.type === 'healed' && e.actor === giant.id && e.amount === 1)).toBe(true);

    const spitter = spawnMonster(state, 'monster.tarn_spitter', 'd1', { x: 5, y: 1 }) as ActorEntity;
    const sources: string[] = [];
    forEachBundle(state, spitter, (_b, id) => sources.push(id));
    expect(sources).toContain('monster.tarn_spitter');
    fireTrigger(state, spitter, 'trigger.hit', () => undefined, hero.id);
    expect(hero.stats?.statuses.some((s) => s.status === 'status.queasy' && s.by?.id === spitter.id)).toBe(true);
    expect(checkInvariants(state)).toEqual([]);
    step(state, []);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('uses clean-room original names, valid single-char hex glyphs, descriptions, and ETH-091 hints for every monster and template', () => {
    const monsters = MONSTERS.all();
    // The Armed template only an Omen applies (ETH-186) is never rolled, so it is not part of the bestiary's set.
    const templates = MONSTER_TEMPLATES.all().filter((t) => !t.tags.includes('omen'));
    expect(new Set(monsters.map((m) => m.name.toLowerCase())).size).toBe(monsters.length);
    expect(new Set(templates.map((t) => t.name.toLowerCase())).size).toBe(templates.length);

    for (const def of [...monsters, ...templates]) {
      const hay = `${def.id} ${def.name} ${def.description} ${def.hint ?? ''}`.toLowerCase();
      for (const banned of BANNED_IDENTITIES) {
        const pattern = new RegExp(`\\b${banned}\\b`, 'i');
        expect(pattern.test(hay), `${def.id} mentions banned name "${banned}"`).toBe(false);
      }
      expect(def.description.trim().length, def.id).toBeGreaterThan(20);
      expect(def.hint?.trim().length ?? 0, def.id).toBeGreaterThan(10);
    }

    for (const m of monsters) {
      expect([...m.glyph.ch]).toHaveLength(1);
      expect(m.glyph.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('expands monster templates to 8 rollable clean-room entries with threatMul 1.5–2.0, lootTier >= 1, and glyphTint', () => {
    // The Armed template only an Omen applies (ETH-186) is never rolled, so it is not part of the bestiary's set.
    const templates = MONSTER_TEMPLATES.all().filter((t) => !t.tags.includes('omen'));
    expect(templates).toHaveLength(8);
    expect(templates.map((t) => t.name)).toEqual(
      expect.arrayContaining(['Venomous', 'Swift', 'Hulking', 'Hexspitting', 'Ironclad', 'Knitflesh', 'Dazzling', 'Relentless']),
    );
    for (const t of templates) {
      expect(t.threatMul, t.id).toBeGreaterThanOrEqual(1.5);
      expect(t.threatMul, t.id).toBeLessThanOrEqual(2);
      expect(t.lootTier, t.id).toBeGreaterThanOrEqual(1);
      expect(t.glyphTint, t.id).toMatch(/^#[0-9a-f]{6}$/);
      // At least 5 monsters fit every template so none is dead weight.
      expect(MONSTERS.all().filter((m) => templateFits(t, m)).length, t.id).toBeGreaterThanOrEqual(5);
    }
  });
});
