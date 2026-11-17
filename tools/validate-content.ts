/**
 * `npm run validate:content`: the same checks the game runs at start-up (`checkGame`: content
 * shapes and references plus the sim-side checks), with a report of what was checked
 * (docs/ARCHITECTURE.md §5). Run with `tsx`; it prints the report and exits with code 1 when
 * there are problems. `npm test` runs the same checks through `test/tools/validate-content.test.ts`.
 */
import { pathToFileURL } from 'node:url';
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

/** Prints the report (to stderr when there are problems) and returns the exit code: 0 clean, 1 problems. */
export function main(
  report: ContentReport = validateContent(),
  out: Pick<Console, 'log' | 'error'> = console,
): number {
  const text = formatReport(report);
  if (report.problems.length === 0) {
    out.log(text);
    return 0;
  }
  out.error(text);
  return 1;
}

// Run only as a command, not when a test imports this file.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
