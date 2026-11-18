/**
 * The `codex` slice: every content entry the player has discovered, and how (seen, killed,
 * used). The Codex tab shows entries not in it as unknown. Runs add to it through the run's
 * Codex discovery tracker (`CODEX_TRACKER` in the sim), whose final state arrives in
 * `RunResult.extras['track.codex']`.
 */
import { z } from 'zod';
import { CODEX_MARKS, CODEX_TRACKER, mergeDiscoveries } from '../../sim';
import type { CodexDiscoveries, CodexMark } from '../../sim';
import { defineSlice } from '../slice';

export interface Codex {
  /** Marks per content id, in `CODEX_MARKS` order, without repeats. */
  readonly entries: CodexDiscoveries;
}

const marksSchema = z
  .array(z.enum(CODEX_MARKS as [CodexMark, ...CodexMark[]]))
  .min(1, 'needs at least one mark')
  .refine((marks) => marks.every((m, i) => i === 0 || CODEX_MARKS.indexOf(marks[i - 1] as CodexMark) < CODEX_MARKS.indexOf(m)), {
    message: 'marks must be in order (seen, killed, used) without repeats',
  });

/** Discoveries keyed by content id: what the tracker hands over and what the slice keeps. */
export const discoveriesSchema = z.record(z.string().regex(/^[a-z][a-z0-9_]*\.[a-z0-9_.]+$/, 'must be a content id'), marksSchema);

const codexSchema = z.object({ entries: discoveriesSchema });

export const codexSlice = defineSlice<Codex>({
  version: 1,
  schema: codexSchema,
  init: () => ({ entries: {} }),
  onRunResult: (codex, result) => {
    const found = result.extras[CODEX_TRACKER.id];
    if (found === undefined) return codex;
    const parsed = discoveriesSchema.safeParse(found);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new RangeError(`Malformed RunResult: extras.${CODEX_TRACKER.id}: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`.trim());
    }
    const entries = mergeDiscoveries(codex.entries, parsed.data);
    return entries === codex.entries ? codex : { entries };
  },
});
