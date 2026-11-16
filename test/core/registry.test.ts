import { describe, expect, it } from 'vitest';
import { Registry } from '../../src/core';
import type { Def } from '../../src/core';

interface TestDef extends Def {
  readonly power: number;
}

const def = (id: string, power = 1): TestDef => ({ id, name: id, description: '', tags: [], power });

describe('Registry', () => {
  it('returns registered defs by id', () => {
    const reg = new Registry<TestDef>('widget');
    const a = reg.register(def('widget.a', 3));
    expect(a.id).toBe('widget.a');
    expect(reg.get('widget.a').power).toBe(3);
    expect(reg.has('widget.a')).toBe(true);
    expect(reg.has('widget.b')).toBe(false);
  });

  it('throws on a duplicate id, naming the kind and id', () => {
    const reg = new Registry<TestDef>('widget');
    reg.register(def('widget.a'));
    expect(() => reg.register(def('widget.a', 2))).toThrow('Duplicate widget id "widget.a"');
    expect(reg.get('widget.a').power).toBe(1);
    expect(reg.size).toBe(1);
  });

  it('throws on an unknown id, naming the kind and id', () => {
    const reg = new Registry<TestDef>('widget');
    expect(() => reg.get('widget.missing')).toThrow('Unknown widget id "widget.missing"');
  });

  it('lists every def in registration order', () => {
    const reg = new Registry<TestDef>('widget');
    const ids = ['widget.z', 'widget.a', 'widget.m'];
    for (const id of ids) reg.register(def(id));
    expect(reg.all().map((d) => d.id)).toEqual(ids);
    expect(reg.size).toBe(3);
  });
});
