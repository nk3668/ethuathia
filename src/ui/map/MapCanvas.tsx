import { flip, FloatingPortal, offset, shift, useFloating } from '@floating-ui/react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Pos } from '../../core';
import { ExplainCard } from '../codex/Explain';
import { useSimStore } from '../stores/simStore';
import { useUiStore } from '../stores/uiStore';
import type { MapFocus } from '../stores/uiStore';
import { followTarget } from './camera';
import styles from './MapCanvas.module.css';
import { MapRenderer } from './MapRenderer';
import type { MapView } from './MapRenderer';
import { describeTile, tileSubject } from './scene';
import { AsciiTheme } from './theme';

const NO_LINES: readonly string[] = [];

const FOG_NOTE = { visible: 'In view', remembered: 'Remembered, not in view', unknown: '' } as const;

/** The tooltip's lines for the hovered tile: what is there, then whether it is in view. */
function useTileLines(hover: Pos | null): readonly string[] {
  return useSimStore(
    useShallow((s) => {
      if (!hover || !s.snapshot) return NO_LINES;
      const info = describeTile(s.snapshot, hover);
      if (!info) return NO_LINES;
      return info.fog === 'unknown' ? info.things : [...info.things, FOG_NOTE[info.fog]];
    }),
  );
}

function samePos(a: Pos | null, b: Pos | null): boolean {
  return a === b || (a !== null && b !== null && a.x === b.x && a.y === b.y);
}

const ARROWS: Readonly<Record<string, Pos>> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

/**
 * The dungeon map (docs/VISUAL-DESIGN.md §4): owns the canvas and hands it to a `MapRenderer`.
 * Snapshots from `simStore` are drawn at most once per animation frame, outside React's render,
 * so a fast sim never re-renders this component.
 *
 * Hovering a tile (or moving the keyboard cursor with the arrow keys while the map has focus)
 * outlines it and shows a tooltip naming what is there. Clicking an adventurer, or pressing
 * Enter on one, selects it. A map focus from `uiStore` (a clicked highlight) is centered and
 * marked while it is on the shown floor; Escape clears it.
 */
