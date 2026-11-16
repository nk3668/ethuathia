---
id: ETH-011
title: "Design tokens, bundled fonts and first kit primitives"
type: feature
status: ready
priority: P1
milestone: M0
epic: ui-shell
size: M
depends_on: [ETH-001]
created: 2026-11-16
updated: 2026-11-16
---

## Summary
Tokens as CSS custom properties, Inter and JetBrains Mono bundled locally, and the first kit components: Panel, Card, Button, Tabs, Tooltip and Bar.

## Why
A shared visual base keeps every later screen consistent and cheap to build. See `docs/VISUAL-DESIGN.md` §2 and `docs/ARCHITECTURE.md` §8.1.

## Acceptance criteria
- [ ] `tokens.css` defines every token in `docs/VISUAL-DESIGN.md` §2; components use tokens only
- [ ] Both fonts load from the app bundle with no network request (checked in the browser network tab)
- [ ] Each text and background token pair meets 4.5:1 contrast; any adjusted value is updated in the design doc
- [ ] Kit components are keyboard-operable with a visible focus outline; Tooltip opens on focus and hover
- [ ] A kit gallery page in dev mode shows every component and state

## Notes
Tooltip via Floating UI. `NumberText`, `Explain`, `SortableList` and `NodeGraph` come with the features that first need them.

## Log
- 2026-11-16: Created.
