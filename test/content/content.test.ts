import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Registry } from '../../src/core';
import type { Def } from '../../src/core';
import {
  CLASS_KIND,
  CLASSES,
  checkContent,
  checkKinds,
  ContentError,
  CONTENT_KINDS,
  FEATURE_KIND,
  FEATURES,
  FLOOR_TYPE_KIND,
  findDef,
  findGlyph,
  RACE_KIND,
  RACES,
  TERRAIN,
  TERRAIN_KIND,
  validateContent,
} from '../../src/content';
import type { ClassDef, ContentKind, FeatureDef, FloorTypeDef, RaceDef, TerrainDef } from '../../src/content';

/** A fresh registry of `kind`'s name holding `defs` (cast: malformed defs are the point). */
function withDefs<T extends Def>(kind: ContentKind<T>, defs: unknown[]): ContentKind<T> {
  const registry = new Registry<T>(kind.registry.kind);
  for (const def of defs) registry.register(def as T);
  return { ...kind, registry };
}

const vanguard: ClassDef = { id: 'class.test', name: 'Test', description: 'A test class.', tags: [], hp: 10, mp: 0 };
const generationSteps = { kind: 'generation step', has: (id: string) => id === 'gen.rooms' };

describe('shipped content', () => {
  it('passes validation, with floor types checked against a generation step registry', () => {
    expect(checkContent([{ kind: 'generation step', has: () => true }, { kind: 'stat', has: () => true }])).toEqual([]);
  });

  it('defines the terrain and features M0 draws, each with a glyph', () => {
    expect(TERRAIN.all().map((d) => d.id)).toEqual(['terrain.wall', 'terrain.floor']);
    expect(FEATURES.all().map((d) => d.id)).toEqual(['feature.door', 'feature.stairs_up', 'feature.stairs_down']);
    for (const def of [...TERRAIN.all(), ...FEATURES.all()]) expect([...def.glyph.ch]).toHaveLength(1);
  });

  it('defines one class and one race', () => {
    expect(CLASSES.all().map((d) => d.id)).toEqual(['class.vanguard']);
    expect(RACES.all().map((d) => d.id)).toEqual(['race.human']);
  });

  it('gives every def a name and Codex description', () => {
    for (const kind of CONTENT_KINDS) {
      for (const def of kind.registry.all()) {
        expect(def.name.trim(), def.id).not.toBe('');
        expect(def.description.trim().length, def.id).toBeGreaterThan(20);
      }
    }
  });
});

describe('lookups', () => {
  it('find a def of any kind by id', () => {
    expect(findDef('class.vanguard')?.name).toBe('Vanguard');
    expect(findDef('feature.stairs_down')?.name).toBe('Stairs down');
    expect(findDef('floor.halls')?.name).toBe('Hewn Halls');
    expect(findDef('monster.cave_rat')).toBeUndefined();
  });

  it('find the glyph for a terrain, a feature and a feature state', () => {
    expect(findGlyph('terrain.wall')).toEqual({ ch: '#', color: '#b9c2ce' });
    expect(findGlyph('feature.stairs_up')).toEqual({ ch: '<', color: '#ffffff', bold: true });
    expect(findGlyph('feature.door.open')?.ch).toBe("'");
    expect(findGlyph('feature.door.closed')?.ch).toBe('+');
    // A state the feature doesn't list falls back to its plain glyph.
    expect(findGlyph('feature.stairs_up.lit')?.ch).toBe('<');
    expect(findGlyph('class.vanguard')).toBeUndefined();
    expect(findGlyph('monster.cave_rat')).toBeUndefined();
    expect(findGlyph('nothing')).toBeUndefined();
  });
});

