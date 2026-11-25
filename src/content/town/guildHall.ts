/**
 * The Guild Hall (CLAUDE.md §4), Tiers I and II of the approved town-tree page (ETH-132): party
 * size, contract slots and pay, recruit toughness, the recruit unlocks of ETH-036, in-run XP and
 * a starting mending draught, paid in Renown. The roster is a flat 50 adventurers, so there are
 * no roster upgrades. ETH-187 added the nodes that needed new mechanics: Field Rations (a ranked
 * capacity that issues rations), Extraction Drills and Waymark Lanterns (gated run bundles, each
 * the pick-one partner of an older node) and the opt-in Mystery Crate. ETH-186 adds the Omen unlocks.
 *
 * Rows 1 to 3 are Tier I and open from the start. Rows 4 to 6 are Tier II and stay locked until
 * *The Long Muster* (`buildingQuests.ts`) is done: reach floor 6 and walk out.
 *
 * Layout: columns are the node graph's lanes. Costs are a starting shape for ETH-161.
 */
import { CONTRACT_LONG_MUSTER } from '../buildingQuests';
import { ITEM_MENDING_DRAUGHT } from '../items';
import { defineBuilding, defineUpgrade } from '../upgrades';

/** The first row of Tier II: the row the Long Muster opens. */
export const GUILD_HALL_TIER_TWO_ROW = 4;

export const BUILDING_GUILD_HALL = defineBuilding({
  id: 'building.guild_hall',
  name: 'Guild Hall',
  description:
    'Where adventurers sign their names and take their contracts. Its upgrades let more of them ' +
    'descend together, pay them better and send them down tougher.',
  tags: ['town'],
  kind: 'foundations',
  tierGates: [
    {
      fromTier: GUILD_HALL_TIER_TWO_ROW,
      name: 'Guild Hall Tier II',
      unlock: { kind: 'objectiveDone', owner: { kind: 'contract', id: CONTRACT_LONG_MUSTER.id }, exited: true },
    },
  ],
});

const building = BUILDING_GUILD_HALL.id;

// --- Tier I ----------------------------------------------------------------------------------

export const UPGRADE_SECOND_BERTH = defineUpgrade({
  id: 'upgrade.second_berth',
  name: 'Second Berth',
  description: 'A second bunk in the expedition wagon. Two adventurers can descend together.',
  tags: ['party'],
  building,
  tier: 1,
  column: 0,
  cost: { renown: 60 },
  requires: [],
  grants: [{ kind: 'capacity', key: 'partySize', amount: 1 }],
});

export const UPGRADE_HARDY_RECRUITS = defineUpgrade({
  id: 'upgrade.hardy_recruits',
  name: 'Hardy Recruits',
  description:
    'The guild turns away anyone who winces at a cold night. Every adventurer starts with 3 more max HP per rank, up to 5 ranks. ' +
    'Each rank costs more than the one before.',
  tags: ['party', 'numeric'],
  building,
  tier: 1,
  column: 1,
  cost: { renown: 40 },
  requires: [],
  ranks: { max: 5, costGrowth: 1.5 },
  grants: [{ kind: 'bundle', scope: 'party', bundle: { modifiers: [{ stat: 'hp', op: 'add', value: 3 }] } }],
});

export const UPGRADE_CONTRACT_BOUNTY = defineUpgrade({
  id: 'upgrade.contract_bounty',
  name: 'Contract Bounty',
  description:
    'The hall sweetens its writs. Every contract you complete pays 10% more per rank, up to 3 ranks, before any Omen multiplier. ' +
    'It adds to the base pay, so a run with several contracts gains the most.',
  tags: ['contracts', 'numeric'],
  building,
  tier: 2,
  column: 0,
  cost: { renown: 80 },
  requires: [],
  ranks: { max: 3, costGrowth: 1.5 },
  grants: [{ kind: 'capacity', key: 'contractRewardBonus', amount: 10 }],
});

export const UPGRADE_OUTRIDER_TRAINING = defineUpgrade({
  id: 'upgrade.outrider_training',
  name: "Scout's Charter",
  description:
    'A charter for the wild-path riders takes a post at the hall. Outriders can be recruited, and a random recruit may be one.',
  tags: ['roster', 'class'],
  building,
  tier: 2,
  column: 1,
  cost: { renown: 150 },
  requires: [],
  reveal: { kind: 'reachDepth', depth: 4 },
  grants: [{ kind: 'unlock', id: 'class.outrider' }],
});

