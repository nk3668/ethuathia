import type { CSSProperties } from 'react';
import { cx } from './cx';
import styles from './Bar.module.css';

export type BarTone = 'hp' | 'mp' | 'xp' | 'accent' | 'good' | 'warn' | 'danger';

export interface BarProps {
  /** Short visible label, e.g. "HP". It names the bar, so color is never the only cue. */
  label: string;
  value: number;
  max: number;
  /** Fill color. Defaults to the accent. */
  tone?: BarTone;
  /** Show "value / max" after the bar. On by default. */
  showValue?: boolean;
  /** A longer accessible name when the visible label is not enough, e.g. "Mira's HP". */
  ariaLabel?: string;
  className?: string;
}

/** A labelled horizontal meter for HP, MP, XP and progress. */
export function Bar({ label, value, max, tone = 'accent', showValue = true, ariaLabel, className }: BarProps) {
  const safeMax = max > 0 ? max : 0;
  const clamped = Math.min(Math.max(value, 0), safeMax);
  const fraction = safeMax > 0 ? clamped / safeMax : 0;
  const fill = { '--bar-fraction': fraction } as CSSProperties;

  return (
    <div
      role="meter"
      aria-label={ariaLabel ?? label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={clamped}
      aria-valuetext={`${clamped} of ${safeMax}`}
      className={cx(styles.bar, styles[tone], className)}
    >
      <span className={styles.label} aria-hidden="true">
        {label}
      </span>
      <span className={styles.track} aria-hidden="true">
        <span className={styles.fill} style={fill} />
      </span>
      {showValue && (
        <span className={styles.value} aria-hidden="true">
          {clamped} / {safeMax}
        </span>
      )}
    </div>
  );
}
