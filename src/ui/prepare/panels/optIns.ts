/**
 * The opt-ins panel (ETH-187): owned upgrade nodes the player switches on for a run, such as the
 * Quartermaster's Mystery Crate. Shown only once one is owned.
 */
import { optInNodes } from '../../../meta';
import { OptInsPanel } from '../components/OptInsPanel';
import { definePreparePanel } from '../types';

export default definePreparePanel({
  id: 'opt-ins',
  title: 'Optional upgrades',
  column: 'loadout',
  order: 20,
  Component: OptInsPanel,
  shown: (profile) => optInNodes(profile).length > 0,
});
