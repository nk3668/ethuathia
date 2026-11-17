---
id: ETH-018
title: "Ship only the font files the app needs"
type: chore
status: idea
priority: P3
milestone: later
epic: ui-shell
size: S
depends_on: [ETH-011]
created: 2026-11-16
updated: 2026-11-16
---

## Summary
Drop the `.woff` fallbacks and unused subsets from the bundled fonts so the build carries only `.woff2` files for the scripts the game uses.

## Why
ETH-011 imports the `@fontsource` weight files, which reference a `.woff2` and a `.woff` for every subset (Cyrillic, Greek, Vietnamese and so on). The build currently emits about 0.9 MB of font files; the Tauri webview reads `.woff2`, so the `.woff` half (about 540 kB) is never loaded. See `docs/VISUAL-DESIGN.md` §2.4.

## Acceptance criteria
- [ ] The build emits only `.woff2` font files, for the subsets the UI and content use
- [ ] Text in every subset kept still renders in Inter and JetBrains Mono, with no network request

## Notes
Options: write our own `@font-face` rules pointing at `@fontsource/*/files/*.woff2` with the same `unicode-range` values, or filter the emitted assets in a Vite plugin. Keep `latin-ext` so names with accents render.

## Log
- 2026-11-16: Created while doing ETH-011.
