import { describe, expect, it } from 'vitest';
import { checkGrammar, expand, MAX_GRAMMAR_DEPTH, parseTemplate, Rng, seedState, TEXT_FILTERS, textRng } from '../../src/core';
import type { Grammar } from '../../src/core';

describe('textRng', () => {
  it('derives an isolated deterministic stream from seed, purpose and key', () => {
    const a1 = textRng(42, 'epitaph', 'adv.1');
    const a2 = textRng(42, 'epitaph', 'adv.1');
    const b = textRng(42, 'epitaph', 'adv.2');
    const c = textRng(42, 'title', 'adv.1');

    expect(a1.state).toEqual(seedState(42, 'text/epitaph/adv.1'));
    expect(a1.nextU32()).toBe(a2.nextU32());
    expect(b.nextU32()).not.toBe(textRng(42, 'epitaph', 'adv.1').nextU32());
    expect(c.nextU32()).not.toBe(textRng(42, 'epitaph', 'adv.1').nextU32());
  });
});

describe('TEXT_FILTERS', () => {
  it('applies cap, lower, a, the, s/plural and ord filters', () => {
    expect(TEXT_FILTERS.cap('gloam rat')).toBe('Gloam rat');
    expect(TEXT_FILTERS.cap('')).toBe('');
    expect(TEXT_FILTERS.lower('Vanguard')).toBe('vanguard');

    // Indefinite article: vowels, consonants and phonetic exceptions.
    expect(TEXT_FILTERS.a('gloam rat')).toBe('a gloam rat');
    expect(TEXT_FILTERS.a('ash-wight')).toBe('an ash-wight');
    expect(TEXT_FILTERS.a('Orc')).toBe('an Orc');
    expect(TEXT_FILTERS.a('hour')).toBe('an hour');
    expect(TEXT_FILTERS.a('heirloom')).toBe('an heirloom');
    expect(TEXT_FILTERS.a('honest delve')).toBe('an honest delve');
    expect(TEXT_FILTERS.a('one-eyed hound')).toBe('a one-eyed hound');
    expect(TEXT_FILTERS.a('unique relic')).toBe('a unique relic');
    expect(TEXT_FILTERS.a('user')).toBe('a user');

    expect(TEXT_FILTERS.the('lantern')).toBe('the lantern');

    // Pluralization.
    expect(TEXT_FILTERS.s('rat')).toBe('rats');
    expect(TEXT_FILTERS.plural('spy')).toBe('spies');
    expect(TEXT_FILTERS.plural('key')).toBe('keys');
    expect(TEXT_FILTERS.plural('torch')).toBe('torches');
    expect(TEXT_FILTERS.plural('ash')).toBe('ashes');
    expect(TEXT_FILTERS.plural('hex')).toBe('hexes');
    expect(TEXT_FILTERS.plural('boss')).toBe('bosses');

    // Ordinals, including 11..13.
    expect(TEXT_FILTERS.ord('1')).toBe('1st');
    expect(TEXT_FILTERS.ord('2')).toBe('2nd');
    expect(TEXT_FILTERS.ord('3')).toBe('3rd');
    expect(TEXT_FILTERS.ord('4')).toBe('4th');
    expect(TEXT_FILTERS.ord('11')).toBe('11th');
    expect(TEXT_FILTERS.ord('12')).toBe('12th');
    expect(TEXT_FILTERS.ord('13')).toBe('13th');
    expect(TEXT_FILTERS.ord('21')).toBe('21st');
    expect(TEXT_FILTERS.ord('22')).toBe('22nd');
    expect(TEXT_FILTERS.ord('23')).toBe('23rd');
  });
});

