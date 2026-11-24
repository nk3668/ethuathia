---
epic: saves-platform
title: Saves, desktop packaging and time-away
status: active
milestones: [M2, M8]
---

## Goal
Progress is saved locally and safely, the game installs as a desktop app, and time away is caught up on load.

## Scope
**In:**
- SaveStore implementations
- Versioned saves and migrations
- Export, import and hard reset
- Tauri packaging
- Time-away simulation and summary

**Out (later or elsewhere):**
- Anything that needs a network (never)

## Design refs
- `CLAUDE.md` §5.5: Time-away progress
- `CLAUDE.md` §9: Saves, Distribution
- `docs/ARCHITECTURE.md` §6.5, §6.6, §8.4

## Items
- None yet. Items are added when M2 becomes the current milestone.
- [x] [ETH-059 Profile, banked currencies and versioned local saves](ETH-059-profile-saves.md)
- [x] [ETH-095 Tauri desktop packaging and save backend](ETH-095-tauri-packaging-saves.md)
- [ ] [ETH-128 Time-away catch-up simulation and summary](ETH-128-time-away-catch-up.md)
