/**
 * Starter items found in dungeon loot and worn by base class kits (`src/content/items.ts`).
 * Registration order is preserved so loot tables and generic appearance maps remain stable.
 */
import { GOLD_PER_TROPHY } from './economy';
import { defineItem } from './itemTypes';

export const ITEM_MENDING_DRAUGHT = defineItem({
  id: 'item.mending_draught',
  name: 'Mending draught',
  description: 'A stoppered vial of cloudy red tonic that knits torn flesh in moments. Bitter, and worth every drop.',
  hint: 'A stoppered red vial that smells of bitter herbs and iron.',
  tags: ['healing'],
  glyph: { ch: '!', color: '#e3706b' },
  category: 'potion',
  weight: 1,
  value: 30,
  stack: 5,
  abilityTags: ['heal'],
  bundle: { effects: [{ kind: 'heal', amount: 12 }] },
  loot: { weight: 22 },
});

export const ITEM_QUICKSTEP_TONIC = defineItem({
  id: 'item.quickstep_tonic',
  name: 'Quickstep tonic',
  description: 'A fizzing green tonic that sets the heart racing. For a while its drinker moves and acts far faster.',
  hint: 'A sharp green draught that fizzes against the cork.',
  tags: [],
  glyph: { ch: '!', color: '#8fd16a' },
  category: 'potion',
  weight: 1,
  value: 60,
  stack: 5,
  abilityTags: ['buff'],
  bundle: { effects: [{ kind: 'applyStatus', status: 'status.hasted', turns: 20 }] },
  loot: { weight: 3, minDepth: 2 },
});

export const ITEM_SCROLL_OF_RENEWAL = defineItem({
  id: 'item.scroll_of_renewal',
  name: 'Scroll of renewal',
  description: 'A strip of vellum inked with a slow, looping chant. Read aloud, it closes wounds over the next several turns.',
  hint: 'Rolled vellum inscribed with a slow, mending cadence.',
  tags: ['healing'],
  glyph: { ch: '?', color: '#d9c58a' },
  category: 'scroll',
  weight: 1,
  value: 35,
  stack: 5,
  abilityTags: ['heal'],
  bundle: { effects: [{ kind: 'applyStatus', status: 'status.regenerating', turns: 15 }] },
  loot: { weight: 6 },
});

export const ITEM_SCROLL_OF_IDENTIFY = defineItem({
  id: 'item.scroll_of_identify',
  name: 'Scroll of identify',
  description: 'Fine grey ink arranged in neat diagnostic sigils. Reading it reveals the true nature, enchantments and curses of an unidentified item (or all of them when blessed).',
  hint: 'Neat grey sigils ruled onto thin parchment for naming what is hidden.',
  tags: ['identify'],
  glyph: { ch: '?', color: '#9ec5e6' },
  category: 'scroll',
  weight: 1,
  value: 30,
  stack: 5,
  abilityTags: ['utility'],
  bundle: { effects: [{ kind: 'identify', scope: 'one' }] },
  loot: { weight: 3 },
});

export const ITEM_SCROLL_OF_UNCURSING = defineItem({
  id: 'item.scroll_of_uncursing',
  name: 'Scroll of uncursing',
  description: 'A crisp white sheet smelling faintly of salt and cedar. Reading it breaks curses binding worn gear (and carried items too when blessed).',
  hint: 'Crisp pale vellum scented with cedar and salt.',
  tags: ['uncurse'],
  glyph: { ch: '?', color: '#e8e0c5' },
  category: 'scroll',
  weight: 1,
  value: 40,
  stack: 5,
  abilityTags: ['utility'],
  bundle: { effects: [{ kind: 'uncurse', scope: 'worn' }] },
  loot: { weight: 2.5 },
});

export const ITEM_TRAIL_BISCUIT = defineItem({
  id: 'item.trail_biscuit',
  name: 'Trail biscuit',
  description: 'A hard square of oat and dried fruit, baked to last a season in a pack. A small comfort underground.',
  hint: 'Dense travel-bread wrapped in waxed cloth.',
  tags: [],
  glyph: { ch: '%', color: '#c9a36b' },
  category: 'food',
  weight: 1,
  value: 5,
  stack: 10,
  abilityTags: ['heal'],
  bundle: { effects: [{ kind: 'heal', amount: 2 }] },
  loot: { weight: 6, qty: { min: 1, max: 3 } },
});

