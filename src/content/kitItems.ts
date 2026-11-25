/**
 * Town-issued starting supplies and Tier-1 class kit pieces (ETH-187, ETH-188). None of these
 * carry a `loot` entry: they enter runs solely through Guild Hall or Smithy upgrades (`src/content/items.ts`).
 */
import { defineItem } from './itemTypes';

export { ITEM_FLANGED_MACE } from './starterItems';

/** Issued only by the Guild Hall's Field Rations (ETH-187): never found as loot. */
export const ITEM_FIELD_RATION = defineItem({
  id: 'item.field_ration',
  name: 'Field ration',
  description:
    'Salted meat and a heel of hard bread, wrapped by the hall’s cooks for the trip down. Eaten, it starts Regenerating: 1 HP a turn for ' +
    '10 turns, and a second ration while it lasts only renews the time. Adventurers eat one when hurt with nothing in sight.',
  hint: 'A cloth-wrapped parcel of salted meat and bread, tied with the guild’s green cord.',
  tags: ['healing'],
  glyph: { ch: '%', color: '#b9d68a' },
  category: 'food',
  weight: 1,
  value: 25,
  stack: 10,
  bundle: { effects: [{ kind: 'applyStatus', status: 'status.regenerating', turns: 10 }] },
});

// --- Tier-1 kit pieces (ETH-188) ---------------------------------------------------------------
// Issued by a class's `kitUpgrade` (the Smithy's Artisan Implements and Tailored Attire). They have no
// loot entry: a kit upgrade is the only way to get one, so loot tables are unchanged.

export const ITEM_TRAIL_DIRK = defineItem({
  id: 'item.trail_dirk',
  name: 'Trail dirk',
  description: 'A long, narrow blade with a basket of wire over the grip, forged for riders who fight from the saddle and on foot.',
  hint: 'A slim, wire-hilted blade as long as a forearm.',
  tags: [],
  glyph: { ch: ')', color: '#d3dbe3' },
  category: 'weapon',
  weight: 3,
  value: 35,
  gear: { type: 'dagger' },
  bundle: {
    modifiers: [
      { stat: 'damage', op: 'add', value: 2 },
      { stat: 'accuracy', op: 'add', value: 1 },
    ],
  },
});

export const ITEM_IRONSHOD_STAFF = defineItem({
  id: 'item.ironshod_staff',
  name: 'Ironshod staff',
  description: 'A staff of dense heartwood, capped in iron at both ends. It carries a scholar’s weight when a blow has to land.',
  hint: 'A dark, straight stave bound in iron at both ends.',
  tags: [],
  glyph: { ch: ')', color: '#cfc3a3', bold: true },
  category: 'weapon',
  weight: 5,
  value: 40,
  gear: { type: 'staff' },
  bundle: {
    modifiers: [
      { stat: 'damage', op: 'add', value: 2 },
      { stat: 'evasion', op: 'add', value: 1 },
    ],
  },
});

export const ITEM_BEARDED_AXE = defineItem({
  id: 'item.bearded_axe',
  name: 'Bearded axe',
  description: 'A broad axe whose blade hangs low below the haft like a beard. It bites deep and drags a little coming out.',
  hint: 'A wide axe-head with a long, hooked lower edge.',
  tags: [],
  glyph: { ch: ')', color: '#c4ced8', bold: true },
  category: 'weapon',
  weight: 7,
  value: 45,
  gear: { type: 'axe' },
  bundle: { modifiers: [{ stat: 'damage', op: 'add', value: 3 }] },
});

export const ITEM_BANDED_SHIELD = defineItem({
  id: 'item.banded_shield',
  name: 'Banded shield',
  description: 'Layered planks strapped with iron hoops and a deep boss. Heavier than a plain round shield, and harder to get past.',
  hint: 'A broad, iron-hooped wooden board with a deep central boss.',
  tags: [],
  glyph: { ch: '[', color: '#b98f5c', bold: true },
  category: 'armor',
  weight: 8,
  value: 40,
  gear: { type: 'shield' },
  bundle: { modifiers: [{ stat: 'armor', op: 'add', value: 2 }] },
});

export const ITEM_RIDGE_BOOTS = defineItem({
  id: 'item.ridge_boots',
  name: 'Ridge boots',
  description: 'Boots of oiled hide with a ridged sole that grips scree and wet stone, built for people who keep moving.',
  hint: 'Tall hide boots with deep ridges cut across the soles.',
  tags: [],
  glyph: { ch: '[', color: '#8a7660' },
  category: 'armor',
  weight: 3,
  value: 30,
  gear: { type: 'boots' },
  bundle: { modifiers: [{ stat: 'evasion', op: 'add', value: 2 }] },
});

export const ITEM_SCRIBES_COAT = defineItem({
  id: 'item.scribes_coat',
  name: 'Scribe’s coat',
  description: 'A long coat of waxed canvas, lined with stiff card between the layers. It is meant to keep ink off, and does turn a blade.',
  hint: 'A long, stiff canvas coat that smells of wax and ink.',
  tags: [],
  glyph: { ch: '[', color: '#a79a82' },
  category: 'armor',
  weight: 9,
  value: 35,
  gear: { type: 'lightArmor' },
  bundle: { modifiers: [{ stat: 'armor', op: 'add', value: 2 }] },
});

export const ITEM_BROW_HELM = defineItem({
  id: 'item.brow_helm',
  name: 'Brow helm',
  description: 'A riveted iron helm with a heavy brow bar and cheek flaps. It makes its wearer look meaner and take a blow better.',
  hint: 'A riveted iron helm with a thick bar across the brow.',
  tags: [],
  glyph: { ch: '[', color: '#9ca8b3', bold: true },
  category: 'armor',
  weight: 4,
  value: 35,
  gear: { type: 'helm' },
  bundle: { modifiers: [{ stat: 'armor', op: 'add', value: 2 }] },
});