export const UPGRADE_FIELD_RATIONS = defineUpgrade({
  id: 'upgrade.field_rations',
  name: 'Field Rations',
  description:
    'The hall cooks pack every adventurer a parcel for the trip down. Each starts the run with 1 more field ration per rank, up to 3 ranks. ' +
    'Eating one starts Regenerating (1 HP a turn for 10 turns); another eaten meanwhile renews it. Adventurers eat one when hurt ' +
    'with nothing in sight. Rations are starting kit: never sold on the way out. Each rank costs more than the one before.',
  tags: ['party', 'numeric', 'healing'],
  building,
  tier: 2,
  column: 2,
  cost: { renown: 60 },
  requires: [],
  ranks: { max: 3, costGrowth: 1.6 },
  // A ranked node can't carry a `start` perk, so the capacity counts the rations and `upgradeStartConfig` issues them.
  grants: [{ kind: 'capacity', key: 'fieldRations', amount: 1 }],
});

export const UPGRADE_CONTRACT_BOARD = defineUpgrade({
  id: 'upgrade.contract_board',
  name: 'Contract Board',
  description:
    'A second pinboard by the door. A run can take on one more contract at once. Pick this or Extraction Drills; respec to change.',
  tags: ['contracts', 'capability'],
  building,
  tier: 3,
  column: 0,
  cost: { renown: 250 },
  requires: [UPGRADE_SECOND_BERTH.id],
  exclusiveGroup: 'guild_hall.row3',
  grants: [{ kind: 'capacity', key: 'contractSlots', amount: 1 }],
});

export const UPGRADE_EXTRACTION_DRILLS = defineUpgrade({
  id: 'upgrade.extraction_drills',
  name: 'Extraction Drills',
  description:
    'The hall drills its recruits in running away well. Every adventurer moves 10% faster per rank, up to 3 ranks, only while ' +
    'fleeing from a threat; the bonus ends when the flight does. Each rank costs more than the one before. ' +
    'Pick this or the Contract Board; respec to change.',
  tags: ['party', 'numeric', 'flee'],
  building,
  tier: 3,
  column: 1,
  cost: { renown: 220 },
  requires: [],
  ranks: { max: 3, costGrowth: 1.5 },
  exclusiveGroup: 'guild_hall.row3',
  // Speed is energy gained a turn with a base of 100, so +10 is +10% and ranks add up rather than compound.
  grants: [{ kind: 'bundle', scope: 'run', when: 'fleeing', bundle: { modifiers: [{ stat: 'speed', op: 'add', value: 10 }] } }],
});

export const UPGRADE_FENLING_RECRUITMENT = defineUpgrade({
  id: 'upgrade.fenling_recruitment',
  name: 'Marsh Envoy',
  description:
    'An envoy carries word to the marsh villages that the hall pays well. Fenlings can be recruited, and a random recruit may be one.',
  tags: ['roster', 'race'],
  building,
  tier: 3,
  column: 2,
  cost: { renown: 200 },
  requires: [],
  reveal: { kind: 'finishRuns', count: 8 },
  grants: [{ kind: 'unlock', id: 'race.fenling' }],
});

// --- Tier II (opens with The Long Muster) ----------------------------------------------------

export const UPGRADE_LOREKEEPER_TRAINING = defineUpgrade({
  id: 'upgrade.lorekeeper_training',
  name: 'Library Ties',
  description:
    'A reading room opens off the hall, with a standing agreement with the scholars. Lorekeepers can be recruited, and a random recruit may be one.',
  tags: ['roster', 'class'],
  building,
  tier: GUILD_HALL_TIER_TWO_ROW,
  column: 0,
  cost: { renown: 250 },
  requires: [],
  reveal: { kind: 'metInRun', requirement: { cond: 'cond.run_identified', params: { min: 5 } } },
  grants: [{ kind: 'unlock', id: 'class.lorekeeper' }],
});

export const UPGRADE_MEDICS_SATCHEL = defineUpgrade({
  id: 'upgrade.medics_satchel',
  name: "Medic's Satchel",
  description:
    'A field medic packs every adventurer a vial before they go down. Each starts the run with one mending draught. ' +
    'It is starting kit: never sold on the way out, even if it is not drunk.',
  tags: ['party', 'capability'],
  building,
  tier: GUILD_HALL_TIER_TWO_ROW,
  column: 1,
  cost: { renown: 450 },
  requires: [],
  grants: [{ kind: 'start', start: { perk: 'stock', item: ITEM_MENDING_DRAUGHT.id, qty: 1, each: true } }],
});

