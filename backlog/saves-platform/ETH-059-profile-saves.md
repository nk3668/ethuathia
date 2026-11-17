---
id: ETH-059
title: Profile, banked currencies and versioned local saves
type: feature
status: ready
priority: P0
milestone: M2
epic: saves-platform
size: M
depends_on: [ETH-055]
created: 2026-11-17
updated: 2026-11-17
---

## Summary
The meta layer's data root: a `Profile` (currencies, upgrades, roster, graveyard, codex, presets, settings, history slots) changed only by pure functions, saved locally with versions and migrations.

## Why
Town, Codex, roster, run history and offline progress all hang off the Profile. See `CLAUDE.md` §3, §9 (Saves) and `docs/ARCHITECTURE.md` §6.

## Acceptance criteria
- [ ] `src/meta/profile.ts`: `Profile` type (plain data), `newProfile()`, and pure `applyRunResult(profile, result)` that banks a run's rewards; `RunResult` type agreed with ETH-062 (outcome, at-risk totals per currency, stats)
- [ ] Currencies: Renown, Trophies, Favor per deity id; formatted with `formatNumber`
- [ ] `SaveStore` interface in `src/platform/` with memory and IndexedDB backends and a Tauri stub; autosave on an interval and on `beforeunload`
- [ ] Saves carry a version; a migration chain upgrades old saves; tests cover a v1 → current migration
- [ ] Export to string/file, import with validation, hard reset (with confirm)
- [ ] `profileStore` reads from the Profile; the top bar shows banked currencies with tooltips
- [ ] No network access anywhere (offline-only rule)

## Log
- 2026-11-17: Created as part of the backlog fan-out plan.
