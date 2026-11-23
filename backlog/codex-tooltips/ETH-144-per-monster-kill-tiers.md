---
id: ETH-144
title: Per-monster Codex kill-tier thresholds for rare monsters
type: feature
status: ready
priority: P3
milestone: M1.6
epic: codex-tooltips
size: S
depends_on: [ETH-091]
created: 2026-11-23
updated: 2026-11-23
---

## Summary
Let a monster def override the Codex kill-count tiers (1 / 10 / 50 by default), so rare monsters can still reveal their full stats and lore.

## Why
ETH-091 sets one global set of tiers in `MONSTER_KILL_TIERS` (`src/ui/codex/renderers/monster.tsx`). Some monsters can't realistically reach 50 kills, so their lore and drops would stay hidden forever:
- named uniques and bosses (ETH-041), killed once per run at most;
- extremely rare spawns (ETH-109);
- out-of-depth monsters (ETH-134).

Found in the ETH-091 review.

## Acceptance criteria
- [ ] `MonsterDef` gets an optional `codexTiers` (`{ basics, stats, lore }`, strictly increasing, validated at load). When it's absent, the global `MONSTER_KILL_TIERS` apply.
- [ ] The monster renderer, the `CodexPanel` tier summary and the `Explain` tooltip all read the per-def tiers.
- [ ] Content guidance (`docs/ARCHITECTURE.md` content section): uniques use something like `1 / 2 / 3`, and rare spawns lower their lore tier.
- [ ] Tests: a def with overridden tiers reveals each section at its own thresholds. Defs without an override behave as before.

## Notes
- There are no uniques yet. Prove the field on one existing rare monster or a test fixture. ETH-041 then sets it on each unique.

## Log
- 2026-11-23: Created from the ETH-091 review (milestone M1.6, review follow-ups).
