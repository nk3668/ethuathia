/**
 * Omens in a run (ETH-185): the config's `omens` (an id and a rank each) become run modifiers
 * (ETH-115), one per Omen, credited "Gloom (Omen, rank 2)". Everything an Omen does goes through
 * that one path: its rank's bundle and flags, and its reward bonus, which the one reward
 * multiplier sums (`rewardMultiplier`). The config keeps the plain `{ id, rank }` list, so a seed
 * replays identically and the run history can say which Omens were on.
 */
import { OMENS, omenRank, rankNumeral } from '../../content';
import type { OmenDef, OmenSelection } from '../../content';
import type { RunModifierConfig } from './runModifiers';

/** The id `runBundleOf` resolves to a rank's bundle: `omen.gloom#2`. */
export function omenBundleId(id: string, rank: number): string {
  return `${id}#${rank}`;
}

/** "Gloom (Omen, rank 2)": how a stat tooltip and the log name an Omen at a rank. */
export function omenLabel(def: OmenDef, rank: number): string {
  return `${def.name} (Omen, rank ${rank})`;
}

/** "Gloom II": the short form for lists. */
export function omenShortLabel(def: OmenDef, rank: number): string {
  return `${def.name} ${rankNumeral(rank)}`;
}

/** The run modifiers for these Omens, in order. Ids or ranks that don't exist are skipped (`omenProblems` reports them). */
export function omenModifiers(omens: readonly OmenSelection[] | undefined): RunModifierConfig[] {
  const out: RunModifierConfig[] = [];
  for (const { id, rank } of omens ?? []) {
    if (!OMENS.has(id)) continue;
    const def = OMENS.get(id);
    const r = omenRank(def, rank);
    if (r === undefined) continue;
    out.push({
      key: id,
      source: { id, label: omenLabel(def, rank) },
      scope: r.scope ?? 'monsters',
      ...(r.bundle === undefined ? {} : { bundle: omenBundleId(id, rank) }),
      ...(r.flags === undefined ? {} : { flags: [...r.flags] }),
      rewardBonus: r.reward,
    });
  }
  return out;
}

/** Problems with a config's Omens, one phrase each: an unknown id, a rank out of range, an Omen taken twice. */
export function omenProblems(omens: readonly OmenSelection[] | undefined): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  (omens ?? []).forEach((o, i) => {
    if (!OMENS.has(o.id)) problems.push(`omens[${i}] has unknown Omen "${o.id}"`);
    else if (omenRank(OMENS.get(o.id), o.rank) === undefined) problems.push(`omens[${i}] ("${o.id}") has rank ${String(o.rank)}, which it does not have`);
    if (seen.has(o.id)) problems.push(`Omen "${o.id}" is taken twice`);
    seen.add(o.id);
  });
  return problems;
}
