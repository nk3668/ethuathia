/**
 * Items a run issues at its start (ETH-187): the one shared notion of "issued by a class kit or
 * an upgrade" that the content reachability check (`tools/content-reachability.ts`) reads, so an
 * item that is never found as loot but is handed out on the way in still counts as reachable.
 *
 * Sources, all read from content so a new one needs no edit here:
 * - a class's starting `kit` (`ClassDef.kit`);
 * - an upgrade's `start` stock perk (the Medic's Satchel);
 * - a capacity that issues an item (`CAPACITY_INFO[key].issues`, e.g. Field Rations);
 * - any other table a start perk draws from, registered with `registerIssuedItems`
 *   (the Mystery Crate's table, and later the Smithy's salvage kit).
 */
import { CLASSES } from './classes';
import { ITEMS } from './items';
import { CAPACITY_INFO, UPGRADES } from './upgrades';

const EXTRA_SOURCES: { readonly source: string; readonly ids: () => readonly string[] }[] = [];

/**
 * Names another source of issued items (`source` says who issues them, for messages). `ids` is
 * called when the set is read, so it may refer to defs registered later.
 */
export function registerIssuedItems(source: string, ids: () => readonly string[]): void {
  if (EXTRA_SOURCES.some((s) => s.source === source)) throw new Error(`Issued-item source "${source}" is registered twice`);
  EXTRA_SOURCES.push({ source, ids });
}

/** Every item id that some class kit, upgrade or registered table issues at the start of a run. */
export function issuedItemIds(): Set<string> {
  const out = new Set<string>();
  for (const c of CLASSES.all()) for (const id of c.kit ?? []) out.add(id);
  for (const node of UPGRADES.all()) {
    for (const g of node.grants) {
      if (g.kind === 'start' && g.start.perk === 'stock') out.add(g.start.item);
      if (g.kind === 'capacity') {
        const issues = (CAPACITY_INFO[g.key] as { issues?: string }).issues;
        if (issues !== undefined) out.add(issues);
      }
    }
  }
  for (const s of EXTRA_SOURCES) for (const id of s.ids()) out.add(id);
  return new Set([...out].filter((id) => ITEMS.has(id)));
}
