# Backlog Index

**Next ID: ETH-024**

Sorted by milestone, then priority. See [README.md](README.md) for conventions.

## Epics

| Epic | Title | Status | Milestones |
|---|---|---|---|
| [project-setup](project-setup/_epic.md) | Project setup and tooling | active | M0 |
| [sim-core](sim-core/_epic.md) | Simulation core | active | M0, M1 |
| [dungeon-gen](dungeon-gen/_epic.md) | Dungeon generation | active | M0, M1, M5, M6 |
| [adventurer-ai](adventurer-ai/_epic.md) | Decision engine and baseline AI | active | M0, M1 |
| [behavior-rules](behavior-rules/_epic.md) | Behavior rules | active | M3 |
| [combat-items](combat-items/_epic.md) | Combat, items and statuses | active | M1 |
| [content](content/_epic.md) | Content definitions | active | M0, M1, M2, M3, M4, M5, M6 |
| [town-meta](town-meta/_epic.md) | Town, currencies and upgrades | active | M2, M3, M5 |
| [saves-platform](saves-platform/_epic.md) | Saves, desktop packaging and time-away | active | M2, M6 |
| [risk-omens](risk-omens/_epic.md) | Omens and conducts | active | M4 |
| [lineage](lineage/_epic.md) | Lineage | active | M5 |
| [deities](deities/_epic.md) | Deities and altars | active | M6 |
| [ui-shell](ui-shell/_epic.md) | UI shell and kit | active | M0, M1, M2 |
| [map-renderer](map-renderer/_epic.md) | Map renderer | active | M0, M1 |
| [codex-tooltips](codex-tooltips/_epic.md) | Codex and tooltips | active | M2 |
| [tools-balance](tools-balance/_epic.md) | Test and balance tooling | active | M0, M1 |

## Items

| ID | Title | Epic | Milestone | Priority | Status | Size |
|---|---|---|---|---|---|---|
| [ETH-001](project-setup/ETH-001-scaffold-project.md) | Scaffold Vite, React, strict TS, Vitest and ESLint layer rules | project-setup | M0 | P0 | done | M |
| [ETH-002](sim-core/ETH-002-core-utilities.md) | Core utilities: seeded RNG streams, Grid and Registry | sim-core | M0 | P0 | done | M |
| [ETH-003](sim-core/ETH-003-run-state-entities.md) | Run state and entity model with serialize round-trip | sim-core | M0 | P0 | done | M |
| [ETH-004](sim-core/ETH-004-scheduler-step-loop.md) | Energy scheduler and step loop with commands and events | sim-core | M0 | P0 | done | M |
| [ETH-005](sim-core/ETH-005-action-pipeline.md) | Action pipeline: move, wait and open door | sim-core | M0 | P0 | done | S |
| [ETH-006](dungeon-gen/ETH-006-dungeon-gen-pipeline.md) | Dungeon gen pipeline: rooms-and-corridors floor | dungeon-gen | M0 | P0 | done | M |
| [ETH-007](sim-core/ETH-007-fov-map-memory.md) | FOV and map memory | sim-core | M0 | P0 | done | S |
| [ETH-008](sim-core/ETH-008-goal-maps-pathing.md) | Goal maps (Dijkstra) and pathing | sim-core | M0 | P0 | done | S |
| [ETH-009](adventurer-ai/ETH-009-decision-engine-baseline-explore.md) | Decision engine with baseline exploration, trace and stuck detection | adventurer-ai | M0 | P0 | done | M |
| [ETH-010](sim-core/ETH-010-sim-host.md) | SimHost: inline and Web Worker hosts, snapshot protocol and speed | sim-core | M0 | P0 | done | M |
| [ETH-013](map-renderer/ETH-013-canvas-map-renderer.md) | Canvas map renderer: glyph atlas, fog and camera follow | map-renderer | M0 | P0 | done | M |
| [ETH-011](ui-shell/ETH-011-tokens-fonts-kit.md) | Design tokens, bundled fonts and first kit primitives | ui-shell | M0 | P1 | done | M |
| [ETH-012](ui-shell/ETH-012-app-shell-layout.md) | App shell layout: top bar, party column, map area, tabs and log | ui-shell | M0 | P1 | done | M |
| [ETH-014](ui-shell/ETH-014-pause-speed-controls.md) | Pause, speed controls and keyboard shortcuts | ui-shell | M0 | P1 | done | S |
| [ETH-015](content/ETH-015-content-registry-first-defs.md) | Content registry with validation and first definitions | content | M0 | P1 | done | S |
| [ETH-016](tools-balance/ETH-016-determinism-headless-run.md) | Determinism test and headless run script | tools-balance | M0 | P1 | done | S |
| [ETH-019](map-renderer/ETH-019-map-overlays-goal-possession-flash.md) | Map overlays: goal line, possession frame and hit flash | map-renderer | M1 | P2 | idea | S |
| [ETH-017](adventurer-ai/ETH-017-party-yield-in-corridors.md) | Party members yield or swap places in narrow passages | adventurer-ai | M1 | P2 | idea | S |
| [ETH-020](ui-shell/ETH-020-cycle-adventurers-key.md) | Key to cycle the selected adventurer | ui-shell | M1 | P2 | idea | S |
| [ETH-021](ui-shell/ETH-021-show-sim-errors.md) | Tell the player when the sim stops on an error | ui-shell | M1 | P2 | idea | S |
| [ETH-022](tools-balance/ETH-022-validate-content-cli.md) | Run content validation as a tsx command | tools-balance | M1 | P3 | idea | S |
| [ETH-023](town-meta/ETH-023-at-risk-run-currency.md) | Track run earnings as at-risk currency and lose 25% on a wipe | town-meta | M2 | P1 | idea | M |
| [ETH-018](ui-shell/ETH-018-trim-font-bundle.md) | Ship only the font files the app needs | ui-shell | later | P3 | idea | S |
