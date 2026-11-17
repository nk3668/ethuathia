import { describe, expect, it } from 'vitest';
import { formatReport, validateContent } from '../../tools/validate-content';

describe('tools/validate-content', () => {
  it('finds no problems in the shipped content', () => {
    const report = validateContent();
    // On failure the message lists every problem, each naming its def.
    expect(report.problems, formatReport(report)).toEqual([]);
    expect(report.counts).toContain('class: 1');
    expect(report.counts).toContain('race: 1');
  });

  it('formats a report', () => {
    expect(formatReport({ problems: [], counts: ['class: 1'] })).toBe('Content: class: 1\nNo problems found.');
    expect(formatReport({ problems: ['class "class.x": hp: must be above 0'], counts: ['class: 1'] })).toBe(
      'Content: class: 1\n1 problem(s):\n  - class "class.x": hp: must be above 0',
    );
  });
});