export const UPGRADE_GUILD_CHRONICLES = defineUpgrade({
  id: 'upgrade.guild_chronicles',
  name: 'Guild Chronicles',
  description:
    'The guild records its deeds and studies them. Every adventurer earns 10% more XP per rank during a run, up to 3 ranks. ' +
    'It changes in-run XP only (kills and depth), not the Mastery bonus at the end of a run; class Mastery still rises, ' +
    'because Mastery counts the XP each adventurer earned. Pick this or Waymark Lanterns; respec to change.',
  tags: ['party', 'numeric'],
  building,
  tier: 5,
  column: 0,
  cost: { renown: 250 },
  requires: [],
  ranks: { max: 3, costGrowth: 1.6 },
  exclusiveGroup: 'guild_hall.row5',
  grants: [{ kind: 'capacity', key: 'xpBonus', amount: 10 }],
});

export const UPGRADE_WAYMARK_LANTERNS = defineUpgrade({
  id: 'upgrade.waymark_lanterns',
  name: 'Waymark Lanterns',
  description:
    'Lanterns the guild hangs along the way down, lit for the walk back. Once the party has turned back for the surface, ' +
    '(a retreat or a victory) every adventurer sees 2 tiles further and moves 10% faster. ' +
    'Pick this or Guild Chronicles; respec to change.',
  tags: ['party', 'capability', 'return'],
  building,
  tier: 5,
  column: 1,
  cost: { renown: 700 },
  requires: [],
  exclusiveGroup: 'guild_hall.row5',
  grants: [
    {
      kind: 'bundle',
      scope: 'run',
      when: 'returning',
      bundle: {
        modifiers: [
          { stat: 'sight', op: 'add', value: 2 },
          { stat: 'speed', op: 'add', value: 10 },
        ],
      },
    },
  ],
});

export const UPGRADE_SEASONED_CONSTITUTION = defineUpgrade({
  id: 'upgrade.seasoned_constitution',
  name: 'Seasoned Constitution',
  description:
    'Old hands of the hall teach the young to shrug off poison and fear. Every adventurer gains 8 status resistance per rank, ' +
    'up to 3 ranks. It shortens harmful statuses, up to a cap of 75%.',
  tags: ['party', 'numeric'],
  building,
  tier: 5,
  column: 2,
  cost: { renown: 200 },
  requires: [],
  ranks: { max: 3, costGrowth: 1.5 },
  grants: [{ kind: 'bundle', scope: 'party', bundle: { modifiers: [{ stat: 'statusResist', op: 'add', value: 8 }] } }],
});

export const UPGRADE_SECOND_CONTRACT_BOARD = defineUpgrade({
  id: 'upgrade.second_contract_board',
  name: 'Second Contract Board',
  description:
    'A whole wall of writs and a clerk to sort them. A run can take on one more contract at once. Pick this or the Rule Clerk; respec to change.',
  tags: ['contracts', 'capability'],
  building,
  tier: 6,
  column: 0,
  cost: { renown: 1200 },
  requires: [],
  exclusiveGroup: 'guild_hall.row6',
  grants: [{ kind: 'capacity', key: 'contractSlots', amount: 1 }],
});

export const UPGRADE_RULE_CLERK = defineUpgrade({
  id: 'upgrade.rule_clerk',
  name: 'Rule Clerk',
  description:
    'A clerk who writes down how each adventurer likes to fight. It adds a rule slot per adventurer, but behavior rules arrive in a ' +
    'later update: this does nothing until then. Pick this or the Second Contract Board; respec to change.',
  tags: ['rules', 'capability'],
  building,
  tier: 6,
  column: 1,
  cost: { renown: 1200 },
  requires: [],
  exclusiveGroup: 'guild_hall.row6',
  grants: [{ kind: 'capacity', key: 'ruleSlots', amount: 1 }],
});

export const UPGRADE_MYSTERY_CRATE = defineUpgrade({
  id: 'upgrade.mystery_crate',
  name: "Quartermaster's Mystery Crate",
  description:
    'The quartermaster presses a sealed crate on the first adventurer to go down. Switch it on for a run on the Prepare screen ' +
    '(it is off until you do): the first adventurer carries one unidentified item. It might be a blessed potion, a rare scroll or a ring, ' +
    'or a cursed dud. Which, you will not know until it is identified. It is starting kit: never sold on the way out.',
  tags: ['party', 'capability', 'risky'],
  building,
  tier: 6,
  column: 2,
  cost: { renown: 900 },
  requires: [],
  optIn: true,
  grants: [{ kind: 'start', start: { perk: 'crate' } }],
});
