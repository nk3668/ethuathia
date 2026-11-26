/**
 * The ability-tag resolver (ETH-192, CLAUDE.md §5.2): "the best `heal` this adventurer can use on
 * this target right now". Tactics and rule actions ask for a tag, never for a class, a spell or an
 * item, so a new class only has to tag its abilities to work with every option.
 *
 * Sources today are the usable items in the actor's pack. Class abilities and wands join them
 * (ETH-037, ETH-195) by adding another source kind to `TaggedSource` and another branch in
 * `candidates`; callers don't change.
 *
 * Secrecy (docs/ARCHITECTURE.md §11.6): an item whose type is still unidentified is never a
 * source, because its tags would give away what it is. The resolver reads only what the party
 * knows, so it answers the same whatever an unidentified item really is.
 */
import { abilityTagsText, healAmount } from '../../content';
import type { AbilityTag, ItemDef } from '../../content';
import { isInstanceTypeKnown } from '../items/identify';
import { itemDef } from '../items/instance';
import type { ItemInstance } from '../items/instance';
import { inventoryOf } from '../items/inventory';
import { itemName } from '../items/name';
import type { Entity } from '../state';
import { statValue } from '../stats/getStat';
import type { AiCtx } from './types';

/** One usable source of a tag: today, a pack item the actor can use. */
export interface TaggedSource {
  kind: 'item';
  /** Index into the actor's pack, as the `use` action takes it. */
  index: number;
  item: ItemInstance;
  def: ItemDef;
  /**
   * How strong the source is for the tag. For `heal`, the HP it restores at once (0 for healing
   * over time, so 0 means "over time" for `heal`); 0 for tags with no measure yet.
   */
  power: number;
  /** Why this one: readable, for the AI trace. Uses the name the actor knows the item by. */
  reason: string;
}

/** Optional narrowing of the pack to look at (a rule action that only quaffs, say). */
export type SourceFilter = (item: ItemInstance, def: ItemDef) => boolean;

/** The sources of `tag` the actor can use on `target` right now, in pack order. */
export function sourcesByTag(ctx: AiCtx, tag: AbilityTag, target?: Entity, filter?: SourceFilter): TaggedSource[] {
  const { state, actor } = ctx;
  // Items act on their user only: nothing reaches another target until a ranged source exists.
  // TODO(ETH-193, ETH-195): sources that reach allies or enemies must be returned here.
  if (target !== undefined && target.id !== actor.id) return [];
  const found: TaggedSource[] = [];
  for (const [index, item] of inventoryOf(actor).entries()) {
    if (!isInstanceTypeKnown(state, item)) continue;
    const def = itemDef(item);
    if (!(def.abilityTags ?? []).includes(tag)) continue;
    if (filter !== undefined && !filter(item, def)) continue;
    const power = tag === 'heal' ? healAmount(def) : 0;
    found.push({ kind: 'item', index, item, def, power, reason: `${itemName(state, item, actor)} (${abilityTagsText(def.abilityTags).toLowerCase()})` });
  }
  return found;
}

/**
 * The best usable source of `tag` for `target` (default: the actor itself), or `null` if there is
 * none. For `heal`: the weakest source that still covers the missing HP, else the strongest;
 * sources that only heal over time rank after any that heal at once. For other tags: the first
 * in the pack. Changes nothing.
 */
export function bestByTag(ctx: AiCtx, tag: AbilityTag, target?: Entity, filter?: SourceFilter): TaggedSource | null {
  const sources = sourcesByTag(ctx, tag, target, filter);
  if (sources.length === 0) return null;
  if (tag !== 'heal') return sources[0] ?? null;
  const subject = target ?? ctx.actor;
  const missing = subject.actor === undefined ? 0 : statValue(ctx.state, subject, 'hp') - subject.actor.hp;
  let cover: TaggedSource | null = null;
  let strongest: TaggedSource | null = null;
  let over: TaggedSource | null = null;
  for (const s of sources) {
    if (s.power <= 0) {
      over ??= s;
      continue;
    }
    if (s.power >= missing && (cover === null || s.power < cover.power)) cover = s;
    if (strongest === null || s.power > strongest.power) strongest = s;
  }
  const best = cover ?? strongest ?? over;
  if (best === null) return null;
  const how =
    best.power <= 0 ? 'heals over time' : cover !== null ? `heals ${best.power}, enough for the ${missing} missing` : `heals ${best.power}, the most it has`;
  return { ...best, reason: `${best.reason}: ${how}` };
}
