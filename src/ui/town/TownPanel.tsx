import { BUILDINGS } from '../../content';
import { formatNumber } from '../../core';
import { Tabs, Tooltip } from '../kit';
import type { TabItem } from '../kit';
import { useProfileStore } from '../stores/profileStore';
import { BUILDING_PANELS } from './panels';
import styles from './TownPanel.module.css';
import { UpgradeTree } from './UpgradeTree';

/**
 * The Town tab (docs/VISUAL-DESIGN.md §5.2): one tab per building, each showing its upgrade
 * tree (or the building's own panel from `BUILDING_PANELS`), and the banked currency to spend.
 */
export function TownPanel() {
  const renown = useProfileStore((s) => s.profile.currencies.renown);
  const trophies = useProfileStore((s) => s.profile.currencies.trophies);
  const items: TabItem[] = BUILDINGS.all().map((building) => {
    const Panel = BUILDING_PANELS[building.id] ?? UpgradeTree;
    return {
      id: building.id,
      label: (
        <Tooltip content={building.description}>
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
