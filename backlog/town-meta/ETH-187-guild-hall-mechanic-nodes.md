---
id: ETH-187
title: Guild Hall nodes that need new mechanics - Field Rations, Extraction Drills, Waymark Lanterns, Mystery Crate
type: feature
status: done
priority: P1
milestone: M2.1
epic: town-meta
size: M
depends_on: [ETH-132, ETH-176, ETH-148]
created: 2026-11-24
updated: 2026-11-25
---

## Summary
Build the four Guild Hall nodes from town trees v4 that need something the sim doesn't do yet, and turn their rows into the pick-one choices the page shows.

| Node | Effect | Row |
|---|---|---|
| Field Rations I–III | Each adventurer starts the run with +1 field ration per rank. Eating one applies Regenerating (1 HP a turn) for 10 turns; another refreshes it | Tier I row 2 |
| Extraction Drills I–III | +10% movement speed per rank while fleeing | Tier I row 3, pick with Contract Board |
| Waymark Lanterns | +2 sight and +10% speed during the return trip | Tier II row 5, pick with Guild Chronicles |
| Quartermaster's Mystery Crate | Opt-in on Prepare: one random unidentified curiosity in the pack each run (a blessed potion, a rare scroll, a ring… or a cursed dud) | Tier II row 6 |

## Why
Nate (2026-11-24) asked that Field Rations and Extraction Drills fit real mechanics: the sim has no out-of-combat regeneration, and fleeing is an HP threshold (`src/sim/combat/fleeConfig.ts`), not a roll.

## Acceptance criteria
- [x] A field ration food item (category `food`, applies `status.regenerating` for 10 turns) that the baseline AI eats when hurt and out of combat; Field Rations adds it to every starting kit (a kit item, never sold).
- [x] Extraction Drills raises speed only while an adventurer is fleeing (a conditional modifier the stat tooltip names); a fixed-seed test shows a fleeing adventurer outpacing the same foe.
- [x] Waymark Lanterns applies only on the return trip, as a run-wide modifier scoped to it (ETH-115).
- [x] The Mystery Crate is an opt-in toggle on Prepare once bought; its roll uses the run's seeded RNG and draws from a validated table that includes cursed items.
- [x] Contract Board / Extraction Drills and Guild Chronicles / Waymark Lanterns become pick-one pairs (a save that owned the ETH-132 single node keeps it).
- [x] Codex, tooltip and log text for each. Balance: the T0 identity check and one 20-seed all-on smoke run (Nate dropped the T1/T2 sweeps from milestone pieces; the M2 capstone ETH-161 measures).

## Notes
- Extraction Drills may need a nerf (Nate); ETH-161 watches it.
- Planning gate: refine against the real food, flee and kit code before starting.

## Refined plan (planning gate, 2026-11-24, against main at 6ff558b)

### Layout (`src/content/town/guildHall.ts`)
Free cells: Field Rations = tier 2 col 2; Extraction Drills = tier 3 col 1; Waymark Lanterns = tier 5 col 1; Mystery Crate = tier 6 col 2.
Pick-one: add `exclusiveGroup: 'guild_hall.row3'` to Contract Board and Drills, and `'guild_hall.row5'` to Guild Chronicles and Waymark.
Adding a group to an existing node changes no stored data, so a save that owns Contract Board or Chronicles keeps it and the partner shows `excluded`. No save migration, no SAVE_VERSION bump. Test it with a profile that owns the old node.
Tier I/II: Rations and Drills are rows 2 and 3 (open); Waymark and Crate are rows 5 and 6 (behind the Long Muster gate).

