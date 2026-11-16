---
id: ETH-001
title: "Scaffold Vite, React, strict TS, Vitest and ESLint layer rules"
type: chore
status: ready
priority: P0
milestone: M0
epic: project-setup
size: M
depends_on: []
created: 2026-11-16
updated: 2026-11-16
---

## Summary
Create the project skeleton: build, test and lint tooling, the `src/` folder layout, and automatic enforcement of the import-direction rule.

## Why
Everything else builds on this. Enforcing the layers from day one keeps the sim free of DOM code. See `docs/ARCHITECTURE.md` §1 and `CLAUDE.md` §9.

## Acceptance criteria
- [ ] `npm run dev` serves a placeholder React page; `npm run build` succeeds
- [ ] `npm test` runs Vitest with one passing sample test; `npm run lint` passes
- [ ] TypeScript is strict; `core`, `content`, `sim` and `meta` type-check without DOM types
- [ ] A deliberate upward import (e.g. `sim` importing `ui`) and a `Math.random()` call in `sim` each fail lint
- [ ] No dependency or asset loads from a network at runtime

## Notes
Folders: `src/{core,content,sim,meta,platform,ui}`, `tools/`, `test/`. Consider `git init` and a `.gitignore` here; ask the user first.

## Log
- 2026-11-16: Created.
