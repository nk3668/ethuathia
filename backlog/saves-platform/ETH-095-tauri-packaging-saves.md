---
id: ETH-095
title: Tauri desktop packaging and save backend
type: feature
status: done
priority: P1
milestone: M2
epic: saves-platform
size: M
depends_on: [ETH-059]
assignee: antigravity
created: 2026-11-18
updated: 2026-11-24
---

## Summary
Package the game as a Tauri desktop app and add the Tauri save adapter that writes the save file to the app data folder.

## Why
`CLAUDE.md` §9. Nate chose to package early, in M2 (Nate's interview answers (2026-11-18)).

## Acceptance criteria
- [x] `npm run tauri build` makes an installer that runs offline
- [x] The Tauri storage adapter writes and reads the save file; the browser keeps IndexedDB
- [x] No network permissions in the Tauri config; fonts and assets bundled
- [x] Autosave on close
- [x] README section on building the desktop app

## Notes
Electron is the fallback if Tauri causes trouble.

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-24: Assigned to Gemini (Antigravity); Claude reviews the PR.
- 2026-11-24: Implemented Tauri v2 desktop packaging (`src-tauri/`), `TauriSaveStore` + `isTauriRuntime()` + `subscribeTauriClose` (`src/platform/tauri.ts`, `saveStore.ts`, `autosave.ts`), async close saving in `profileStore.ts`, offline CSP/capability invariants tests, `README.md`, and `docs/ARCHITECTURE.md` (§6.5, §8.4) starting at `56049c6`. Verified with `cargo test --manifest-path src-tauri/Cargo.toml` (4 passed, 0 failed), `npm run tauri build` producing `Ethuathia_0.1.0_x64_en-US.msi` (3.34 MiB / 3,497,984 B) and `Ethuathia_0.1.0_x64-setup.exe` (2.40 MiB / 2,521,150 B), `npm run check`, and `npm run build`.
- 2026-11-24: Reviewed by Claude: npm run check green merged with main (1,410 tests), npm run build, cargo test 4/4 passed; capabilities, CSP and save writes checked. Merged; status done.
