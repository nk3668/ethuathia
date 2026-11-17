import { describe, expect, it } from 'vitest';
import { hashText } from '../../src/core';

describe('hashText', () => {
  it('gives 14 hex digits (53 bits)', () => {
    for (const text of ['', 'a', 'a much longer string with § and · in it']) {
      expect(hashText(text)).toMatch(/^[0-9a-f]{14}$/);
      expect(Number.isSafeInteger(parseInt(hashText(text), 16))).toBe(true);
    }
  });

  it('is pinned, so a state hash means the same thing on every machine and in every version', () => {
    // Changing the function changes every recorded state hash in headless run reports.
    expect(hashText('')).toBe('0bdcb81aee8d83');
    expect(hashText('a')).toBe('1c2ba782c97901');
    expect(hashText('Ethuathia')).toBe('051391056e24ee');
  });

  it('tells apart strings that differ by one character or by order', () => {
    const texts = ['abc', 'abd', 'acb', 'bac', 'abc ', ' abc', '{"turn":1}', '{"turn":2}'];
    expect(new Set(texts.map(hashText)).size).toBe(texts.length);
  });
});