describe('expand', () => {
  const grammar: Grammar = {
    root: ['{greeting}, {$title|a} of {place|the}!'],
    greeting: [
      { text: 'Hail', weight: 3 },
      { text: 'Well met', weight: 1 },
    ],
    place: ['low halls', 'sunken steps'],
  };

  it('produces identical output for the same seed, purpose and key', () => {
    const first = expand(grammar, 'root', textRng(99, 'test', 7), { title: 'elder' });
    const second = expand(grammar, 'root', textRng(99, 'test', 7), { title: 'elder' });
    expect(first).toBe(second);
    expect(first).toMatch(/^(Hail|Well met), an elder of the (low halls|sunken steps)!$/);
  });

  it('chains filters left-to-right on both symbols and variables', () => {
    const g: Grammar = {
      root: ['{beast|a|cap} guards {$floor|ord} arch against {foe|plural|cap}.'],
      beast: ['iron hound'],
      foe: ['sentry'],
    };
    const rng = textRng(1, 'chain', 0);
    const saved = rng.saveState();
    const out = expand(g, 'root', rng, { floor: 3 }, { strict: true });
    expect(out).toBe('An iron hound guards 3rd arch against Sentries.');
    // Every symbol in `g` has a single alternative, so zero RNG draws were made.
    expect(rng.state).toEqual(saved);
  });

  it('renders [?var] when strict is false and throws a RangeError when strict is true', () => {
    const g: Grammar = { root: ['Here lies {$name}, felled by {$killer|a}.'] };
    expect(expand(g, 'root', textRng(1, 'missing', 0), { name: 'Mira' })).toBe('Here lies Mira, felled by [?killer].');
    expect(() => expand(g, 'root', textRng(1, 'missing', 0), { name: 'Mira' }, { strict: true })).toThrow(
      new RangeError('Missing template variable "killer"'),
    );
  });

  it('caps recursion depth and throws on unknown symbols or invalid syntax', () => {
    const loop: Grammar = { root: ['{a}'], a: ['{b}'], b: ['{a}'] };
    expect(() => expand(loop, 'root', textRng(1, 'loop', 0))).toThrow(
      new RangeError(`Grammar expansion exceeded max depth (${MAX_GRAMMAR_DEPTH}) at symbol "a"`),
    );
    expect(() => expand(loop, 'root', textRng(1, 'loop', 0), {}, { maxDepth: 4 })).toThrow(/max depth \(4\)/);
    expect(() => expand({ root: ['{missing}'] }, 'root', textRng(1, 'missing', 0))).toThrow(/Unknown or empty grammar symbol "missing"/);
  });
});

describe('parseTemplate and checkGrammar', () => {
  it('rejects malformed placeholders and unknown filters', () => {
    expect(parseTemplate('hello {world')).toEqual({ ok: false, error: 'unclosed "{" at index 6' });
    expect(parseTemplate('hello } world')).toEqual({ ok: false, error: 'unmatched "}" at index 6' });
    expect(parseTemplate('hello {}')).toEqual({ ok: false, error: 'empty placeholder "{}" at index 6' });
    expect(parseTemplate('hello {a{b}}')).toEqual({ ok: false, error: 'nested "{" inside placeholder at index 8' });
    expect(parseTemplate('hello {name|shout}')).toEqual({ ok: false, error: 'unknown filter "shout" in "{name|shout}"' });
    expect(parseTemplate('hello {$}')).toEqual({ ok: false, error: 'invalid variable name "$" in "{$}"' });
  });

  it('reports missing symbols, undeclared or unused variables, unreachable symbols and infinite recursion', () => {
    const missingSym = checkGrammar({
      rules: { root: ['Hello {ghost}'] },
    });
    expect(missingSym).toEqual(['rules.root[0] refers to unknown symbol "ghost"']);

    const badVars = checkGrammar({
      vars: ['unused'],
      rules: { root: ['Hello {$undeclared}'] },
    });
    expect(badVars).toContain('rules.root[0] uses undeclared variable "$undeclared"');
    expect(badVars).toContain('vars declares "$unused", which is never used in rules');

    const unreachable = checkGrammar({
      rules: {
        root: ['Hello'],
        orphan: ['Never used'],
      },
    });
    expect(unreachable).toEqual(['symbol "orphan" is unreachable from "root"']);

    const directCycle = checkGrammar({
      rules: {
        root: ['{root} again'],
      },
    });
    expect(directCycle).toEqual(['symbol "root" cannot terminate (infinite recursion)']);

    const mutualCycle = checkGrammar({
      rules: {
        root: ['{a}'],
        a: ['{b}'],
        b: ['{a}'],
      },
    });
    expect(mutualCycle).toEqual([
      'symbol "root" cannot terminate (infinite recursion)',
      'symbol "a" cannot terminate (infinite recursion)',
      'symbol "b" cannot terminate (infinite recursion)',
    ]);

    // A recursive symbol that also has a terminating branch is productive and valid.
    const terminatingRecursion = checkGrammar({
      rules: {
        root: ['done', 'very {root}'],
      },
    });
    expect(terminatingRecursion).toEqual([]);
  });

  it('respects weighted alternatives', () => {
    const g: Grammar = {
      root: [
        { text: 'heavy', weight: 9 },
        { text: 'light', weight: 1 },
      ],
    };
    const rng = Rng.seeded(7, 'weights');
    let heavy = 0;
    for (let i = 0; i < 200; i++) {
      if (expand(g, 'root', rng) === 'heavy') heavy++;
    }
    expect(heavy).toBeGreaterThan(150);
  });
});
