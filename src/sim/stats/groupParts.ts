/**
 * Groups a stat's parts by source for tooltips (ETH-180): a ranked upgrade (ETH-172) attaches
 * its bundle once per rank, so its parts arrive once per rank; a tooltip names it once with its
 * rank count instead. Pure and presentation-only: `getStat`'s parts and values are unchanged.
 */
import type { StatSource } from './types';

/** One source's parts of one op, summed. */
export interface StatPartGroup {
  op: 'add' | 'mul';
  /** `add`: the sum of the parts' values. `mul`: their product. */
  value: number;
  /** How many identical parts it was (the rank count), 1 for a source that appears once. */
  count: number;
  /** The first part's source. */
  source: StatSource;
}

/** The source id without a run modifier's rank suffix: `upgrade.x#3` is `upgrade.x`. */
export function baseSourceId(id: string): string {
  return id.replace(/#\d+$/, '');
}

/**
 * The parts with identical sources (same base id, label and op) folded into one group each, in
 * first-appearance order. Sources that appear once come out unchanged with `count` 1.
 */
export function groupStatParts(parts: readonly { op?: 'add' | 'mul'; value: number; source: StatSource }[]): StatPartGroup[] {
  const groups: StatPartGroup[] = [];
  const index = new Map<string, StatPartGroup>();
  for (const part of parts) {
    const op = part.op ?? 'add';
    const key = `${op}|${baseSourceId(part.source.id)}|${part.source.label}`;
    const found = index.get(key);
    if (found === undefined) {
      const group: StatPartGroup = { op, value: part.value, count: 1, source: part.source };
      index.set(key, group);
      groups.push(group);
    } else {
      found.value = op === 'add' ? found.value + part.value : found.value * part.value;
      found.count += 1;
    }
  }
  return groups;
}

/** A group's label with its rank count: "Hardy Recruits ×3", or just the label for one. */
export function groupLabel(group: StatPartGroup): string {
  return group.count > 1 ? `${group.source.label} ×${group.count}` : group.source.label;
}