export const ITEM_IRON_HATCHET = defineItem({
  id: 'item.iron_hatchet',
  name: 'Iron hatchet',
  description: 'A short-hafted iron axe, notched from use. Good for kindling and for anything that bites.',
  hint: 'A short, heavy-headed chopper notched along the bit.',
  tags: [],
  glyph: { ch: ')', color: '#b8c4cf' },
  category: 'weapon',
  weight: 6,
  value: 25,
  gear: { type: 'axe' },
  bundle: { modifiers: [{ stat: 'damage', op: 'add', value: 2 }] },
  loot: { weight: 1.5 },
});

export const ITEM_QUILTED_JERKIN = defineItem({
  id: 'item.quilted_jerkin',
  name: 'Quilted jerkin',
  description: 'Layers of stitched wool and linen that soften a blow. Heavy, warm, and never quite dry.',
  hint: 'Thick layers of padded linen stitched in diamonds.',
  tags: [],
  glyph: { ch: '[', color: '#9c8f7a' },
  category: 'armor',
  weight: 10,
  value: 20,
  gear: { type: 'lightArmor' },
  bundle: { modifiers: [{ stat: 'armor', op: 'add', value: 1 }] },
  loot: { weight: 1 },
});

export const ITEM_SKINNING_KNIFE = defineItem({
  id: 'item.skinning_knife',
  name: 'Skinning knife',
  description: 'A hunter’s thin, curved knife. It finds the gaps in a hide better than it bites through one.',
  hint: 'A slender, curved blade balanced for quick work.',
  tags: [],
  glyph: { ch: ')', color: '#c9d1d9' },
  category: 'weapon',
  weight: 2,
  value: 15,
  gear: { type: 'dagger' },
  bundle: {
    modifiers: [
      { stat: 'damage', op: 'add', value: 1 },
      { stat: 'accuracy', op: 'add', value: 1 },
    ],
  },
  loot: { weight: 1 },
});

export const ITEM_OAK_CUDGEL = defineItem({
  id: 'item.oak_cudgel',
  name: 'Oak cudgel',
  description: 'A knotted length of oak, heavier at one end. Crude and cheap, and better than bare fists.',
  hint: 'A knotted club of seasoned heartwood.',
  tags: [],
  glyph: { ch: ')', color: '#a07850' },
  category: 'weapon',
  weight: 5,
  value: 8,
  gear: { type: 'mace' },
  bundle: { modifiers: [{ stat: 'damage', op: 'add', value: 1 }] },
  loot: { weight: 1 },
});

export const ITEM_ASHWOOD_STAFF = defineItem({
  id: 'item.ashwood_staff',
  name: 'Ashwood staff',
  description: 'A pale, springy staff as tall as its bearer. Its reach keeps claws a step further off.',
  hint: 'A tall, pale stave shod with iron at the butt.',
  tags: [],
  glyph: { ch: ')', color: '#d8c9a3' },
  category: 'weapon',
  weight: 4,
  value: 20,
  gear: { type: 'staff' },
  bundle: {
    modifiers: [
      { stat: 'damage', op: 'add', value: 1 },
      { stat: 'evasion', op: 'add', value: 1 },
    ],
  },
  loot: { weight: 0.5 },
});

export const ITEM_ARMING_SWORD = defineItem({
  id: 'item.arming_sword',
  name: 'Arming sword',
  description: 'A plain, well-balanced blade with a cross guard, made for a soldier’s belt rather than a lord’s wall.',
  hint: 'A straight double-edged soldier’s blade with a plain iron cross-guard.',
  tags: [],
  glyph: { ch: ')', color: '#e6edf3', bold: true },
  category: 'weapon',
  weight: 5,
  value: 45,
  gear: { type: 'sword' },
  bundle: {
    modifiers: [
      { stat: 'damage', op: 'add', value: 2 },
      { stat: 'accuracy', op: 'add', value: 1 },
    ],
  },
  loot: { weight: 0.5, minDepth: 2 },
});

