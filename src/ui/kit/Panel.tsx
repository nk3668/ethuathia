import { useId } from 'react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cx } from './cx';
import styles from './Panel.module.css';

export interface PanelProps extends Omit<ComponentPropsWithoutRef<'section'>, 'title'> {
  /** Shown as the panel heading and used as the section's accessible name. */
  title?: ReactNode;
  /** Controls on the right of the heading row. */
  actions?: ReactNode;
}

/** A titled region of the screen: party column, tab panel, log. */
export function Panel({ title, actions, className, children, ...rest }: PanelProps) {
  const headingId = useId();
  const hasHeader = title !== undefined || actions !== undefined;
  return (
    <section
      aria-labelledby={title !== undefined ? headingId : undefined}
      className={cx(styles.panel, className)}
      {...rest}
    >
      {hasHeader && (
        <header className={styles.header}>
          {title !== undefined && (
            <h2 id={headingId} className={styles.title}>
              {title}
            </h2>
          )}
          {actions !== undefined && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      <div className={styles.body}>{children}</div>
    </section>
  );
}
