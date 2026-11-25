/** Log wording for the items domain's events (`src/sim/items/`). One entry per event type. */
import { EQUIP_SLOT_INFO, ITEM_CATEGORY_INFO, ITEMS } from '../../../content';
import { NOTABLE_ITEM_VALUE } from '../../../sim';
import type { ItemsEvent } from '../../../sim';
import { defineHighlight, mention } from './types';
import { onFloor } from './types';
import type { LogPart, LogTextRecord, MomentTextRecord } from './types';

/** A party member picked up something valuable. */
export const HIGHLIGHT_VALUABLE_FIND = defineHighlight({
  id: 'valuableFind',
  label: 'A valuable find',
  description: `An adventurer picks up an item worth ${NOTABLE_ITEM_VALUE} or more.`,
});

/**
 * The item as a mention (or plain text if `identified === false`, so hovering doesn't spoil an
 * unidentified potion/scroll/jewelry, ETH-044), with ` ×3` after it for more than one.
 */
function itemParts(item: string, qty: number, name?: string, identified?: false): LogPart[] {
  const head: LogPart = identified === false ? (name ?? 'an unidentified item') : mention(item, name);
  return qty === 1 ? [head] : [head, ` ×${qty}`];
}

function verb(item: string): string {
  return ITEMS.has(item) ? ITEM_CATEGORY_INFO[ITEMS.get(item).category].verb : 'uses';
}

export const ITEMS_LOG_TEXT: LogTextRecord<ItemsEvent> = {
  itemSighted: {
    category: 'discovery',
    text: (e, nameOf) => [`${nameOf(e.actor)} spots `, ...itemParts(e.item, e.qty, e.name, e.identified), '.'],
  },
  pickedUp: {
    category: 'loot',
    highlight: HIGHLIGHT_VALUABLE_FIND,
    highlightWhen: (e) => e.identified !== false && e.value >= NOTABLE_ITEM_VALUE,
    text: (e, nameOf) => [`${nameOf(e.actor)} picks up `, ...itemParts(e.item, e.qty, e.name, e.identified), '.'],
  },
  goldPickedUp: {
    category: 'loot',
    text: (e, nameOf) => [`${nameOf(e.actor)} picks up ${e.amount} `, mention(e.item, 'gold'), '.'],
  },
  dropped: {
    category: 'loot',
    text: (e, nameOf) => [`${nameOf(e.actor)} drops `, ...itemParts(e.item, e.qty, e.name, e.identified), '.'],
  },
  // "Mira breaks the iron cap down into scrap." (ETH-188)
  itemSalvaged: {
    category: 'loot',
    text: (e, nameOf) => [`${nameOf(e.actor)} breaks `, ...itemParts(e.item, e.qty, e.name), ` down into scrap (worth ${e.value}).`],
  },
  used: {
    category: 'loot',
    text: (e, nameOf) => [`${nameOf(e.actor)} ${verb(e.item)} `, mention(e.item, e.name), '.'],
  },
  equipped: {
    category: 'loot',
    text: (e, nameOf) => [
      `${nameOf(e.actor)} ${e.slot === 'mainHand' ? 'wields' : 'puts on'} `,
      mention(e.item, e.name),
      ...(e.replaced === null ? ['.'] : [', packing away ', mention(e.replaced, e.replacedName), '.']),
    ],
  },
  unequipped: {
    category: 'loot',
    text: (e, nameOf) => [`${nameOf(e.actor)} takes off `, mention(e.item, e.name), ` (${EQUIP_SLOT_INFO[e.slot].label.toLowerCase()}).`],
  },
  itemIdentified: {
    category: 'discovery',
    text: (e, nameOf) => [
      `${nameOf(e.actor)} identifies ${e.was} as `,
      mention(e.item, e.name),
      e.cursed === true ? ' — it is cursed!' : e.plain === true ? (ITEMS.has(e.item) && ITEMS.get(e.item).gear === undefined ? ': no blessing or curse.' : ': no enchantment or curse.') : '.',
    ],
  },
  gearHeld: {
    category: 'ai',
    text: (e, nameOf) => `${nameOf(e.actor)} holds back: ${e.note}.`,
  },
  itemUncursed: {
    category: 'loot',
    text: (e, nameOf) => [
      `The curse lifts from ${nameOf(e.actor)}’s `,
      mention(e.item, e.name),
      e.slot === null ? '.' : ` (${EQUIP_SLOT_INFO[e.slot].label.toLowerCase()}).`,
    ],
  },
};

/** How the items domain's chronicle moments read (ETH-120). */
export const ITEMS_MOMENT_TEXT: MomentTextRecord = {
  valuableFind: {
    kind: HIGHLIGHT_VALUABLE_FIND,
    category: 'loot',
    text: (m, nameOf) => [
      `${nameOf(m.actors[0] ?? 0)} found `,
      mention(m.ids[0] ?? ''),
      `${m.amount === undefined ? '' : ` (worth ${m.amount})`}${onFloor(m.depth)}.`,
    ],
  },
};
