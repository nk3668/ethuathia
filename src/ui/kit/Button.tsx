import type { Placement } from '@floating-ui/react';
import { useId } from 'react';
import type { ComponentPropsWithRef } from 'react';
import { cx } from './cx';
import { Tooltip } from './Tooltip';
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
  /**
   * Why this button cannot be used right now. When non-empty, the button stays visible and
   * natively disabled inside a focusable trigger whose tooltip shows the reason on hover and
   * keyboard focus, and exposes the reason to screen readers via `aria-describedby`.
   */
  disabledReason?: string | null;
  /** Placement of the `disabledReason` tooltip. Defaults to `Tooltip`'s `'top'`. */
  tooltipPlacement?: Placement;
}

/** A button. Defaults to `type="button"` so it never submits a form by accident. */
export function Button({
  variant = 'secondary',
  pressed,
  disabledReason,
  tooltipPlacement,
  disabled,
  'aria-describedby': ariaDescribedBy,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const reasonId = useId();
  const reason = disabledReason !== undefined && disabledReason !== null && disabledReason !== '' ? disabledReason : null;

  if (reason === null) {
    return (
      <button
        type={type}
        aria-pressed={pressed}
        aria-describedby={ariaDescribedBy}
        disabled={disabled}
        className={cx(styles.button, styles[variant], pressed && styles.pressed, className)}
        {...rest}
      >
        {children}
      </button>
    );
  }

  return (
    <Tooltip content={reason} placement={tooltipPlacement}>
      <span tabIndex={0} className={styles.disabledTrigger}>
        <button
          type={type}
          aria-pressed={pressed}
          aria-describedby={ariaDescribedBy ? `${ariaDescribedBy} ${reasonId}` : reasonId}
          disabled
          className={cx(styles.button, styles[variant], pressed && styles.pressed, className)}
          {...rest}
        >
          {children}
        </button>
        <span id={reasonId} className="sr-only"> ({reason})</span>
      </span>
    </Tooltip>
  );
}