describe('validation', () => {
  it('accepts well-formed defs', () => {
    expect(checkKinds([withDefs(CLASS_KIND, [vanguard])])).toEqual([]);
  });

  it('names the def and field of a malformed def', () => {
    const problems = checkKinds([withDefs(CLASS_KIND, [vanguard, { ...vanguard, id: 'class.frail', hp: 0 }])]);
    expect(problems).toEqual(['class "class.frail": hp: must be above 0']);
  });

  it('reports every problem in a def, with nested paths', () => {
    const terrain: TerrainDef = {
      id: 'terrain.lava',
      name: '',
      description: 'Hot.',
      tags: ['Bad Tag'],
      glyph: { ch: '~~', color: 'red' },
    };
    expect(checkKinds([withDefs(TERRAIN_KIND, [terrain])])).toEqual([
      'terrain "terrain.lava": name: must not be empty',
      'terrain "terrain.lava": tags[0]: must be lowercase letters, digits and _',
      'terrain "terrain.lava": glyph.ch: must be exactly one character',
      'terrain "terrain.lava": glyph.color: must be a lowercase #rrggbb color',
    ]);
  });

  it('rejects an id outside the kind namespace, a missing field and an unknown field', () => {
    const problems = checkKinds([
      withDefs(RACE_KIND, [
        { id: 'class.human', name: 'Human', description: 'Misfiled.', tags: [], hpBonus: 0, mpBonus: 0, speed: 100 },
        { id: 'race.slow', name: 'Slow', description: 'No speed.', tags: [], hpBonus: 0, mpBonus: 0 },
        { id: 'race.typo', name: 'Typo', description: 'Extra key.', tags: [], hpBonus: 0, mpBonus: 0, speed: 100, sped: 1 },
      ]),
    ]);
    expect(problems).toHaveLength(3);
    expect(problems[0]).toBe('race "class.human": id: must look like "race.some_name" (lowercase, digits and _)');
    expect(problems[1]).toMatch(/^race "race\.slow": speed: /);
    expect(problems[2]).toMatch(/^race "race\.typo": \(def\): .*sped/);
  });

  it('names a def without a usable id by its position', () => {
    const problems = checkKinds([withDefs(CLASS_KIND, [vanguard, { ...vanguard, id: '' }])]);
    expect(problems[0]).toMatch(/^class #2 \(no id\): id: /);
  });

  it('checks feature state glyphs', () => {
    const door: FeatureDef = {
      id: 'feature.gate',
      name: 'Gate',
      description: 'A test gate.',
      tags: [],
      glyph: { ch: '+', color: '#c08a4a' },
      states: { Open: { ch: "'", color: '#c08a4a' } },
    };
    const gate = { ...door, id: 'feature.gate2', states: { open: { ch: "'", color: '#C08A4A' } } };
    expect(checkKinds([withDefs(FEATURE_KIND, [door, gate])])).toEqual([
      'feature "feature.gate": states.Open: state names must be lowercase',
      'feature "feature.gate2": states.open.color: must be a lowercase #rrggbb color',
    ]);
  });

  it('names the def and field of a reference to an unknown id', () => {
    const floor: FloorTypeDef = {
      id: 'floor.test',
      name: 'Test floor',
      description: 'A test floor.',
      tags: [],
      size: { w: 10, h: 10 },
      steps: [{ step: 'gen.rooms' }, { step: 'gen.mazes' }],
    };
    expect(checkKinds([withDefs(FLOOR_TYPE_KIND, [floor])], [generationSteps])).toEqual([
      'floor type "floor.test": steps[1].step refers to unknown generation step "gen.mazes"',
    ]);
  });

  it('resolves references between content kinds', () => {
    interface KinDef extends Def {
      readonly race: string;
    }
    const kinKind: ContentKind<KinDef> = {
      registry: new Registry<KinDef>('kin'),
      schema: z.object({ id: z.string(), name: z.string(), description: z.string(), tags: z.array(z.string()), race: z.string() }),
      refs: (def) => [{ path: 'race', kind: 'race', id: def.race }],
    };
    const human: RaceDef = { id: 'race.human', name: 'Human', description: 'Test.', tags: [], hpBonus: 0, mpBonus: 0, speed: 100 };
    const kin = withDefs(kinKind, [
      { id: 'kin.a', name: 'A', description: 'A', tags: [], race: 'race.human' },
      { id: 'kin.b', name: 'B', description: 'B', tags: [], race: 'race.giant' },
    ]);
    expect(checkKinds([withDefs(RACE_KIND, [human]), kin])).toEqual(['kin "kin.b": race refers to unknown race "race.giant"']);
  });

  it('reports a reference it has no registry to check against', () => {
    const floor = { ...(FLOOR_TYPE_KIND.registry.all()[0] as FloorTypeDef), id: 'floor.copy' };
    expect(checkKinds([withDefs(FLOOR_TYPE_KIND, [floor])])[0]).toBe(
      'floor type "floor.copy": steps[0].step refers to a generation step, but there is no generation step registry to check it in',
    );
  });

  it('skips the reference check for a malformed def', () => {
    const floor = { id: 'floor.bad', name: 'Bad', description: 'Bad.', tags: [], size: { w: 2, h: 10 }, steps: [{ step: 'gen.nope' }] };
    expect(checkKinds([withDefs(FLOOR_TYPE_KIND, [floor])], [generationSteps])).toEqual(['floor type "floor.bad": size.w: must be at least 3']);
  });

  it('throws a ContentError listing every problem', () => {
    expect(() => validateContent()).toThrow(ContentError); // no generation step registry given
    try {
      validateContent();
    } catch (err) {
      expect((err as ContentError).problems.length).toBeGreaterThan(0);
      expect((err as ContentError).message).toMatch(/^Content failed validation \(\d+ problems?\):\n {2}- floor type "floor\.halls": /);
    }
  });
});
