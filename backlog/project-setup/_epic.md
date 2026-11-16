---
epic: project-setup
title: Project setup and tooling
status: active
milestones: [M0]
---

## Goal
A project that builds, tests and lints from a clean checkout, with the layer rules enforced automatically.

## Scope
**In:**
- Vite, React, strict TypeScript, Vitest, ESLint
- Folder layout and import-direction rules
- npm scripts for dev, test, lint and build

**Out (later or elsewhere):**
- Tauri packaging (see `saves-platform`)
- Balance and content tools (see `tools-balance`)

## Design refs
- `CLAUDE.md` §9: Tech and architecture
- `docs/ARCHITECTURE.md` §1: Layers

## Items
- [x] [ETH-001 Scaffold Vite, React, strict TS, Vitest and ESLint layer rules](ETH-001-scaffold-project.md)
