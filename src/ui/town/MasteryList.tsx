import { formatNumber } from '../../core';
import { masteryClasses, masteryOf } from '../../meta';
import { Bar, Tooltip } from '../kit';
import { MASTERY_HELP } from '../shell/masteryText';
import { useProfileStore } from '../stores/profileStore';
import styles from './MasteryList.module.css';

/**
 * The Guild Hall's Class Mastery list (ETH-087): each class with its guild-wide Mastery level,
 * XP, progress to the next level (as a bar and as text) and banked talent points.
 */
export function MasteryList() {
  const profile = useProfileStore((s) => s.profile);
  return (
    <section className={styles.list} aria-label="Class Mastery">
      <h3 className={styles.heading}>
        <Tooltip content={MASTERY_HELP}>
          <span tabIndex={0}>Class Mastery</span>
        </Tooltip>
      </h3>
      <ul className={styles.rows}>
        {masteryClasses(profile).map((def) => {
          const m = masteryOf(profile, def.id);
          const step = m.into + m.toNext;
          return (
            <li key={def.id} className={styles.row}>
              <span className={styles.name}>{def.name}</span>
              <span className={styles.level}>Level {m.level}</span>
              <Bar
                className={styles.bar}
                label="To next"
                ariaLabel={`${def.name} Mastery progress to level ${m.level + 1}`}
                value={m.into}
                max={step}
                tone="xp"
              />
              <span className={styles.xp}>{formatNumber(m.xp)} XP</span>
              <Tooltip content="Talent points banked: one per level. They are spent on class talent trees from a later update.">
                <span className={styles.points} tabIndex={0}>
                  {m.points} {m.points === 1 ? 'point' : 'points'}
                </span>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