### Spec conflicts and resolutions
1. **Ranked nodes can't carry a `start` grant** (`checkUpgradeTrees`). Field Rations is ranked, so it can't reuse the stock perk directly. Resolution: a new capacity `fieldRations` (+1 per rank) in `CAPACITY_INFO`; `upgradeStartConfig` adds one `startStock` entry `{ item: ITEM_FIELD_RATION, qty: capacity(profile,'fieldRations',0), each: true }` when above 0. `giveStock` already handles `each`, the kit mark (never sold) and stack splitting, so no change to the sim's kit code.
2. **No conditional modifiers exist.** `Modifier` has only stat/op/value; "while fleeing" and "on the return trip" need a gate. Resolution: add optional `when: 'fleeing' | 'returning'` to the **run modifier** (`RunModifierConfig`, `SOURCE_RUN` in `runModifiers.ts`), not to every `Modifier`. `SOURCE_RUN.visit` skips a modifier whose gate is false for that entity: `fleeing` is `entity.ai?.memory.fleeing != null`; `returning` is `state.domains.run.leaving !== null` (the same test as `headingOut`, read from state so stats keeps no import of floors). Both gates show in the stat tooltip because the label is the source label ("Extraction Drills, while fleeing"). A `bundle` upgrade grant with scope `run` gains an optional `when`, which `upgradeRunModifiers` copies into each per-rank `RunModifierConfig`. Validate: `when` only on a run-scope grant, and `runModifierProblems` checks the value. Ranked nodes may keep bundle grants, so Drills stays ranked.
3. **"+10% speed per rank"**: use `{ stat: 'speed', op: 'add', value: 10 }` per rank. Speed is an energy gain with a base of 100, so +10 is exactly +10% per rank and ranks sum linearly (a `mul` would compound to x1.331). The grant text reads "+10 speed" (add shown as such); the tooltip says "+10% movement speed". Waymark: `sight add 2` and `speed add 10`, `when: 'returning'`, scope party, one rank.
4. **Contract Board / Second Contract Board.** `upgrade.second_contract_board` (row 6) `requires` Contract Board. With Drills in the same pick-one as the Board, a player who picks Drills can never buy the Second Contract Board, which silently kills row 6's pick-one. See open question 1.
5. **Baseline AI never eats.** Food exists (`category: 'food'`, the Trail biscuit heals 2) but nothing in `BASELINE_RULES` uses it, and `bestHealing` only reads potions. New rules needed (below).
6. **"Seeded RNG" for the Crate.** Drawing from `state.rng.loot` would shift the loot of every later floor when the toggle is on, which muddies the on/off comparison. Resolution: roll from a stream derived from the run seed (like `textRng`), not one of the four `RNG_STREAMS`. Same seed and same toggle give the same crate; every dungeon stays identical on and off.

