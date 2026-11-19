---
id: ETH-095
title: Tauri desktop packaging and save backend
type: feature
status: ready
priority: P1
milestone: M2
epic: saves-platform
size: M
depends_on: [ETH-059]
created: 2026-11-18
updated: 2026-11-18
---

## Summary
Package the game as a Tauri desktop app and add the Tauri save adapter that writes the save file to the app data folder.

## Why
`CLAUDE.md` §9. Nate chose to package early, in M2 (Nate's interview answers (2026-11-18)).

## Acceptance criteria
- [ ] `npm run tauri build` makes an installer that runs offline
- [ ] The Tauri storage adapter writes and reads the save file; the browser keeps IndexedDB
- [ ] No network permissions in the Tauri config; fonts and assets bundled
- [ ] Autosave on close
- [ ] README section on building the desktop app

## Notes
Electron is the fallback if Tauri causes trouble.

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