export const ITEM_FLANGED_MACE = defineItem({
  id: 'item.flanged_mace',
  name: 'Flanged mace',
  description: 'An iron head ringed with flanges on a short haft. Every blow lands like a falling stone, if it lands.',
  hint: 'A heavy iron head crowned with six biting flanges.',
  tags: [],
  glyph: { ch: ')', color: '#9aa7b3', bold: true },
  category: 'weapon',
  weight: 8,
  value: 50,
  gear: { type: 'mace' },
  bundle: {
    modifiers: [
      { stat: 'damage', op: 'add', value: 2 },
      { stat: 'accuracy', op: 'add', value: -1 },
    ],
  },
  loot: { weight: 0.5, minDepth: 3 },
});

export const ITEM_RIVETED_MAIL = defineItem({
  id: 'item.riveted_mail',
  name: 'Riveted mail',
  description: 'A shirt of small iron rings, each one riveted shut. It stops a cut cold but drags at every dodge.',
  hint: 'A heavy hauberk of close-linked iron rings.',
  tags: [],
  glyph: { ch: '[', color: '#b8c4cf', bold: true },
  category: 'armor',
  weight: 14,
  value: 60,
  gear: { type: 'mediumArmor' },
  bundle: {
    modifiers: [
      { stat: 'armor', op: 'add', value: 2 },
      { stat: 'evasion', op: 'add', value: -1 },
    ],
  },
  loot: { weight: 0.5, minDepth: 3 },
});

export const ITEM_ROUND_SHIELD = defineItem({
  id: 'item.round_shield',
  name: 'Round shield',
  description: 'Planks of linden under a painted hide, with an iron boss in the middle. Scarred, but sound.',
  hint: 'Hide-covered linden planks centered round a dented iron boss.',
  tags: [],
  glyph: { ch: '[', color: '#c08a52' },
  category: 'armor',
  weight: 6,
  value: 25,
  gear: { type: 'shield' },
  bundle: { modifiers: [{ stat: 'armor', op: 'add', value: 1 }] },
  loot: { weight: 0.5 },
});

export const ITEM_IRON_CAP = defineItem({
  id: 'item.iron_cap',
  name: 'Iron cap',
  description: 'A plain bowl of hammered iron with a leather lining. Dented, which means it worked.',
  hint: 'A battered skull-cap of hammered iron.',
  tags: [],
  glyph: { ch: '[', color: '#8f9ba6' },
  category: 'armor',
  weight: 3,
  value: 20,
  gear: { type: 'helm' },
  bundle: { modifiers: [{ stat: 'armor', op: 'add', value: 1 }] },
  loot: { weight: 0.5 },
});

export const ITEM_GRIP_GLOVES = defineItem({
  id: 'item.grip_gloves',
  name: 'Grip gloves',
  description: 'Close-fitting gloves of tanned hide, rough on the palm. A hilt doesn’t slip in them.',
  hint: 'Rough-palmed leather gloves made to keep a wet hilt steady.',
  tags: [],
  glyph: { ch: '[', color: '#a8865e' },
  category: 'armor',
  weight: 1,
  value: 15,
  gear: { type: 'gloves' },
  bundle: { modifiers: [{ stat: 'accuracy', op: 'add', value: 1 }] },
  loot: { weight: 0.5 },
});

export const ITEM_SOFT_BOOTS = defineItem({
  id: 'item.soft_boots',
  name: 'Soft boots',
  description: 'Supple boots with felt soles. Quiet on stone and quick on the turn.',
  hint: 'Supple calfskin boots with quiet felt soles.',
  tags: [],
  glyph: { ch: '[', color: '#7d6a55' },
  category: 'armor',
  weight: 2,
  value: 15,
  gear: { type: 'boots' },
  bundle: { modifiers: [{ stat: 'evasion', op: 'add', value: 1 }] },
  loot: { weight: 0.5 },
});

export const ITEM_COPPER_BAND = defineItem({
  id: 'item.copper_band',
  name: 'Copper band',
  description: 'A plain ring of hammered copper that leaves a green mark on the finger. Its wearer shrugs off a little more.',
  hint: 'A tarnished copper finger-ring worn smooth inside.',
  tags: [],
  glyph: { ch: '=', color: '#c87f4a' },
  category: 'jewelry',
  weight: 0,
  value: 20,
  gear: { type: 'ring' },
  bundle: { modifiers: [{ stat: 'hp', op: 'add', value: 3 }] },
  loot: { weight: 0.5 },
});

