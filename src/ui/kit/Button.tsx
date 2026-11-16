import type { ComponentPropsWithRef } from 'react';
import { cx } from './cx';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  /** `primary` is the accent fill for the main action; `secondary` is the default. */
  variant?: ButtonVariant;
  /**
   * Makes this a toggle button (e.g. a speed step). A pressed button is filled with the accent
   * and marked `aria-pressed`, so the state is not shown by color alone.
   */
  pressed?: boolean;
}

/** A button. Defaults to `type="button"` so it never submits a form by accident. */
export function Button({ variant = 'secondary', pressed, className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={cx(styles.button, styles[variant], pressed && styles.pressed, className)}
      {...rest}
    />
  );
}
