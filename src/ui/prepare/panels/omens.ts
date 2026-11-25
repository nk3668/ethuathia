/**
 * The Omens panel (ETH-185, CLAUDE.md §2 step 5): unlocked Omens with a rank selector each, and the
 * total reward multiplier. Left out until a town node has unlocked an Omen.
 */
import { availableOmens } from '../../../meta';
import { OmensPanel } from '../components/OmensPanel';
import { definePreparePanel } from '../types';

export default definePreparePanel({
  id: 'omens',
  title: 'Omens',
  column: 'risk',
  order: 30,
  Component: OmensPanel,
  shown: (profile) => availableOmens(profile).length > 0,
});