export const ITEM_GARNET_SIGNET = defineItem({
  id: 'item.garnet_signet',
  name: 'Garnet signet',
  description: 'A heavy gold signet set with a dark red stone, its crest long worn smooth. Its wearer stands firmer and hits harder.',
  hint: 'A heavy signet ring set with a wine-dark cabochon.',
  tags: [],
  glyph: { ch: '=', color: '#c2414b' },
  category: 'jewelry',
  weight: 0,
  value: 45,
  gear: { type: 'ring' },
  bundle: {
    modifiers: [
      { stat: 'hp', op: 'add', value: 3 },
      { stat: 'damage', op: 'add', value: 1 },
    ],
  },
  loot: { weight: 0.5, minDepth: 3 },
});

export const ITEM_OWL_EYE_RING = defineItem({
  id: 'item.owl_eye_ring',
  name: 'Owl-eye ring',
  description: 'A silver ring set with a round amber stone flecked like an owl’s eye. Shadows seem shallower to its wearer.',
  hint: 'A silver band holding a round, golden-flecked stone.',
  tags: [],
  glyph: { ch: '=', color: '#d9a441' },
  category: 'jewelry',
  weight: 0,
  value: 50,
  gear: { type: 'ring' },
  bundle: {
    modifiers: [
      { stat: 'sight', op: 'add', value: 1 },
      { stat: 'accuracy', op: 'add', value: 1 },
    ],
  },
  loot: { weight: 0.5, minDepth: 4 },
});

export const ITEM_KNOTWORK_PENDANT = defineItem({
  id: 'item.knotwork_pendant',
  name: 'Knotwork pendant',
  description: 'A bronze disc worked in an endless knot, hung on a leather cord. Its wearer seems always half a step aside.',
  hint: 'A braided bronze medallion on a worn leather thong.',
  tags: [],
  glyph: { ch: '"', color: '#b08d57' },
  category: 'jewelry',
  weight: 0,
  value: 30,
  gear: { type: 'amulet' },
  bundle: { modifiers: [{ stat: 'evasion', op: 'add', value: 1 }] },
  loot: { weight: 0.5, minDepth: 2 },
});

export const ITEM_HEARTHSTONE_AMULET = defineItem({
  id: 'item.hearthstone_amulet',
  name: 'Hearthstone amulet',
  description: 'A smooth grey stone, warm to the touch even underground, caged in iron wire. It steadies the heart and the mind.',
  hint: 'A river-smooth pebble caged in iron wire that never goes cold.',
  tags: [],
  glyph: { ch: '"', color: '#e08a5a', bold: true },
  category: 'jewelry',
  weight: 0,
  value: 60,
  gear: { type: 'amulet' },
  bundle: {
    modifiers: [
      { stat: 'hp', op: 'add', value: 4 },
      { stat: 'mp', op: 'add', value: 2 },
    ],
  },
  loot: { weight: 0.5, minDepth: 4 },
});

export const ITEM_GOLD = defineItem({
  id: 'item.gold',
  name: 'Gold coins',
  description: `Coins of many old mints, dropped and forgotten. They go into the party’s purse for the rest of the run; leftover gold converts to Trophies at ${GOLD_PER_TROPHY} gold = 1 Trophy on exit, and is lost on a wipe.`,
  hint: 'The dull glint of old coinage scattered on the flags.',
  tags: [],
  glyph: { ch: '$', color: '#f2c14e', bold: true },
  category: 'gold',
  weight: 0,
  value: 1,
  stack: 100_000,
  loot: { weight: 8, qty: { min: 3, max: 12 } },
});

export const ITEM_BENT_NAIL = defineItem({
  id: 'item.bent_nail',
  name: 'Bent nail',
  description: 'A rusty nail, bent double. Worthless, and nobody sensible carries it.',
  hint: 'A twisted scrap of rusted iron left behind by old timbering.',
  tags: ['junk'],
  glyph: { ch: ',', color: '#8a8f96' },
  category: 'junk',
  weight: 1,
  value: 0,
  loot: { weight: 4 },
});
