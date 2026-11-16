---
epic: ui-shell
title: UI shell and kit
status: active
milestones: [M0, M1, M2]
---

## Goal
A consistent, readable dark interface: shared tokens and components, the in-run layout, and the controls around the map.

## Scope
**In:**
- Design tokens and bundled fonts
- Kit components
- In-run layout, party cards, log
- Pause, speed and keyboard input
- Run summary and Options

**Out (later or elsewhere):**
- Map drawing (see `map-renderer`)
- Feature screens that belong to their own epics

## Design refs
- `CLAUDE.md` §8: UI
- `docs/VISUAL-DESIGN.md`
- `docs/ARCHITECTURE.md` §8

## Items
- [x] [ETH-011 Design tokens, bundled fonts and first kit primitives](ETH-011-tokens-fonts-kit.md)
- [x] [ETH-012 App shell layout: top bar, party column, map area, tabs and log](ETH-012-app-shell-layout.md)
- [ ] [ETH-014 Pause, speed controls and keyboard shortcuts](ETH-014-pause-speed-controls.md)
- [ ] [ETH-018 Ship only the font files the app needs](ETH-018-trim-font-bundle.md)
