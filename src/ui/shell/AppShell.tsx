import { useEffect, useId, useRef } from 'react';
import type { CSSProperties } from 'react';
import { useUiStore } from '../stores/uiStore';
import styles from './AppShell.module.css';
import { LogPanel } from './LogPanel';
import { LogResizer } from './LogResizer';
import { MapArea } from './MapArea';
import { PartyColumn } from './PartyColumn';
import { SideDrawer, SidePanel } from './SidePanel';
import { TopBar } from './TopBar';
import { NARROW_QUERY, useMediaQuery } from './useMediaQuery';

/**
 * The in-run screen (docs/VISUAL-DESIGN.md §3): a CSS grid with five named areas, `topbar`,
 * `party`, `map`, `tabs` and `log`. Below about 1000px wide (`NARROW_QUERY`) the tab panel
 * becomes a drawer opened from the top bar and the party cards go compact.
 */
export function AppShell() {
  const narrow = useMediaQuery(NARROW_QUERY);
  const logHeight = useUiStore((s) => s.logHeight);
  const drawerOpen = useUiStore((s) => s.drawerOpen);
  const setDrawerOpen = useUiStore((s) => s.setDrawerOpen);
  const drawerId = useId();
  const drawerButton = useRef<HTMLButtonElement>(null);

  // The drawer only exists in the narrow layout; widening the window shows the panel in place.
  const drawerShown = narrow && drawerOpen;

  // Focus goes back to the button that opened the drawer when it closes.
  const wasShown = useRef(drawerShown);
  useEffect(() => {
    if (wasShown.current && !drawerShown) drawerButton.current?.focus();
    wasShown.current = drawerShown;
  }, [drawerShown]);

  const behindDrawer = drawerShown || undefined;
  const gridStyle = { '--log-height': `${logHeight}px` } as CSSProperties;

  return (
    <div className={styles.shell} data-layout={narrow ? 'narrow' : 'wide'} style={gridStyle}>
      <div className={styles.topbar} inert={behindDrawer}>
        <TopBar
          narrow={narrow}
          drawerOpen={drawerShown}
          drawerId={drawerId}
          onToggleDrawer={() => setDrawerOpen(!drawerOpen)}
          drawerButtonRef={drawerButton}
        />
      </div>
      <main className={styles.main} inert={behindDrawer}>
        <div className={styles.party}>
          <PartyColumn compact={narrow} />
        </div>
        <div className={styles.map}>
          <MapArea />
        </div>
        {!narrow && (
          <div className={styles.tabs}>
            <SidePanel className={styles.fill} />
          </div>
        )}
        <div className={styles.log}>
          <LogResizer />
          <LogPanel />
        </div>
      </main>
      {drawerShown && <SideDrawer id={drawerId} onClose={() => setDrawerOpen(false)} />}
    </div>
  );
}
