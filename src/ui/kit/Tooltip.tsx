import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useMergeRefs,
  useRole,
} from '@floating-ui/react';
import type { Placement } from '@floating-ui/react';
import { cloneElement, isValidElement, useState } from 'react';
import type { HTMLProps, ReactElement, ReactNode, Ref } from 'react';
import styles from './Tooltip.module.css';

/** How long the pointer rests on a trigger before its tooltip opens. Focus opens it at once. */
export const TOOLTIP_OPEN_DELAY_MS = 250;

export interface TooltipProps {
  /** What the tooltip says. */
  content: ReactNode;
  /**
   * The trigger. A single element (a `Button`, a link) gets the tooltip wired onto it and must
   * accept a ref. Plain text is wrapped in a focusable span so keyboard users can reach it.
   */
  children: ReactNode;
  placement?: Placement;
}

type TriggerElement = ReactElement<HTMLProps<Element> & { ref?: Ref<Element> }>;

/**
 * A hover and focus tooltip, positioned with Floating UI. It opens on pointer hover (after a
 * short delay) and on keyboard focus, closes on Escape, and is linked to its trigger with
 * `aria-describedby`.
 */
export function Tooltip({ content, children, placement = 'top' }: TooltipProps) {
  const [open, setOpen] = useState(false);
  // The two elements are held in state rather than Floating UI's `refs`, so render never reads
  // a ref object.
  const [reference, setReference] = useState<Element | null>(null);
  const [floating, setFloating] = useState<HTMLElement | null>(null);
  const { floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    elements: { reference, floating },
    placement,
    whileElementsMounted: autoUpdate,
    // Floating UI takes plain numbers: 4 and 8 are --space-1 and --space-2.
    middleware: [offset(4), flip(), shift({ padding: 8 })],
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useHover(context, { delay: { open: TOOLTIP_OPEN_DELAY_MS, close: 0 }, move: false }),
    useFocus(context),
    useDismiss(context),
    useRole(context, { role: 'tooltip' }),
  ]);

  const element = isValidElement(children) ? (children as TriggerElement) : null;
  const triggerRef = useMergeRefs([setReference, element?.props.ref]);

  const trigger = element ? (
    cloneElement(element, getReferenceProps({ ...element.props, ref: triggerRef }))
  ) : (
    <span tabIndex={0} className={styles.trigger} {...getReferenceProps({ ref: triggerRef })}>
      {children}
    </span>
  );

  return (
    <>
      {trigger}
      {open && (
        <FloatingPortal>
          <div ref={setFloating} style={floatingStyles} className={styles.tooltip} {...getFloatingProps()}>
            {content}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
