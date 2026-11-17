/**
 * Content validation as a command (docs/ARCHITECTURE.md §5): the same checks the game runs at
 * start-up (`checkGame`), with a report of what was checked. It runs as part of `npm test`
 * through `test/tools/validate-content.test.ts`, and on its own with `npm run validate:content`.
 */
import { CONTENT_KINDS } from '../src/content';
import { checkGame } from '../src/sim';

export interface ContentReport {
  /** Every problem found, each naming the def or table at fault. Empty when all is well. */
  problems: string[];
  /** One line per content kind: `class: 1`. */
  counts: string[];
}

export function validateContent(): ContentReport {
  return {
    problems: checkGame(),
    counts: CONTENT_KINDS.map((k) => `${k.registry.kind}: ${k.registry.size}`),
  };
}

/** The report as text, for the console. */
export function formatReport(report: ContentReport): string {
  const head = `Content: ${report.counts.join(', ')}`;
  if (report.problems.length === 0) return `${head}\nNo problems found.`;
  return `${head}\n${report.problems.length} problem(s):\n${report.problems.map((p) => `  - ${p}`).join('\n')}`;
}
