/** Log wording for the items domain's events (`src/sim/items/`). One entry per event type. */
import { EQUIP_SLOT_INFO, ITEM_CATEGORY_INFO, ITEMS } from '../../../content';
import { NOTABLE_ITEM_VALUE } from '../../../sim';
import type { ItemsEvent } from '../../../sim';
import { defineHighlight, mention } from './types';
import type { LogPart, LogTextRecord } from './types';

/** A party member picked up something valuable. */
export const HIGHLIGHT_VALUABLE_FIND = defineHighlight({
  id: 'valuableFind',
  label: 'A valuable find',
  description: `An adventurer picks up an item worth ${NOTABLE_ITEM_VALUE} or more.`,
});

/** The item as a mention, with ` ×3` after it for more than one. */
function itemParts(item: string, qty: number): LogPart[] {
  return qty === 1 ? [mention(item)] : [mention(item), ` ×${qty}`];
}

function verb(item: string): string {
  return ITEMS.has(item) ? ITEM_CATEGORY_INFO[ITEMS.get(item).category].verb : 'uses';
}

export const ITEMS_LOG_TEXT: LogTextRecord<ItemsEvent> = {
  itemSighted: {
    category: 'discovery',
    text: (e, nameOf) => [`${nameOf(e.actor)} spots `, ...itemParts(e.item, e.qty), '.'],
  },
  pickedUp: {
    category: 'loot',
    highlight: HIGHLIGHT_VALUABLE_FIND,
    highlightWhen: (e) => e.value >= NOTABLE_ITEM_VALUE,
    text: (e, nameOf) => [`${nameOf(e.actor)} picks up `, ...itemParts(e.item, e.qty), '.'],
  },
  goldPickedUp: {
    category: 'loot',
    text: (e, nameOf) => [`${nameOf(e.actor)} picks up ${e.amount} `, mention(e.item, 'gold'), '.'],
  },
  dropped: {
    category: 'loot',
    text: (e, nameOf) => [`${nameOf(e.actor)} drops `, ...itemParts(e.item, e.qty), '.'],
  },
  used: {
    category: 'loot',
    text: (e, nameOf) => [`${nameOf(e.actor)} ${verb(e.item)} `, mention(e.item), '.'],
  },
  equipped: {
    category: 'loot',
    text: (e, nameOf) => [
      `${nameOf(e.actor)} ${e.slot === 'mainHand' ? 'wields' : 'puts on'} `,
      mention(e.item),
      ...(e.replaced === null ? ['.'] : [', packing away ', mention(e.replaced), '.']),
    ],
  },
  unequipped: {
    category: 'loot',
    text: (e, nameOf) => [`${nameOf(e.actor)} takes off `, mention(e.item), ` (${EQUIP_SLOT_INFO[e.slot].label.toLowerCase()}).`],
  },
};
