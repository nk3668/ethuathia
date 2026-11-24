/**
 * Custom Town panels, keyed by building id. A building with no entry here gets the generic
 * `UpgradeTree`; one that needs more (the Tavern's job board, the Ossuary's heirlooms) adds its
 * component and one line here.
 */
import type { ComponentType } from 'react';
import { GuildHallPanel } from './GuildHallPanel';

export interface BuildingPanelProps {
  /** The building the panel is for (`building.guild_hall`). */
  buildingId: string;
}

export const BUILDING_PANELS: Readonly<Record<string, ComponentType<BuildingPanelProps>>> = {
  'building.guild_hall': GuildHallPanel,
};
