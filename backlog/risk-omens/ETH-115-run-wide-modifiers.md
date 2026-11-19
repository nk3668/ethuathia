---
id: ETH-115
title: Run-wide modifiers: a run-level BundleSource with sources, scopes, flags and tooltips
type: feature
status: blocked
priority: P1
milestone: M2
epic: risk-omens
size: M
depends_on: [ETH-057, ETH-063, ETH-064]
created: 2026-11-19
updated: 2026-11-19
---

## Summary
A single place for "something that changes the whole run": a list of run modifiers on the run
state, each with a source (an Omen, a blessing, an upgrade, a curse, an event, a veteran), a
scope (party, monsters or everyone), an optional bundle, optional named flags and an optional
reward bonus. A new `BundleSource` makes their bundles reach `getStat` and `fireTrigger`, and
every stat tooltip names the modifier.

## Why
Omens (ETH-067), deity blessings (ETH-070), cursed modifiers taken mid-run (ETH-105), floor-wide
dungeon events (ETH-107), doctrine (ETH-071) and Tavern veterans all change the run as a whole.
`docs/ARCHITECTURE.md` ("Stats") already says Omens and blessings should "add a `BundleSource`",
and the upgrade engine has `run`-scope bundle grants with no consumer yet (§6.3). Building it once
avoids six parallel versions. See `CLAUDE.md` §6 and the "Shared systems" list.

## Acceptance criteria
- [ ] Config and state: `RunConfig.runModifiers?: RunModifierConfig[]` and, in the stats slice,
      `state.domains.stats.runModifiers: RunModifier[]`, each `{ key, source: { id, label },
      scope: 'party' | 'monsters' | 'all', bundle?: bundle id, potency, flags?: string[],
      rewardBonus?: number, until?: { floor } | { turn } }`. `addRunModifier(state, mod, emit)`
      and `removeRunModifier(state, key, emit)` change it mid-run, emitting `runModifierAdded` /
      `runModifierRemoved` (log text, Codex `seen`). Invariant `stats.runModifiers`.
      `STATE_VERSION` + 1.
- [ ] `BundleSource` `stats.run` (in the stats domain's `bundleSources`, after `stats.statuses`)
      visits each modifier whose scope matches the entity (`party` = party members, `monsters`
      = monster faction), credited to `source.id` with `source.label`, so `getStat` parts read
      "Gloom (Omen, rank 2) −2" and triggers fire through it.
- [ ] Flags: `runFlag(state, flag)` and the run-scope condition `cond.run_flag { flag }`
      (ETH-121) let rules and code read a named switch (`doctrine.seek_stairs`,
      `omen.dry_wells`) without a bundle.
- [ ] Rewards: `rewardMultiplier(state)` = 1 + the sum of `rewardBonus`; `reduceTrackers`
      applies it when it sums `rewards.atRisk` (the order base → ×multiplier → −25% from
      "Rewards" in `docs/ARCHITECTURE.md`). With no modifiers it is exactly 1 (sim compare: no
      behavior change).
- [ ] Meta: `buildRunConfig` turns every owned upgrade's `{ kind: 'bundle', scope: 'run' }` grant
      into a run modifier (source = node id and name), the first consumer of that grant. The
      snapshot's `domains.stats.runModifiers` lists them for a HUD strip and tooltips.
- [ ] Tests: a party-scope and a monster-scope modifier change only their side's stats, with the
      right tooltip part; a modifier added mid-run and one expiring on a floor change; the
      multiplier scales at-risk rewards and the wipe loss follows it; save/load round-trip.

## Notes
Who uses it and how:
- **ETH-067 Omens:** each Omen rank is a modifier (bundle for Gloom / Thriving Dark, a flag or
  config for Dry Wells, `rewardBonus` for the multiplier).
- **ETH-070 blessings:** the patron's blessing is a party-scope modifier with the deity as source.
- **ETH-105 cursed modifiers:** taken mid-run through `addRunModifier` from an encounter outcome
  (ETH-116), with a `rewardBonus`.
- **ETH-107 dungeon events:** a modifier with `until: { floor }` (an eclipse shrinks sight on
  that floor only).
- **ETH-071 doctrine:** the chosen doctrine is a flag modifier; the baseline descend logic reads
  `runFlag`.
- **Tavern veterans** (no item yet): a retired veteran's passive is a party-scope modifier.

Open decisions:
- (default) Modifiers live in the stats domain slice — alternative: a new `modifiers` domain
  (cleaner ownership, but a new root composition line).
- (default) The reward multiplier is additive across sources (1 + Σ bonus) — alternative:
  multiplicative (Π (1 + bonus)), which grows faster at high Omen levels.
- (default) `until: { floor }` ends when the party first leaves that floor — alternative: while
  any member is on it.

## Log
- 2026-11-19: Created in the shared-systems pass (foundation for ETH-067, 070, 071, 105, 107 and Tavern veterans).
- 2026-11-19: (spec gate) awaiting Nate's review of this spec
