import { BUILDINGS, describeMilestone, describeProgress } from '../../content';
import type { BuildingDef, Milestone } from '../../content';
import { formatNumber } from '../../core';
import { lockingMilestone, milestoneProgress, unlockOf } from '../../meta';
import { Tabs, Tooltip } from '../kit';
import type { TabItem } from '../kit';
import { useProfileStore } from '../stores/profileStore';
import { BUILDING_PANELS } from './panels';
import styles from './TownPanel.module.css';
import { UpgradeTree } from './UpgradeTree';

/**
 * The Town tab (docs/VISUAL-DESIGN.md §5.2): one tab per building, each showing its upgrade
 * tree (or the building's own panel from `BUILDING_PANELS`), and the banked currency to spend.
 * A building still locked by its milestone (ETH-074) has a padlocked tab that says what opens it.
 */
export function TownPanel() {
  const profile = useProfileStore((s) => s.profile);
  const { renown, trophies } = profile.currencies;
  const items: TabItem[] = BUILDINGS.all().map((building) => {
    const shut = lockingMilestone(profile, building.id);
    if (shut !== null) {
      return {
        id: building.id,
        label: (
          <Tooltip content={`${building.description} Locked: ${describeMilestone(shut)}.`}>
            <span>
              {building.name}{' '}
              <span aria-hidden="true" className={styles.padlock}>
                🔒
              </span>
              <span className="sr-only">(locked)</span>
            </span>
          </Tooltip>
        ),
        content: <LockedBuilding building={building} milestone={shut} />,
      };
    }
    const Panel = BUILDING_PANELS[building.id] ?? UpgradeTree;
    const opened = unlockOf(profile, building.id);
    const about = opened === undefined ? building.description : `${building.description} Opened after run ${opened.run}.`;
    return {
      id: building.id,
      label: (
        <Tooltip content={about}>
          <span>{building.name}</span>
        </Tooltip>
      ),
      content: <Panel buildingId={building.id} />,
    };
  });

  return (
    <div className={styles.town}>
      <div role="group" className={styles.purse} aria-label="Banked currency to spend">
        <Tooltip content="Banked Renown, spent in the Guild Hall and the Library.">
          <span tabIndex={0}>
            <span aria-hidden="true" className={styles.renown}>
              ♛
            </span>
            <span className="sr-only">Renown</span> {formatNumber(renown)}
          </span>
        </Tooltip>
        <Tooltip content="Banked Trophies, spent in the Smithy.">
          <span tabIndex={0}>
            <span aria-hidden="true" className={styles.trophies}>
              ☠
            </span>
            <span className="sr-only">Trophies</span> {formatNumber(trophies)}
          </span>
        </Tooltip>
      </div>
      <Tabs label="Buildings" items={items} />
    </div>
  );
}

/** A building's panel while its milestone is unmet: what opens it and how far along the player is. */
function LockedBuilding({ building, milestone }: { building: BuildingDef; milestone: Milestone }) {
  const profile = useProfileStore((s) => s.profile);
  const progress = milestoneProgress(profile);
  return (
    <div className={styles.locked}>
      <p className={styles.lockedTitle}>
        <span aria-hidden="true">🔒 </span>
        {building.name} is locked
      </p>
      <p>{building.description}</p>
      <p>
        Unlocks when you: <strong>{describeMilestone(milestone)}</strong>
      </p>
      <p className={styles.progress}>{describeProgress(milestone, progress)}</p>
    </div>
  );
}
