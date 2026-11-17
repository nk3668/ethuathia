import { useCallback, useSyncExternalStore } from 'react';

/**
 * Below this width the side panel becomes a drawer and party cards go compact
 * (docs/VISUAL-DESIGN.md §3). It lives here rather than in a CSS media query so the layout
 * switch has one source: the shell sets `data-layout` from it and the stylesheets follow that.
 */
export const NARROW_QUERY = '(max-width: 999px)';

/** True while the media query matches. False where `matchMedia` is missing (tests, old engines). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  const read = () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  return useSyncExternalStore(subscribe, read, () => false);
}
