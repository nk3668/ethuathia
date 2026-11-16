import type { ComponentPropsWithoutRef } from 'react';
import { cx } from './cx';
import styles from './Card.module.css';

export interface CardProps extends ComponentPropsWithoutRef<'div'> {
  /**
   * Draws the selection border: accent colored and twice as thick, so selection is shown by
   * shape as well as color. Screens that make cards selectable also set the matching ARIA state
   * on the control that selects them.
   */
  selected?: boolean;
}

/** A raised box inside a panel: party member, rule, gravestone. */
export function Card({ selected = false, className, ...rest }: CardProps) {
  return (
    <div
      data-selected={selected || undefined}
      className={cx(styles.card, selected && styles.selected, className)}
      {...rest}
    />
  );
}