### Node 1: Field Rations I-III
- Content: `ITEM_FIELD_RATION` in `items.ts` (`item.field_ration`, category `food`, stack 10, weight 1, value 4, no `loot` so it never spawns: it is kit only; bundle `effects: [{ kind: 'applyStatus', status: 'status.regenerating', turns: 10 }]`). `STATUS_REGENERATING` exists (1 HP at turn start, `stacking: 'refresh'`), and refresh keeps the longer duration, which gives "another refreshes it". Check `tools/content-reachability.ts` treats a def that only a `stock` perk issues as reachable (add it as a source if not).
- Node `UPGRADE_FIELD_RATIONS`: tier 2 col 2, `ranks: { max: 3, costGrowth: 1.6 }`, Renown, cost near 60 (Contract Bounty is 80, Hardy Recruits 40; ETH-161 retunes), grant `capacity fieldRations +1`.
- AI (the real work), in `src/sim/items/rules.ts` and `BASELINE_RULES`:
  - Condition `cond.hurt_calm` ("Hurt and calm", param `percent`, default 70): HP below percent and `visibleThreats` empty. (`cond.safe_to_test` is the nearest existing one: it also needs a scroll and reachable stairs, so don't reuse it.)
  - Action `act.eat_ration` ("Eat a ration"): picks the first pack entry with `category === 'food'` whose bundle effects include a regeneration or heal; returns `{ request: { id: 'use', index } }`; null if none or the status is already running with at least 5 turns left (so it isn't wasted on refresh).
  - Baseline rule placed after `ITEMS_BASELINE_URGENT` and `cond.fleeing`/combat, before the explore errands (just after the fountain rule): `cond.hurt_calm` then `act.eat_ration`. It never fires in combat, so fleeing is untouched.
  - Decision for the Trail biscuit: leave it alone in this item (it heals 2 outright; eating it is a balance change nobody asked for). Note as a side idea.
- Text: item description and hint, a Codex entry comes free from the def; log line comes from the existing `itemUsed` text; the trace detail reads "eating a field ration (HP 45%, no threat in sight)".
- Tests: stock perk through `buildRunConfig` (ranks 1..3 give 1..3 rations each, never sold on exit via `itemSale`); fixed-seed hand-built map where a hurt hero with no threat eats and gains regeneration, and does not eat while a threat is in sight or at full HP; second ration refreshes rather than stacking.

### Node 2: Extraction Drills I-III
- Node `UPGRADE_EXTRACTION_DRILLS`: tier 3 col 1, ranks 3 (growth 1.5), Renown ~220 (Contract Board is 250), group `guild_hall.row3`, requires nothing (Contract Board requires Second Berth; this does not, see open question 1). Grant `{ kind: 'bundle', scope: 'run', when: 'fleeing', bundle: { modifiers: [{ stat: 'speed', op: 'add', value: 10 }] } }`.
- Why a run grant and not a party grant: `partyBundles` attach to the entity with no gate. Run modifiers already stack per rank and credit the node in tooltips.
- The gate reads `memory.fleeing`, which `act.flee` sets and `FLEE_RELEASE_PERCENT`/calm turns clear, so the bonus ends exactly when fleeing does. Allies outside the roster (scope party) have no `fleeing` memory shape: guard for `ai === undefined`.
- Hot path: `statValue('speed')` runs every tick for every actor; the gate is one null check per run modifier, so no cost when none are owned.
- Tests: a fixed-seed hand-built corridor, hero at low HP vs a speed-100 monster, with and without the node at rank 3: the gap grows only with it (steps between hero and foe after N turns); speed stat is 100 at full HP and 130 while fleeing, and the `getStat` parts name "Extraction Drills" and the condition; the bonus is gone once fleeing ends.

### Node 3: Waymark Lanterns
- Node `UPGRADE_WAYMARK_LANTERNS`: tier 5 col 1, one rank, Renown ~700 (Chronicles is 250 for rank 1; row 6 is 1200), group `guild_hall.row5`. Grant: bundle, scope `run`, `when: 'returning'`, modifiers `sight add 2` and `speed add 10`.
- `returning` is `run.leaving !== null`, which covers victory walk-outs and retreats alike (the "return trip" in the spec). It is on from the turn the party turns back, so the deep surge (ETH-157) is the thing it offsets.
- Tests: no bonus on the descent; sight and speed bonus the turn after `turnedBack`; run modifier tooltip text; a retreat gets it too.

### Node 4: Quartermaster's Mystery Crate (and the reusable opt-in toggle)
- Node `UPGRADE_MYSTERY_CRATE`: tier 6 col 2, one rank, Renown ~900, `optIn: true` (new flag, below), grant `{ kind: 'start', start: { perk: 'crate' } }`. A new `StartPerk` variant (`startPerkSchema`, `START_PERK_INFO`/`describeStartPerk` text), copied into `RunConfig.startCrate: true` by `upgradeStartConfig`.
- Table: new `src/content/crate.ts`, `CRATE_TABLE` of `{ item, weight, blessing?, enchant?, enchantments? }` entries, validated at load (every item exists, a cursed entry exists, weights above 0, gear entries have a valid enchant range). Roughly: blessed mending draught, blessed scroll of identify, scroll of renewal, a +1 copper band, +1 owl-eye ring, and the duds: a cursed garnet signet (-1), a cursed pendant, a cursed quickstep tonic. Weights set so about 25% are duds. Everything starts `identified: false` (ETH-142, so a dud can't be told from a gift on sight). Exposes the table to the Codex and to `tools/content-reachability.ts` (add a source).
- Sim: in `createRun`, after `giveStock`, `if (config.startCrate) giveCrate(state, entity)` on the first party member, rolling from a seed-derived stream (`Rng.seeded(seed, 'crate')`; `core` Rng already supports named streams as `PREPARE_STREAM` does). Item is marked kit (`prop.kit`) so it is never sold (no profit from a crate, and the dud can't be exploited); open question 3.
- Log: a run-start line "The Quartermaster's crate is in <name>'s pack." (never names the contents). Codex: the node entry says "contents are hidden until identified; some are cursed".
- Tests: table validation (rejects an unknown item or no cursed entry); same seed same crate, different seed varies; every entry creates a valid instance (invariants pass); dud and gift both unidentified; never sold; off means no extra item and identical state hash to a no-node run.

### The reusable Prepare opt-in toggle (ETH-188 builds on this)
There is no "toggle an owned node" mechanism today: every owned node's grants apply unconditionally in `buildRunConfig`. Build it generically:
1. **Content flag** `optIn?: true` on `UpgradeNodeDef` (schema + `UpgradeNodeDef` + a `checkUpgradeTrees` rule: an opt-in node may only have `bundle` and `start` grants, never `capacity`/`unlock`, because capacities are read by sections from the whole profile). Optional `optInLabel` is not needed: the node name and `describeGrant` text are the Prepare row.
2. **Prepare section** `src/meta/prepare/optIns.ts`, key `optIns` in `RUN_CHOICES`: choice `{ readonly enabled: readonly string[] }` (upgrade ids), schema `z.object({ enabled: z.array(idSchema('upgrade')) })`, `init: () => ({ enabled: [] })` (off by default: "risk is a choice"; existing saves get the default for free, per the prepare slice). `apply` is a no-op beyond dropping ids the profile no longer owns. Export `optInNodes(profile)` (owned nodes with `optIn`), `isOptInOn(profile, choices, id)`.
3. **One filter in `buildRunConfig`**: `const active = withOptIns(profile, choices.optIns)` returns the profile with owned opt-in nodes that are not enabled removed from `upgrades.owned`; `upgradePartyBundles`, `upgradeRunModifiers`, `upgradeBonusModifiers` and `upgradeStartConfig` read `active`, while sections keep reading the real profile. Anything new an opt-in node grants then needs no further code. ETH-188's Field Salvage Kit just sets `optIn: true` on its node and its `start`/`bundle` grant.
4. **UI**: a Prepare panel `src/ui/prepare/panels/optIns.ts` + `components/OptInsPanel.tsx` (checkbox per owned opt-in node: name via `Explain`, effect text via `describeGrant`, a risk note when the node's tags include `risky`; the panel renders nothing while no opt-in node is owned). `update('optIns', { enabled })` like the other panels.
5. **Headless harness** (`tools/headless/config.ts`) calls `upgradeStartConfig(profile)` and the bundle helpers directly. Give it the same `withOptIns` filter; `--opt-ins on|off` (default `on`, so `--upgrades` of an opt-in node behaves as owned-and-enabled, which is what a T2 "all on" run needs).
6. Tests: a section round-trip and default; owned-but-off adds nothing to the config; on adds it; a disowned id in the saved choice is dropped; the schema rejects a capacity grant on an opt-in node.

### T2 approach (100 seeds, paired, all four on vs off)
- Needs the harness: `--upgrades` currently attaches a node once, so add rank syntax (`upgrade.field_rations*3`, `upgrade.extraction_drills*3`; falls back to direct attach like today, since Tier II rows and the pick-one groups need no purchase check there).
- Run on committed code, same 100 seeds, paired: base `npm run sim -- --seeds 100 --preset fresh --json base.json`, then the same with `--upgrades upgrade.field_rations*3,upgrade.extraction_drills*3,upgrade.waymark_lanterns,upgrade.mystery_crate --opt-ins on --baseline base.json` (Waymark and Drills sit in a pick-one group with nodes the run does not own, which is fine). Repeat at `--party 1` and `--party 4 --preset progressed` since party size changes flee and heal use. Also each node alone at T1 (50 seeds) so any shift can be attributed. Report victory/retreat/wipe split, return-trip deaths (Waymark), flee-related deaths (Drills), mean level and HP at end, plus crate duds that were worn (curse deaths). Pass condition: every delta explained, no new stalls or stuck runs. Record commit hashes in the Log. Expect Rations to move wipes the most (it is free sustained healing), and Drills to need the nerf Nate predicted.
- A T0 identity check (20 seeds) with the section defaults and no nodes owned proves the plumbing is neutral: the new `optIns` section must not draw from the prepare RNG or change any hash.

### Files touched (estimate)
Content: `town/guildHall.ts`, `items.ts`, `upgrades.ts` (capacity, `optIn`, grant `when`), `startPerks.ts`, new `crate.ts`, `index.ts`. Sim: `runModifiers.ts` (`when`), `createRun.ts` + `items/kit.ts` (`giveCrate`), `items/rules.ts`, `ai/engine.ts` (baseline rule), `state.ts` (`RunConfig.startCrate`). Meta: `prepare/optIns.ts`, `prepare/index.ts`, `prepare/build.ts`, `prepare/startPerks.ts`, `grantText.ts`. UI: Prepare panel and component, Codex (item, status text free; node text from grants), log text for the crate line. Tools: harness `config.ts`/`args.ts`, reachability. Tests: new `test/sim/guildHallMechanics.test.ts`, `test/meta/optIns.test.ts`, extend `guildHall.test.ts`. Docs: ARCHITECTURE.md (run modifier gates, opt-in section), DIFFICULTY_PHILOSOPHY.md only if a lever is retuned.

### Size and split
M is optimistic: this is about two M items of work. Recommend splitting the implementation PR into two commits on one branch (or two PRs if Nate prefers small ones): (a) gates and nodes 2 and 3 plus the pick-one pairs (small, mostly run-modifier `when`); (b) Field Rations with the baseline eating rule; (c) the opt-in toggle and Mystery Crate (ETH-188 depends on this part, so land it first or as its own PR). If ETH-188 needs the toggle sooner, ship (c) first as a tiny "opt-in mechanism" PR with a test fixture node and the crate on top.

### Open questions
1. Second Contract Board requires Contract Board, which now competes with Drills. Change its `requires` to Second Berth (so row 6 stays a real pick-one whatever row 3 chose), or accept that taking Drills forfeits it?
2. Is "return trip" `run.leaving !== null` (retreat and victory walk-out, from the turn the party turns back) correct for Waymark, or only the victory trip?
3. Should the Crate's item be marked kit (never sold), or sellable (a gift is a bonus, a dud is worth little)?
4. Crate default off on Prepare, and auto-restart keeps the last choice: OK? (The choice persists in the prepare slice like the others.)
5. Rations: eat threshold 70% HP, calm only, skip when at least 5 turns of regeneration remain. Fine, or should the Trail biscuit join the same rule?
6. Cost numbers above are placeholders for ETH-161.

## Log
- 2026-11-24: Split out of ETH-132 when town trees v4 was approved.
- 2026-11-24: Planning gate done (refined plan above); status stays `idea` until approved.
- 2026-11-25: Approved and built. Opt-in mechanism first (`1884e93`, shared with ETH-188), then the four nodes (`bbcd051`). Decisions: Second Contract Board no longer requires the Contract Board; Waymark covers any turn-back; the crate item is kit and never sold; the crate rolls from a seed-derived stream so dungeons are identical with it on or off; only rations use the eat rule (the Trail biscuit waits for M5). Added a shared "issued at run start" notion (`src/content/issued.ts`) that the reachability check reads, for class kits, upgrade stock and capacity-issued items, and the crate table. Kit items may now be food.
- 2026-11-25: Balance (policy: milestone pieces run T0 and a smoke run only; ETH-161 measures). At `bbcd051`: T0, 20 seeds, nothing owned, against origin/main: every one of the 36 report metrics is identical, but 5 of 20 end-state hashes differ (seeds 2, 3, 15, 18, 19). Seed 2 diffed checkpoint by checkpoint: the states are byte-identical until the end, where the last intent records the baseline rule ordinal of `act.retreat_run` (9 became 10) because the new recovery rule sits above it. So the hash difference is a rule index shift, not behavior. Smoke, 20 seeds, fresh solo, all four nodes on: no crashes or invariant failures, 12 reached the bottom, 1 hit the turn cap (seed 17). Unplanned extra data (100 seeds all on against off, fresh solo, not a gate): wins 18 to 36, wipes 82 to 61, 3 turn-cap runs (seeds 17, 66, 86) against 0. The cap runs are a flee loop that Extraction Drills expose: a fleeing hero escapes a ranged spitter, never recovers HP (no out-of-combat regeneration), calms down, walks back toward the contract item past the spitter and flees again, for thousands of turns. Rations were the biggest win-rate lever. ETH-161 should watch both.
