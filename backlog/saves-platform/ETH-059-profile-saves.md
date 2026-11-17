---
id: ETH-059
title: Profile, banked currencies and versioned local saves
type: feature
status: done
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
- [x] `src/meta/profile.ts`: `Profile` type (plain data), `newProfile()`, and pure `applyRunResult(profile, result)` that banks a run's rewards; `RunResult` type agreed with ETH-062 (outcome, at-risk totals per currency, stats)
- [x] Currencies: Renown, Trophies, Favor per deity id; formatted with `formatNumber`
- [x] `SaveStore` interface in `src/platform/` with memory and IndexedDB backends and a Tauri stub; autosave on an interval and on `beforeunload`
- [x] Saves carry a version; a migration chain upgrades old saves; tests cover a v1 → current migration
- [x] Export to string/file, import with validation, hard reset (with confirm)
- [x] `profileStore` reads from the Profile; the top bar shows banked currencies with tooltips
- [x] No network access anywhere (offline-only rule)

## Log
- 2026-11-17: Created as part of the backlog fan-out plan.
- 2026-11-17: Started.
- 2026-11-17: (default) `RunResult` lives in `src/sim/run/result.ts` and carries `atRisk` and `lost` as flat currency-id records; meta banks `atRisk - lost` — alternative: meta computes the wipe loss itself from the outcome.
- 2026-11-17: (default) Favor reward keys are `favor:<deity id>` — alternatives: the bare deity id, or a nested favor record in `RewardAmounts`.
- 2026-11-17: (default) The Omen multiplier is not applied anywhere yet; ETH-067 decides where — the Contracts text said meta applies it after the wipe loss, while ETH-023's notes say before it.
- 2026-11-17: (default) Each profile slice has its own version and migration chain, plus an envelope version for the save layout — alternative: one global profile version, which every feature branch would bump.
- 2026-11-17: Done. The Profile is composed from slices (`currencies`, `history`) in `src/meta/slices/`; `applyRunResult` runs each slice's step; saves are a versioned envelope with migrations; memory, IndexedDB and Tauri-stub `SaveStore`s; autosave; a Save section in Options (export, import, hard reset); the top bar reads banked currencies.
