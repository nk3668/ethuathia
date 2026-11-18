/**
 * The dungeon panel (CLAUDE.md §2, step 6): the dungeon variants as a radio list. Variants an
 * upgrade has yet to unlock are shown disabled, marked with a padlock.
 */
import { DungeonPanel } from '../components/DungeonPanel';
import { definePreparePanel } from '../types';

export default definePreparePanel({ id: 'dungeon', title: 'Dungeon', column: 'risk', order: 10, Component: DungeonPanel });
