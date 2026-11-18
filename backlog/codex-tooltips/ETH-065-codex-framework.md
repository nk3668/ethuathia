---
id: ETH-065
title: Codex tab, discovery tracking and Explain tooltips from content
type: feature
status: done
priority: P1
milestone: M2
epic: codex-tooltips
size: M
depends_on: [ETH-059]
created: 2026-11-17
updated: 2026-11-18
---

## Summary
A Codex that fills in as things are discovered, plus a shared `Explain` tooltip that renders any content def by id.

## Why
See `CLAUDE.md` §1 (Readable), §8 (Codex). Many items need "a Codex entry" and should only add data.

## Acceptance criteria
- [x] A discovery tracker turns sim events (first seen, first killed, first used) into `codex` discoveries in the run result; `applyRunResult` merges them into the Profile
- [x] Codex tab: sections per content kind (classes, races, monsters, items, Omens, deities…), undiscovered entries shown as unknown, search box
- [x] Each content kind can register a Codex renderer (fields shown, grouping key such as monster family) without editing the tab
- [x] `Explain` tooltip component renders a def's name, description and key stats by id; used by the log and map inspect
- [x] Tests for the tracker and a component test for the tab

## Log
- 2026-11-17: Created as part of the backlog fan-out plan.
- 2026-11-17: Started.
- 2026-11-18: Done. `CODEX_TRACKER` (`track.codex`) reduces events through per-domain `discoveries` maps (`DISCOVERY_RULES`); core discovers opened doors, floors discovers stairs taken. Profile `codex` slice merges `extras['track.codex']`. Codex tab with renderer files in `ui/codex/renderers/` (picked up by `import.meta.glob`), search and section filter; live discoveries from `simStore`. `Explain` used in the log (via `mention` parts) and the map hover tooltip.
- (default) Terrain is always known; classes, races and floor types stay `???` until events that discover them exist (ETH-062 run start, floor entry with its type) — alternatives: treat the party's own class and race as known from the start.
- (default) `Explain` shows full details even for entries the Codex still lists as `???` (anything mentioned in the log or on the map has been met) — alternative: show `???` there too.
- (default) The Codex is one column in the side panel (search, section toggles, disclosure rows) rather than the two-pane mock-up, which doesn't fit 360px — alternative: a wider Codex modal with two panes.
