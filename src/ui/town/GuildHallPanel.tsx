import styles from './TownPanel.module.css';
import { MasteryList } from './MasteryList';
import type { BuildingPanelProps } from './panels';
import { UpgradeTree } from './UpgradeTree';

/** The Guild Hall's panel: its upgrade tree, then the Class Mastery list (ETH-087). */
export function GuildHallPanel(props: BuildingPanelProps) {
  return (
    <div className={styles.town}>
      <UpgradeTree {...props} />
      <MasteryList />
    </div>
  );
}
