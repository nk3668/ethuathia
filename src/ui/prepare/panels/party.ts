/**
 * The party panel (CLAUDE.md §2, step 1): one row per party slot the Guild Hall allows, each
 * with a class and a race to recruit, or "Random". Slots the party can't use yet are listed
 * locked, with what opens them.
 */
import { PartyPanel } from '../components/PartyPanel';
import { definePreparePanel } from '../types';

export default definePreparePanel({ id: 'party', title: 'Party', column: 'party', order: 10, Component: PartyPanel });
