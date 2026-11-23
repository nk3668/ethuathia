/**
 * The dungeon panel (CLAUDE.md §2, step 6): the dungeon variants as a radio list. Variants an
 * upgrade has yet to unlock are shown disabled, marked with a padlock.
 */
import { DUNGEONS, findDef } from '../../../content';
import { chosenDungeon, isAvailable } from '../../../meta';
import { Explain } from '../../codex/Explain';
import styles from '../panels.module.css';
import type { PreparePanelProps } from '../types';

export function DungeonPanel({ profile, choices, update }: PreparePanelProps) {
  const chosen = chosenDungeon(profile, choices.dungeon);
  return (
    <fieldset className={styles.choices}>
      <legend className={styles.label}>Dungeon</legend>
      {DUNGEONS.all().map((d) => {
        const open = isAvailable(profile, d.id);
        return (
          <label key={d.id} className={styles.choice} data-disabled={open ? undefined : 'true'}>
            <input
              type="radio"
              name="prepare-dungeon"
              value={d.id}
              checked={d.id === chosen.id}
              disabled={!open}
              onChange={() => update('dungeon', { dungeonId: d.id })}
            />
            <span className={styles.choiceText}>
              <span className={styles.choiceName}>
                {!open && <span aria-hidden="true">🔒 </span>}
                <Explain id={d.id} />
              </span>
              <span className={styles.note}>
                {d.depth.min === d.depth.max ? `${d.depth.min} ${d.depth.min === 1 ? 'floor' : 'floors'}` : `${d.depth.min}–${d.depth.max} floors`} ·{' '}
                <Explain id={d.floorType}>{findDef(d.floorType)?.name ?? d.floorType}</Explain>
                {!open && ' · locked: unlocked by an upgrade'}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

