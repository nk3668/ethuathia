---
id: ETH-133
title: Extensible Danger scale, innate monster Bundles, and variable hidden dungeon depth
type: feature
status: done
priority: P1
milestone: M1.5
epic: dungeon-gen
size: M
depends_on: [ETH-058, ETH-117, ETH-131]
created: 2026-11-23
updated: 2026-11-23
---

## Summary
Decouple monster scaling from hardcoded floor numbers via an open-ended numeric **Danger** scale (`MonsterDef.danger`, ecology `tags`, optional innate `bundle`, and `MonsterTemplateDef.threatMul`), move dungeon curves and ecology weights into `DungeonDef`, and give *The Old Delve* a deterministic, hidden variable floor depth (`6–10`).

## Why
Tying monsters solely to `depth: { min, max }` on a fixed 10-floor dungeon breaks as soon as bestiary variety or harder dungeons are added (`docs/DIFFICULTY_PHILOSOPHY.md` §3.1–3.5 & §5). Separating floor number from floor Danger and hiding rolled depth creates tension on low-HP pushes while keeping future content expansions pure data.

## Acceptance criteria
- [x] `MonsterDef` supports open-ended `danger: { min, peak?, max }` (with peak-weighted selection tapering toward `min`/`max`), ecology `tags`, and optional innate `bundle`; `MonsterTemplateDef` supports `threatMul`, validated at load by `npm run validate:content`.
- [x] `DungeonDef` (`src/content/dungeons.ts`) supports data-driven difficulty profiles: variable `depth: { min, max }` (via `clampRange` from `src/core/range.ts`, rolled deterministically from run seed and preserved on Rematch `ETH-084`), `danger: { start, perFloor }`, optional ecology tag filter/weights, and density/template/patrol curve params; *The Old Delve* uses hidden `depth: { min: 6, max: 10 }` and `danger: { start: 1, perFloor: 1 }`.
- [x] Rolled max depth stays hidden from UI surfaces (TopBar, map header, log, Codex show `Floor N`, never `N / M`, until a living party member enters the bottom floor) and is never read by adventurer AI; extend `ETH-131` secrecy / AI-indistinguishability guards to enforce this.
- [x] Variable depth interacts cleanly with depth-weighted Renown (`ETH-085`) and contract completion so deeper rolled runs reward more Renown.
- [x] Update `STATE_VERSION` in `src/sim/state.ts` and `docs/ARCHITECTURE.md` if `RunState` shape changes, with save/load determinism and `npm run check` passing.

## Notes
- See `docs/DIFFICULTY_PHILOSOPHY.md` §3.1–3.5 and §5.
- Reserve an easy capability hook for a future Cartographer upgrade that reveals exact depth at run start (`FLAG_REVEAL_DEPTH`).
- Depth-scaled contract reward payout balancing deferred to `ETH-141` (end of M2); `ETH-085` `depthRenown` handles depth scaling cleanly for M1.5.

## Log
- 2026-11-23: Created as part of M1.5 (Living Dungeon & Balance).
- 2026-11-23: Implemented on branch `eth-133-danger-and-hidden-depth` (`STATE_VERSION = 31`); contract payout scaling deferred to `ETH-141`.
