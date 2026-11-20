/**
 * The `codex` slice: every content entry the player has discovered, and how (seen, killed,
 * used), plus lifetime kill counts per monster kind for the Codex kill tiers (ETH-091). The Codex
 * shows entries not in `entries` as unknown. Runs add to it through `CODEX_TRACKER`
 * (`RunResult.extras['track.codex']`) and `KILLS_TRACKER` (`RunResult.extras['track.kills']`).
 */
import { z } from 'zod';
import { addDiscovery, CODEX_MARKS, CODEX_TRACKER, KILLS_TRACKER, mergeDiscoveries } from '../../sim';
import type { CodexDiscoveries, CodexMark } from '../../sim';
import { defineSlice } from '../slice';

export type MonsterKills = Readonly<Record<string, number>>;

export interface Codex {
  /** Marks per content id, in `CODEX_MARKS` order, without repeats. */
  readonly entries: CodexDiscoveries;
  /** Lifetime kills per monster content id (`monster.*`), for the Codex kill-count tiers (ETH-091). */
  readonly kills: MonsterKills;
}

const marksSchema = z
  .array(z.enum(CODEX_MARKS as [CodexMark, ...CodexMark[]]))
  .min(1, 'needs at least one mark')
  .refine((marks) => marks.every((m, i) => i === 0 || CODEX_MARKS.indexOf(marks[i - 1] as CodexMark) < CODEX_MARKS.indexOf(m)), {
    message: 'marks must be in order (seen, killed, used) without repeats',
  });

/** Discoveries keyed by content id: what the tracker hands over and what the slice keeps. */
export const discoveriesSchema = z.record(z.string().regex(/^[a-z][a-z0-9_]*\.[a-z0-9_.]+$/, 'must be a content id'), marksSchema);

/** Lifetime kill counts keyed by monster content id (`monster.*`). */
export const monsterKillsSchema = z.record(
  z.string().regex(/^monster\.[a-z][a-z0-9_]*$/, 'must be a monster content id'),
  z.number().int('must be a whole number').positive('must be at least 1'),
);

const codexSchema = z.object({
  entries: discoveriesSchema,
  kills: monsterKillsSchema,
});

const runKillsExtrasSchema = z.object({
  byMonster: z.record(z.string(), z.number().int().nonnegative()).optional(),
});

/** Sums `added` monster kills into `base`, returning `base` unchanged when nothing positive is added. */
export function mergeMonsterKills(base: MonsterKills, added: Readonly<Record<string, number>>): MonsterKills {
  let out = base;
  for (const [id, count] of Object.entries(added)) {
    if (!/^monster\.[a-z][a-z0-9_]*$/.test(id) || !Number.isInteger(count) || count <= 0) continue;
    out = { ...out, [id]: (out[id] ?? 0) + count };
  }
  return out;
}

export const codexSlice = defineSlice<Codex>({
  version: 2,
  schema: codexSchema,
  init: () => ({ entries: {}, kills: {} }),
  migrations: {
    // v2 (ETH-091): adds per-monster kill counts (`kills`).
    2: (old) => ({ ...(old as object), kills: {} }),
  },
  onRunResult: (codex, result) => {
    let entries = codex.entries;
    const found = result.extras[CODEX_TRACKER.id];
    if (found !== undefined) {
      const parsed = discoveriesSchema.safeParse(found);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new RangeError(`Malformed RunResult: extras.${CODEX_TRACKER.id}: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`.trim());
      }
      entries = mergeDiscoveries(entries, parsed.data);
    }

    let kills = codex.kills;
    const rawKills = result.extras[KILLS_TRACKER.id];
    if (rawKills !== undefined) {
      const parsedKills = runKillsExtrasSchema.safeParse(rawKills);
      if (!parsedKills.success) {
        const issue = parsedKills.error.issues[0];
        throw new RangeError(
          `Malformed RunResult: extras.${KILLS_TRACKER.id}: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`.trim(),
        );
      }
      if (parsedKills.data.byMonster !== undefined) {
        kills = mergeMonsterKills(kills, parsedKills.data.byMonster);
        for (const [id, count] of Object.entries(parsedKills.data.byMonster)) {
          if (count > 0 && /^monster\.[a-z][a-z0-9_]*$/.test(id)) {
            entries = addDiscovery(entries, { id, mark: 'killed' });
          }
        }
      }
    }

    return entries === codex.entries && kills === codex.kills ? codex : { entries, kills };
  },
});