export function MapCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const scheduleRef = useRef<() => void>(() => undefined);
  const mode = useUiStore((s) => s.mapCamera);
  const selected = useUiStore((s) => s.selected);
  const select = useUiStore((s) => s.select);
  const focus = useUiStore((s) => s.mapFocus);
  const focusMap = useUiStore((s) => s.focusMap);
  const depth = useSimStore((s) => s.snapshot?.floor.depth ?? null);
  const [hover, setHover] = useState<Pos | null>(null);
  const viewRef = useRef<Omit<MapView, 'focus'> & { focus: MapFocus | null }>({ mode, selected, hover, focus });
  /** The pointer's position over the canvas in CSS pixels, or `null` when it is elsewhere. */
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  // Camera mode, selection and hover are drawn on the next frame. A layout effect declared
  // before `useFloating`, so the tooltip's anchor already reads the new hover tile.
  useLayoutEffect(() => {
    viewRef.current = { mode, selected, hover, focus };
    scheduleRef.current();
  }, [mode, selected, hover, focus]);

  const lines = useTileLines(hover);
  const subject = useSimStore((s) => (hover && s.snapshot ? tileSubject(s.snapshot, hover) : null));
  const tooltipOpen = hover !== null && lines.length > 0;
  const tooltipId = useId();
  const [tooltip, setTooltip] = useState<HTMLElement | null>(null);
  // Anchored to the hovered tile, read when Floating UI positions the tooltip.
  const [anchor] = useState(() => ({
    getBoundingClientRect: (): DOMRect => {
      const canvas = canvasRef.current;
      const tile = viewRef.current.hover;
      const rect = tile ? rendererRef.current?.tileRect(tile) : null;
      if (!canvas || !rect) return new DOMRect();
      const box = canvas.getBoundingClientRect();
      return new DOMRect(box.left + rect.x, box.top + rect.y, rect.w, rect.h);
    },
  }));
  const { floatingStyles, update, refs } = useFloating({
    open: tooltipOpen,
    placement: 'right-start',
    elements: { floating: tooltip },
    // Floating UI takes plain numbers: 8 is --space-2.
    middleware: [offset(8), flip(), shift({ padding: 8 })],
  });
  const updateRef = useRef(update);

  useEffect(() => {
    updateRef.current = update;
  }, [update]);

  useEffect(() => {
    refs.setPositionReference(anchor);
  }, [refs, anchor]);

  // Set up the renderer once the canvas exists.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const css = getComputedStyle(canvas);
    const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    const fontFamily = token('--font-mono', 'monospace');
    const background = token('--bg-app', '#0e1116');
    let renderer: MapRenderer;
    try {
      renderer = new MapRenderer(
        canvas,
        new AsciiTheme({ fontFamily, background, badgeColor: token('--text', '#e3e8ee') }),
        { background, selection: token('--accent', '#e8a33d'), hover: token('--text', '#e3e8ee') },
      );
    } catch {
      return; // No 2D canvas (e.g. a test DOM): nothing to draw on.
    }
    rendererRef.current = renderer;

    let frame = 0;
    const draw = () => {
      frame = 0;
      const snap = useSimStore.getState().snapshot;
      if (!snap) return;
      const start = performance.now();
      const { focus: place, ...view } = viewRef.current;
      // A focus on another floor can't be shown; the camera follows as usual.
      renderer.draw(snap, { ...view, focus: place && place.floor === snap.floor.id ? place.pos : null });
      if (import.meta.env.DEV) canvas.dataset.frameMs = (performance.now() - start).toFixed(2);
      // The floor may have moved under a resting pointer.
      const pointer = pointerRef.current;
      if (pointer) {
        const tile = renderer.tileAt(pointer.x, pointer.y);
        if (!samePos(tile, viewRef.current.hover)) setHover(tile);
      }
      if (viewRef.current.hover) void updateRef.current();
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(draw);
    };
    scheduleRef.current = schedule;

    const dpr = () => window.devicePixelRatio || 1;
    const measure = (deviceSize?: { inlineSize: number; blockSize: number }) => {
      const ratio = dpr();
      let width = Math.round(canvas.clientWidth * ratio);
      let height = Math.round(canvas.clientHeight * ratio);
      // The exact device size, unless it disagrees with the pixel ratio (as under DevTools'
      // device emulation), when the cells would come out the wrong size.
      if (deviceSize && Math.abs(deviceSize.inlineSize - width) <= 1 && Math.abs(deviceSize.blockSize - height) <= 1) {
        width = deviceSize.inlineSize;
        height = deviceSize.blockSize;
      }
      renderer.resize(width, height, ratio);
      // Drawn now rather than next frame, so a resize never shows a cleared canvas.
      if (frame !== 0) cancelAnimationFrame(frame);
      draw();
    };

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(([entry]) => measure(entry?.devicePixelContentBoxSize?.[0]));
      try {
        // Exact device pixels where supported, and a callback when only the pixel ratio changes.
        observer.observe(canvas, { box: 'device-pixel-content-box' });
      } catch {
        observer.observe(canvas);
      }
    }
    measure();

    // Moving to a screen with another pixel ratio doesn't resize the canvas in CSS pixels.
    let ratioQuery: MediaQueryList | null = null;
    const onRatioChange = () => {
      ratioQuery?.removeEventListener('change', onRatioChange);
      ratioQuery = window.matchMedia?.(`(resolution: ${dpr()}dppx)`) ?? null;
      ratioQuery?.addEventListener('change', onRatioChange);
      measure();
    };
    ratioQuery = window.matchMedia?.(`(resolution: ${dpr()}dppx)`) ?? null;
    ratioQuery?.addEventListener('change', onRatioChange);

    // Glyphs drawn before the bundled font loads use a fallback font; draw them again after.
    let disposed = false;
    const fonts = document.fonts as FontFaceSet | undefined;
    if (fonts) {
      void Promise.all([fonts.load(`400 16px ${fontFamily}`), fonts.load(`700 16px ${fontFamily}`)])
        .catch(() => undefined)
        .then(() => {
          if (disposed) return;
          renderer.invalidate();
          schedule();
        });
    }

    const unsubscribe = useSimStore.subscribe((s, prev) => {
      if (s.snapshot !== prev.snapshot) schedule();
    });
    return () => {
      disposed = true;
      unsubscribe();
      observer?.disconnect();
      ratioQuery?.removeEventListener('change', onRatioChange);
      if (frame !== 0) cancelAnimationFrame(frame);
      scheduleRef.current = () => undefined;
      rendererRef.current = null;
    };
  }, []);

  const tileFromPointer = (e: MouseEvent<HTMLCanvasElement>): Pos | null => {
    const box = e.currentTarget.getBoundingClientRect();
    pointerRef.current = { x: e.clientX - box.left, y: e.clientY - box.top };
    return rendererRef.current?.tileAt(pointerRef.current.x, pointerRef.current.y) ?? null;
  };

  /** Selects the living adventurer on `tile`, if there is one. */
  const selectAt = (tile: Pos | null) => {
    const snap = useSimStore.getState().snapshot;
    if (!tile || !snap) return;
    const member = snap.party.find(
      (m) => m.alive && m.floor === snap.floor.id && m.pos.x === tile.x && m.pos.y === tile.y,
    );
    if (member) select(member.id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const step = ARROWS[e.key];
    const snap = useSimStore.getState().snapshot;
    if (step && snap) {
      e.preventDefault();
      pointerRef.current = null;
      const from = hover ?? followTarget(snap, selected)?.pos ?? { x: 0, y: 0 };
      setHover({
        x: Math.min(Math.max(from.x + (hover ? step.x : 0), 0), snap.floor.width - 1),
        y: Math.min(Math.max(from.y + (hover ? step.y : 0), 0), snap.floor.height - 1),
      });
    } else if (e.key === 'Escape' && (hover || focus)) {
      e.preventDefault();
      if (hover) setHover(null);
      else focusMap(null);
    } else if (e.key === 'Enter') {
      selectAt(hover);
    }
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        tabIndex={0}
        role="application"
        aria-roledescription="map"
        aria-label={`Dungeon map${depth === null ? '' : `, floor ${depth}`}. Arrow keys inspect tiles; Enter selects an adventurer.`}
        aria-describedby={tooltipOpen ? tooltipId : undefined}
        onPointerMove={(e) => {
          const tile = tileFromPointer(e);
          if (!samePos(tile, hover)) setHover(tile);
        }}
        onPointerLeave={() => {
          pointerRef.current = null;
          setHover(null);
        }}
        onClick={(e) => selectAt(tileFromPointer(e))}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (pointerRef.current === null) setHover(null);
        }}
      />
      {tooltipOpen && (
        <FloatingPortal>
          <div ref={setTooltip} id={tooltipId} role="tooltip" className={styles.tooltip} style={floatingStyles}>
            {lines.map((line, i) => (
              <div key={i} className={i === lines.length - 1 && lines.length > 1 ? styles.note : undefined}>
                {line}
              </div>
            ))}
            {subject !== null && <ExplainCard id={subject} heading={false} className={styles.explain} />}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
