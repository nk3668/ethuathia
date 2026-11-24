/**
 * What the player may pick from on the Prepare screen. A content id that some upgrade node
 * unlocks (`{ kind: 'unlock', id }`) is locked until that node is owned; content no upgrade
 * unlocks is open from the start. So adding a class unlock to the Guild Hall (ETH-036) locks the
 * class with no other change.
 */
import { CLASSES, DUNGEONS, RACES, UPGRADES } from '../../content';
import type { ClassDef, DungeonDef, RaceDef } from '../../content';
import type { Profile } from '../profile';
import { isUnlocked } from '../upgrades';

/** True if some upgrade node unlocks `id`. */
export function lockedByUpgrade(id: string): boolean {
  return UPGRADES.all().some((node) => node.grants.some((g) => g.kind === 'unlock' && g.id === id));
}

/** True if the player may pick `id`: no upgrade unlocks it, or an owned one does. */
export function isAvailable(profile: Profile, id: string): boolean {
  return !lockedByUpgrade(id) || isUnlocked(profile, id);
}

export function availableClasses(profile: Profile): ClassDef[] {
  return CLASSES.all().filter((def) => isAvailable(profile, def.id));
}

/** The classes the Guild Hall's Mastery list shows (ETH-087): the available ones, plus any with Mastery XP (so a class that was once open never vanishes). */
export function masteryClasses(profile: Profile): ClassDef[] {
  return CLASSES.all().filter((def) => isAvailable(profile, def.id) || (profile.mastery.classes[def.id]?.xp ?? 0) > 0);
}

export function availableRaces(profile: Profile): RaceDef[] {
  return RACES.all().filter((def) => isAvailable(profile, def.id));
}

export function availableDungeons(profile: Profile): DungeonDef[] {
  return DUNGEONS.all().filter((def) => isAvailable(profile, def.id));
}
