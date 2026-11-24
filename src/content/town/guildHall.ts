/**
 * The Guild Hall (CLAUDE.md §4): party size, roster size and contract slots, paid in Renown.
 * Class and race unlocks join this tree with ETH-036.
 *
 * Layout: the berths and the roster ledger form the left column; each pick-one tier sits to
 * their right and pairs a numeric node with one that adds a capability (CLAUDE.md §4).
 */
import { defineBuilding, defineUpgrade } from '../upgrades';

export const BUILDING_GUILD_HALL = defineBuilding({
  id: 'building.guild_hall',
  name: 'Guild Hall',
  description:
    'Where adventurers sign their names and take their contracts. Its upgrades let more of them ' +
    'descend together and keep more of them on the books.',
  tags: ['town'],
  kind: 'foundations',
});

const building = BUILDING_GUILD_HALL.id;

export const UPGRADE_SECOND_BERTH = defineUpgrade({
  id: 'upgrade.second_berth',
  name: 'Second Berth',
  description: 'A second bunk in the expedition wagon. Two adventurers can descend together.',
  tags: ['party'],
  building,
  tier: 1,
  column: 0,
  cost: { renown: 50 },
  requires: [],
  grants: [{ kind: 'capacity', key: 'partySize', amount: 1 }],
});

export const UPGRADE_ROSTER_LEDGER = defineUpgrade({
  id: 'upgrade.roster_ledger',
  name: 'Roster Ledger',
  description: 'A bound book of names and deeds. The guild keeps track of more adventurers between runs.',
  tags: ['roster'],
  building,
  tier: 2,
  column: 0,
  cost: { renown: 80 },
  requires: [UPGRADE_SECOND_BERTH.id],
  grants: [{ kind: 'capacity', key: 'rosterSize', amount: 2 }],
});

export const UPGRADE_HARDY_RECRUITS = defineUpgrade({
  id: 'upgrade.hardy_recruits',
  name: 'Hardy Recruits',
  description: 'The guild turns away anyone who winces at a cold night. Every adventurer starts tougher.',
  tags: ['party', 'numeric'],
  building,
  tier: 2,
  column: 1,
  cost: { renown: 120 },
  requires: [UPGRADE_SECOND_BERTH.id],
  exclusiveGroup: 'guild_hall.tier2',
  grants: [{ kind: 'bundle', scope: 'party', bundle: { modifiers: [{ stat: 'hp', op: 'add', value: 2 }] } }],
});

export const UPGRADE_CONTRACT_BOARD = defineUpgrade({
  id: 'upgrade.contract_board',
  name: 'Contract Board',
  description: 'A second pinboard by the door. A run can take on one more contract at once.',
  tags: ['contracts', 'capability'],
  building,
  tier: 2,
  column: 2,
  cost: { renown: 120 },
  requires: [UPGRADE_SECOND_BERTH.id],
  exclusiveGroup: 'guild_hall.tier2',
  grants: [{ kind: 'capacity', key: 'contractSlots', amount: 1 }],
});

export const UPGRADE_THIRD_BERTH = defineUpgrade({
  id: 'upgrade.third_berth',
  name: 'Third Berth',
  description: 'A bigger wagon and a mule to pull it. Three adventurers can descend together.',
  tags: ['party'],
  building,
  tier: 3,
  column: 0,
  cost: { renown: 250 },
  requires: [UPGRADE_ROSTER_LEDGER.id],
  grants: [{ kind: 'capacity', key: 'partySize', amount: 1 }],
});

export const UPGRADE_FOURTH_BERTH = defineUpgrade({
  id: 'upgrade.fourth_berth',
  name: 'Fourth Berth',
  description: 'A full company. Four adventurers can descend together.',
  tags: ['party'],
  building,
  tier: 4,
  column: 0,
  cost: { renown: 600 },
  requires: [UPGRADE_THIRD_BERTH.id],
  grants: [{ kind: 'capacity', key: 'partySize', amount: 1 }],
});

export const UPGRADE_DRILL_YARD = defineUpgrade({
  id: 'upgrade.drill_yard',
  name: 'Drill Yard',
  description: 'Mornings of footwork and feints behind the hall. Every adventurer strikes truer.',
  tags: ['party', 'numeric'],
  building,
  tier: 4,
  column: 1,
  cost: { renown: 400 },
  requires: [UPGRADE_THIRD_BERTH.id],
  exclusiveGroup: 'guild_hall.tier4',
  grants: [{ kind: 'bundle', scope: 'party', bundle: { modifiers: [{ stat: 'accuracy', op: 'add', value: 1 }] } }],
});

export const UPGRADE_OPEN_MUSTER = defineUpgrade({
  id: 'upgrade.open_muster',
  name: 'Open Muster',
  description: 'The doors open to every hopeful in the valley. The guild keeps many more adventurers on its books.',
  tags: ['roster', 'capability'],
  building,
  tier: 4,
  column: 2,
  cost: { renown: 400 },
  requires: [UPGRADE_THIRD_BERTH.id],
  exclusiveGroup: 'guild_hall.tier4',
  grants: [{ kind: 'capacity', key: 'rosterSize', amount: 4 }],
});
