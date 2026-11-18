/**
 * What the town gives this run (ETH-064): every owned upgrade's party bundle, which
 * `buildRunConfig` attaches to each adventurer. Read-only; the Town tab is where they are bought.
 */
import { TownPanel } from '../components/TownPanel';
import { definePreparePanel } from '../types';

export default definePreparePanel({ id: 'town', title: 'From the town', column: 'loadout', order: 10, Component: TownPanel });
