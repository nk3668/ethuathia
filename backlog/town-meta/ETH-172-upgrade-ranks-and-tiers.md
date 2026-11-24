---
id: ETH-172
title: Upgrade engine supports ranked nodes and quest-locked tiers
type: feature
status: ready
priority: P1
milestone: M2
epic: town-meta
size: M
depends_on: [ETH-063, ETH-086]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Extend the upgrade engine so a node can be bought several times (ranks, each with its own cost and effect), and so a building's higher tiers stay locked until that tier's quest is completed.

## Why
Nate (2026-11-24) wants deeper, slower trees where every run can buy something, ranked numeric nodes (e.g. Hardy Recruits I–V), and building tiers opened by quests. The talent trees (ETH-088) also use ranks. See `CLAUDE.md` §4.

## Acceptance criteria
- [x] Spec reviewed by Nate before building (spec gate)
- [ ] **Ranks in content.** `UpgradeNodeDef` gets an optional `ranks?: { max: number; costGrowth: number }` (`max` 2–10, `costGrowth` ≥ 1). Without it a node has one rank, as today. Rank `r` costs `cost × costGrowth^(r−1)` per currency, rounded to a readable number (`roundCost`: 2 significant figures, never below rank `r−1`'s cost). Each rank adds the node's `grants` once more: a capacity `+1` node at rank 3 gives `+3`, a bundle's modifiers stack 3 times. A ranked node may only have `capacity` and `bundle` grants (an `unlock` can't stack); `UPGRADE_KIND.check` rejects the rest.
- [ ] **Ranks in the profile.** The `upgrades` slice goes to version 2: `{ owned, ranks }`, where `ranks: Record<nodeId, number>` holds the rank of every owned node bought past rank 1 (absent means rank 1). `owned` keeps its meaning (rank ≥ 1, first purchase order), so prerequisites, pick-one groups and everything reading `owned` work unchanged. Migration v1 → v2 adds `ranks: {}`. Invariants: every `ranks` key is in `owned`; values are integers ≥ 2.
- [ ] **Engine.** `rankOf(profile, id)`, `rankCost(node, rank)`, `nextRankCost(profile, id)`. `purchase` buys the next rank. `canPurchase` returns `owned` only when the node is at its max rank (shown as "maxed"); a partly bought node is `available` or `expensive` for its next rank. `profileGrants` repeats each owned node's grants `rankOf` times, so `capacity`, `isUnlocked` and `buildRunConfig` need no change. Prerequisites need rank ≥ 1 of the required node.
- [ ] **Respec refunds every rank** bought (ETH-086's group respec and whole-tree reset): the refund is the sum of `rankCost` for ranks 1…n. The Foundations fee (ETH-086) is charged on that same total.
- [ ] **Tier gates in content.** `BuildingDef` gets an optional `tierGates?: { fromTier: number; unlock: Milestone; name?: string }[]`: every node row from `fromTier` down stays locked until `unlock` is met. Gates use the milestone system that already opens buildings (ETH-074): a tier quest (ETH-170) is an `objectiveDone` milestone, a depth gate is `reachDepth`, a "held during a run" gate is `metInRun` (ETH-121). Each gate is a milestone target with the id `<building id>_t<fromTier>` (e.g. `building.smithy_t4`), so it is recorded in the `milestones` slice like a building unlock, with no new slice. Validation: `fromTier` ≥ 2, strictly increasing, and no node's `requires` points from a lower gate band into a higher one. No building gets gates in this item; content comes with ETH-132, ETH-159 and ETH-170 (tests use fixture content).
- [ ] **Engine for gates.** `tierGate(profile, buildingId, tier)` returns the gate that keeps a tier locked, or `null`. `canPurchase` refuses a node behind a closed gate with status `locked` and a reason that names the milestone ("Tier 4 and up open when you bring the anvil home."). `milestoneTargets()` lists gates, so `milestoneRequirements` and `unlockMilestones` handle them with no special case, and the run summary's unlock lines report them.
- [ ] **Town UI.** A ranked node shows its rank as `2/5` on the node (and as Roman numerals in the name, e.g. "Hardy Recruits III", only in the tooltip), and its tooltip shows the current total effect, the next rank's cost and effect, and every rank's cost. A closed gate draws a labeled divider above its first row ("Tier II — locked: …") and greys every node under it; the divider has a tooltip with the full requirement. Never color alone: locked nodes keep the lock glyph and text.
- [ ] Codex/tooltip text for "Ranks" and "Building tiers" (a short help entry the tooltips link to).
- [ ] **Tests:** buying ranks one by one up to max; rank cost growth and rounding; `owned` stays maxed at max; grants stack per rank (capacity and bundle); a ranked node with an `unlock` grant fails validation; respec and tree reset refund every rank (with a nonzero fee constant too); a node behind a closed gate is refused with the milestone reason; the gate opens when its milestone is met in `applyRunResult`; v1 save migrates; profile round-trip; the §11.6 guard for `{ min?, max? }`-like range configs covers `ranks` if it applies.

## Notes
- **Naming.** A node's `tier` field stays the *row* it sits on. A "building tier" in `CLAUDE.md` §4 is the band of rows a gate opens, so tier gates are written in rows (`fromTier`). The UI labels bands I, II, III… from the gates.
- **Why a sparse `ranks` map, not `owned: { id, rank }[]`:** every existing reader of `owned` keeps working and the migration is one field.
- **Out of scope:** the actual tier quests (ETH-170), the 50%-bought offer rule (ETH-170), deeper Guild Hall content (ETH-132), Smithy content (ETH-159), talent-tree ranks (ETH-088 reuses this engine in M4).

Open decisions:
- (default) Rank costs grow geometrically from one `costGrowth` per node. Alternative: an explicit cost list per rank (more control, more data to write).
- (default) Every rank repeats the same grants. Alternative: a per-rank grant list (e.g. rank V adds a bonus effect). Can be added later as an optional field without a migration.
- (default) Tier gates reuse milestones (recorded once, never re-locked). Alternative: a bare ETH-121 `Requirement` checked live against the profile; milestones already do that and keep the unlock log.

## Log
- 2026-11-24: Created from the progression discussion with Nate.
- 2026-11-24: (spec gate) Spec written against the code (engine `src/meta/upgrades.ts`, slice `src/meta/slices/upgrades.ts`, content `src/content/upgrades.ts`, milestones `src/meta/milestones.ts`); awaiting Nate's review.
- 2026-11-24: Spec approved by Nate with all defaults as written. Status ready.
