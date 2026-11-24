import { describe, expect, it, vi } from 'vitest';
import { formatReport, main, validateContent } from '../../tools/validate-content';

describe('tools/validate-content', () => {
  it('finds no problems in the shipped content', () => {
    const report = validateContent();
    // On failure the message lists every problem, each naming its def.
    expect(report.problems, formatReport(report)).toEqual([]);
    expect(report.counts).toContain('class: 4');
    expect(report.counts).toContain('race: 3');
  });

  it('formats a report', () => {
    expect(formatReport({ problems: [], counts: ['class: 1'] })).toBe('Content: class: 1\nNo problems found.');
    expect(formatReport({ problems: ['class "class.x": hp: must be above 0'], counts: ['class: 1'] })).toBe(
      'Content: class: 1\n1 problem(s):\n  - class "class.x": hp: must be above 0',
    );
  });

  it('exits 0 and logs the report when there are no problems', () => {
    const out = { log: vi.fn(), error: vi.fn() };
    expect(main({ problems: [], counts: ['class: 1'] }, out)).toBe(0);
    expect(out.log).toHaveBeenCalledWith('Content: class: 1\nNo problems found.');
    expect(out.error).not.toHaveBeenCalled();
  });

  it('exits 1 and prints the problems to stderr when there are some', () => {
    const out = { log: vi.fn(), error: vi.fn() };
    const report = { problems: ['sim DEFS.door: unknown feature "feature.x"'], counts: ['class: 1'] };
    expect(main(report, out)).toBe(1);
    expect(out.error).toHaveBeenCalledWith(formatReport(report));
    expect(out.log).not.toHaveBeenCalled();
  });
});
