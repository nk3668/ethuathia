import { describe, expect, it } from 'vitest';
import {
  checkKinds,
  CONTENT_KINDS,
  generateText,
  GRAMMAR_ADVENTURER_NAME,
  GRAMMAR_EPITAPH,
  GRAMMAR_KIND,
  GRAMMAR_TITLE,
  GRAMMARS,
  RECRUIT_NAMES,
} from '../../src/content';
import type { ContentKind, GrammarDef } from '../../src/content';
import { Registry, textRng } from '../../src/core';
import type { Def, TextVars } from '../../src/core';

function withDefs<T extends Def>(kind: ContentKind<T>, defs: unknown[]): ContentKind<T> {
  const registry = new Registry<T>(kind.registry.kind);
  for (const def of defs) registry.register(def as T);
  return { ...kind, registry };
}

const SAMPLE_VARS: Readonly<Record<string, string | number>> = {
  name: 'Mira',
  class: 'Vanguard',
  race: 'Human',
  depth: 4,
  cause: 'a crushing blow',
  killer: 'ash-wight',
};

function varsFor(def: GrammarDef): TextVars {
  const vars: Record<string, string | number> = {};
  for (const key of def.vars ?? []) {
    vars[key] = SAMPLE_VARS[key] ?? `sample_${key}`;
  }
  return vars;
}

describe('shipped grammars', () => {
  it('registers GRAMMAR_KIND in CONTENT_KINDS and defines the initial grammars', () => {
    expect(CONTENT_KINDS).toContain(GRAMMAR_KIND);
    expect(GRAMMARS.all().map((d) => d.id)).toEqual([
      'grammar.adventurer_name',
      'grammar.title',
      'grammar.epitaph',
    ]);
  });

  it('expands 1,000 samples of every shipped grammar with no leftover braces or missing variables', () => {
    for (const def of GRAMMARS.all()) {
      const vars = varsFor(def);
      for (let i = 0; i < 1000; i++) {
        const text = generateText(def.id, textRng(1000 + i, def.id, i), vars, { strict: true });
        expect(text.trim().length, `${def.id} #${i}`).toBeGreaterThan(0);
        expect(text, `${def.id} #${i}`).not.toContain('{');
        expect(text, `${def.id} #${i}`).not.toContain('}');
        expect(text, `${def.id} #${i}`).not.toContain('[?');
      }
    }
  });

  it('keeps RECRUIT_NAMES reachable alongside coined names in grammar.adventurer_name', () => {
    const knownSet = new Set(RECRUIT_NAMES);
    let sawKnown = false;
    let sawCoined = false;
    for (let i = 0; i < 200; i++) {
      const name = generateText(GRAMMAR_ADVENTURER_NAME.id, textRng(77, 'recruit-name', i), {}, { strict: true });
      if (knownSet.has(name)) sawKnown = true;
      else sawCoined = true;
    }
    expect(sawKnown).toBe(true);
    expect(sawCoined).toBe(true);
  });

  it('supports both slain (with killer) and fell (without killer) entry symbols on grammar.epitaph', () => {
    const slain = generateText(
      GRAMMAR_EPITAPH.id,
      textRng(12, 'epitaph', 'adv.1'),
      { name: 'Oren', class: 'Vanguard', race: 'Human', depth: 3, cause: 'a poisoned fang', killer: 'gloam rat' },
      { symbol: 'slain', strict: true },
    );
    expect(slain).toContain('Oren');
    expect(slain).toContain('a gloam rat');

    // No killer variable passed; expanding `fell` in strict mode succeeds without error.
    const fell = generateText(
      GRAMMAR_EPITAPH.id,
      textRng(12, 'epitaph', 'adv.2'),
      { name: 'Tamsin', class: 'Vanguard', race: 'Human', depth: 2, cause: 'hunger' },
      { symbol: 'fell', strict: true },
    );
    expect(fell).toContain('Tamsin');
    expect(fell).toContain('hunger');

    const title = generateText(
      GRAMMAR_TITLE.id,
      textRng(12, 'title', 'adv.1'),
      { name: 'Vell', class: 'Vanguard', race: 'Human' },
      { strict: true },
    );
    expect(title).toContain('Vell');
  });
});

describe('GRAMMAR_KIND validation', () => {
  const baseDef: GrammarDef = {
    id: 'grammar.test',
    name: 'Test grammar',
    description: 'A test grammar definition for content validation checks.',
    tags: [],
    rules: { root: ['Hello'] },
  };

  it('rejects a grammar with a missing symbol, an undeclared variable or an infinite cycle', () => {
    const problems = checkKinds([
      withDefs(GRAMMAR_KIND, [
        { ...baseDef, id: 'grammar.bad_sym', rules: { root: ['{missing}'] } },
        { ...baseDef, id: 'grammar.bad_var', rules: { root: ['{$who}'] } },
        { ...baseDef, id: 'grammar.infinite', rules: { root: ['{a}'], a: ['{root}'] } },
      ]),
    ]);

    expect(problems).toContain('grammar "grammar.bad_sym": rules.root[0] refers to unknown symbol "missing"');
    expect(problems).toContain('grammar "grammar.bad_var": rules.root[0] uses undeclared variable "$who"');
    expect(problems).toContain('grammar "grammar.infinite": symbol "root" cannot terminate (infinite recursion)');
    expect(problems).toContain('grammar "grammar.infinite": symbol "a" cannot terminate (infinite recursion)');
  });
});
