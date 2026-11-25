# Ethuathia (working title)

An idle dungeon crawler inspired by Roguathia (seiyria/Roguathia, archived 2020).
A party of adventurers explores a procedurally generated dungeon on its own. The
player shapes how they play, what they bring and how dangerous the dungeon is, and
builds up a town and a roster of adventurers between runs.

> **Status:** M0 in progress. The project scaffold exists; there is no game code yet. Sections marked **(default)** are
> provisional choices. Confirm them with the user before building on them heavily.
>
> **Hard constraint: offline only.** Single-player, runs entirely on the player's
> machine. No server, accounts, telemetry, leaderboards or network calls of any kind,
> and no CDN-hosted assets: fonts, libraries and art are all bundled.

---

## 1. Goals

Roguathia's gaps, and our answers to them:

| Roguathia problem | Ethuathia answer |
|---|---|
| Upgrades are linear +N chains with no choices | Branching upgrade trees with mutually exclusive picks; every numeric upgrade comes with a tradeoff or a new option |
| You only watch; the AI wanders for hours and hoards corpses | **Behavior rules** (if-then rules the player orders) are the main progression system, on top of a competent built-in AI |
| Harder dungeons are a currency sink with no matching reward | **Omens**: opt-in difficulty modifiers that raise the reward multiplier |
| Dead adventurers vanish | **Lineage**: gravestones, heirlooms, retired veterans and descendants |
| No information about classes, races or monsters | A Codex, plus tooltips on everything and a trace showing why the AI did what it did |
| No offline progress | Offline catch-up simulation |

### Design principles
1. **Idle decisions matter.** The player's choices before and during a run change what happens in it. Watching is optional; planning is the game.
2. **Readable.** Every number has a tooltip, every AI action can be explained, and every death has a clear cause in the log.
3. **Risk is a choice.** Never force the player to make the game harder. Offer harder conditions and pay them for it.
4. **Attachment.** Adventurers have names, histories and consequences.
5. **Original content.** Take ideas from Roguathia and NetHack, but use our own names, lore and code (see §9).

---

## 2. Core loop

```
 TOWN (hub) ──► PREPARE ──► DESCEND (auto-run) ──► RUN ENDS ──► REWARDS ──► TOWN
   ▲  spend currencies   party, rules,    adventurers act     death / victory /   currencies,
   │  on upgrade trees   patron, Omens    on their own        retreat             heirlooms, XP
   └──────────────────────────────────────────────────────────────────────────────┘
```

- **Waiting for the player is the default.** When a run ends, the game shows the run summary and waits. The player can spend currencies in town, then press **Descend** on the Prepare screen to start the next run.
- **Auto-restart** is a player toggle (off by default) in Options and on the run summary. When it is on, the next run starts after a short timer with the previous run's Prepare settings. Turning it off again takes effect at the end of the current run.
- Town upgrades can be bought at any time; most take effect at the **next run**.
- **Behavior rules can be edited during a run.** This is the main way to interact mid-run.

### Starting a run (Prepare screen)
1. **Party:** pick 1–4 adventurers from the roster (party size is an upgrade). Empty slots are filled with random recruits from the unlocked classes and races.
2. **Loadout:** assign traits and buffs bought in town, starting gear from the Smithy, and each adventurer's talent build (§4).
3. **Rules:** choose a behavior rule set per adventurer, or a party-wide one.
4. **Patron deity:** optional. It grants a blessing and imposes a taboo (§6).
5. **Omens:** toggle difficulty modifiers. The total Omen level is shown as a reward multiplier.
6. **Dungeon:** pick a dungeon variant once more than one is unlocked (depth, floor size, theme).
7. **Contracts:** pick a main quest for each contract slot (one slot to start; the Guild Hall adds more). A building quest (§4) is one kind of contract. See §6.
8. **Bounties:** accept side quests from the bounty board (§6).

### Ending a run
- **Victory:** complete **every** selected contract (§6), then walk back up and out of the dungeon. Each contract pays its own reward.
- **Retreat:** a rule or a manual command sends the party back up. The party keeps everything earned this run, and every survivor returns to the roster.
- **Wipe:** the whole party dies. Each death leaves a gravestone (§7), and **25%** of the currency earned this run is lost (§3).
- **Run summary screen:** cause of death, conducts kept, currency breakdown with the Omen multiplier, heirlooms dropped, and an epitaph. Its buttons are **Continue** (to town), **Start next run** and **Rematch**, which replays the same seed with the same Prepare settings. Auto-restart always rolls a new seed.

---

## 3. Currencies

Each currency rewards a different playstyle. No currency only buys "make it harder".

| Currency | Earned by | Spent on |
|---|---|---|
| **Renown** | Depth reached (each floor deeper is worth more) and turns survived | Guild Hall (classes, races, party size, rule slots), Library |
| **Trophies** | Kills, weighted by monster difficulty; items and gold carried out of the dungeon | Smithy (starting gear, enchantments), Bestiary unlocks |
| **Favor** (per deity) | Victories, kept conducts, honoring your patron | Temple / devotion trees; the prestige layer |

The Omen multiplier applies to all three as they are earned in the run. Trophies converted on the way out (leftover gold and sold items, below) are not multiplied, so hoarding loot can't inflate an Omen run.

**Banked vs. at-risk currency.** Currency earned during a run is tracked separately, as the run's *at-risk* total, and moves into the player's *banked* total only when the run ends. Banked currency is never at risk. On a victory or a retreat the whole at-risk total is banked. On a wipe, **25%** of each currency's at-risk total is lost and the rest is banked. The HUD shows banked and at-risk amounts separately, and the run summary shows the amount lost as its own line.

**Gold** is a fourth, in-run-only currency, spent at dungeon merchants. It is not at-risk currency. When the party leaves the dungeon, leftover gold converts into Trophies; on a wipe all gold is lost.

**Gear does not carry over.** Equipment found in a run is lost when the run ends; items the party carries out are sold for Trophies. The Smithy's starting kits are the gear progression, and heirlooms (§7) are the one exception.

Numbers should stay readable: use suffixes (1.2k, 3.4M), not scientific notation.

---

## 4. Upgrades between runs: the Town

The town is a set of buildings. Each building has its own upgrade tree, and each building is unlocked by finishing its own small quest.

### Building quests
- A **building quest** is a contract (§6) themed on what it unlocks, and it pays currency like any contract. It takes a contract slot, and only one building quest can be taken per run. Like every contract it lasts one run: failing it means taking it again on a later run.
- Building quests open in a chain, starting with the Smithy, so the player alternates between spending and questing. A new building's quest is offered once a set share of the nodes in the open buildings has been bought (the share is set by the pacing work in ETH-161). Example quests: Smithy, bring an anvil back from floor 3; Library, recover a tome from a named foe; Cartographer, reach floor 6 and return; Temple, pray at an altar; Ossuary, bury the first fallen adventurer; Tavern, an adventurer survives five runs.
- **Building tiers:** each building's tree also opens in tiers. Once **50% of all the building's available nodes** are bought (from any tiers), a harder quest in the same theme unlocks its next tier. Higher tiers hold stronger nodes.
- Classes and races can be unlocked by building trees, by quests or by milestones (§7).

| Building | Tree contents |
|---|---|
| **Guild Hall** | Class and race unlocks (first random, then selectable, as in Roguathia), party size, contract slots and rewards. The roster is a flat 50 adventurers, not an upgrade. |
| **Library** | New rule **conditions** and **actions**, and more rule slots per adventurer |
| **Smithy** | Starting gear kits, starting enchantment, item identification knowledge |
| **Temple** | Deities, blessings, altar frequency in the dungeon |
| **Cartographer** | Floor types, route forks, starting map knowledge, dungeon depth and size |
| **Ossuary** | Heirloom slots, ghost allies, epitaph perks (lineage system) |
| **Tavern** | Retired veterans assigned to jobs; recruit quality |

### Upgrade tree rules
- There are two kinds of tree:
  - **Foundations:** Guild Hall, Smithy, Cartographer, Temple, Ossuary and Tavern.
  - **Tactics:** the Library, doctrine, and the class talent trees.
  - Both can be redone between runs (never during one). There is **no respec fee for now**; Foundations may get one later. Talent trees must always be free to redo.
- Trees are deep (roughly 15–25 nodes per building), with cheap early nodes and costs that grow by tier, so every run can buy something. Some numeric nodes have **ranks** (e.g. Hardy Recruits I–V); capability nodes have one rank.
- Trees are bounded: they can be finished. Adventurer levels and Mastery levels are endless.
- Nodes branch. At least some tiers are **pick one of two**.
- A numeric upgrade (e.g. +10% HP) shares its tier with an option that unlocks a capability (e.g. a new rule action).
- Show costs, effects and prerequisites in the tooltip. Locked nodes show what they need.

### Class Mastery and talents
Adventurer levels reset to 1 every run. The lasting power of a class lives in its **Mastery**.
- **Mastery XP:** each class has one guild-wide Mastery level. Every adventurer of that class adds the XP they earned in the run, the fallen included, plus a run-end bonus that grows with depth reached and challenges completed (contracts, bounties). In one run, the 1st to 4th adventurer of the same class contribute 100% / 75% / 50% / 25%. A temporary companion (§7) contributes 50%. Mastery XP is tracked from M2; the trees arrive in M4.
- **Pacing:** slow. A really solid run that completes all its objectives earns about 5 talent points; a short loss earns little. A class's trees hold about 40 points (whether per tree or across all three is set in M4). Points past the end of the trees go into small repeatable bonuses.
- **Talent points:** each Mastery level gives a point. **Every adventurer of the class gets the full budget** and spends it on their own build, so two adventurers of one class can play differently.
- **Three trees per class**, named to fit the class (e.g. a Vanguard damage tree and a tanking tree). Nodes are class skills and bonuses: a higher starting level, bonus damage, damage mitigation, a new starting weapon, and so on. Some nodes take several points (ranks). Mixing trees is allowed; deeper nodes need points in that tree, and each tree ends in a very valuable **capstone**.
- **Builds:** each adventurer keeps their build between runs. Random recruits get the class's default build; players can save named builds and apply them on the Prepare screen. Rebuilding is free between runs.

---

## 5. The idle player (adventurer AI)

### 5.1 Simulation model
- The game runs in turns, with an energy/speed system: each actor gains energy every tick and acts when it reaches the threshold.
- Each turn, an adventurer:
  1. Updates their perception (field of view, known map, remembered items and monsters).
  2. Checks their **behavior rules** from top to bottom. The first rule whose condition is true *and* whose action is valid right now is executed.
  3. If no rule fires, falls back to the **baseline behavior** (§5.3).
- Record which rule fired and why (the "trace") so the UI can show it.

### 5.2 Behavior rules (the main progression system)
- A rule is **Condition → Action**, optionally scoped to a target (self, ally, enemy, item, tile).
- Example conditions: `HP < X%`, `enemy adjacent`, `enemy stronger than me`, `ally HP < X%`, `inventory full`, `floor explored ≥ X%`, `has unidentified potion`, `standing on altar`, `poisoned`, `outnumbered`, `contract complete`, `bounty target seen`, `carrying relic`.
- Example actions: `quaff best healing`, `retreat toward stairs up`, `attack weakest / strongest / nearest`, `use ranged`, `cast <spell>`, `drop lowest-value item`, `equip best`, `pray`, `head to stairs down`, `regroup with party`, `retreat run`.
- The player starts with a few slots and a small vocabulary; the Library unlocks more of both.
- Ship **presets** ("Cautious", "Greedy", "Speedrunner") so a new player gets reasonable behavior before learning the editor.
- Party-wide **doctrine** settings: formation (stick together / spread out), loot priority, retreat threshold.

### 5.3 Baseline behavior (must be competent with zero rules)
Roguathia's wandering was its biggest complaint, so the baseline must not wander:
- **Exploration:** frontier-based. Path to the nearest reachable unexplored tile using Dijkstra maps, never revisit explored dead ends, and open doors.
- **Leave a floor** once exploration is complete or exploration value runs out, with a turn cap per floor as a safety net.
- **Combat:** fight adjacent enemies, and flee at very low HP when an escape route exists.
- **Inventory:** never pick up corpses or junk by default, auto-equip clear upgrades, and drop the lowest-value item when overloaded.
- **Food:** there is no hunger meter and no starvation. Food is an optional consumable that grants a short-term buff when eaten. Buffs of different effect types stack; eating food with an effect type that's already active refreshes that buff instead of stacking it.
- **Stuck detection:** if position or explore percentage hasn't changed in N turns, change goals and log it.

### 5.4 Manual control
- **Possess** any adventurer to play them directly with full roguelike controls (move, attack, use, pick up, stairs). Releasing them hands control back to the AI.
- Pause, plus speed steps of 1× / 2× / 4× / 8× / max.

### 5.5 Time-away progress
"Offline progress" in this doc means progress made while the game is **closed**. It is
unrelated to the offline-only constraint.
- On load, simulate the time away headlessly at max speed, capped at **8h**, which Tavern upgrades raise.
- If full simulation is too slow, fall back to a statistical estimate from the player's recent run averages, and say so in the summary.
- Show a "While you were away" summary.
- If auto-restart (§2) is off, the time-away simulation finishes only the current run and then stops, the same way the game does while open.

---

## 6. Run modifiers and goals

### Quests
- **Contracts** are main quests, picked on the Prepare screen. Types: *Recover the relic* (bottom floor), *Slay a named foe* (a unique on a set floor), *Gather* (N magical items spread over the floors), *Delve* (reach depth N), *Building quests* that open a town building or its next tier (§4), and later *Rescue* (a lost adventurer or a fallen one's heirloom, §7). Contracts last one run; a failed contract can be taken again on a later run.
- The player starts with one contract slot; the Guild Hall adds more. **Victory needs every selected contract complete, and the party then has to walk back out.** Each contract pays its own reward, so taking more is a risk the player chooses, like an Omen.
- **The return trip:** floors already explored are crossed quickly along known paths, but some monsters respawn, so retreat rules still matter.
- **Bounties** are side quests ("kill 3 trolls", "drink from a fountain"). They come from a bounty board on the Prepare screen and from encounters in the dungeon. A bounty never ends the run and never sends the party home. Its reward joins the run's at-risk total, so a wipe loses 25% of it like any other earnings (§3).
- The baseline AI weighs contract targets heavily and bounty targets lightly; rules can change that (§5.2).

### Elites and mini-bosses
Elite monsters can appear on any floor, with a name prefix and 1–2 traits (e.g. *Venomous*, *Swift*). A mini-boss appears every **3 floors (default)**, often guarding the stairs down. Both drop magic items from a better loot table (more affixes, higher rolls, more enchantment, a chance of an artifact).

### Omens (opt-in difficulty)
Each Omen has ranks, and each rank adds to the reward multiplier. Examples:
- *Gloom*: smaller field of view.
- *Ravenous*: food buffs are weaker and shorter (exact effect set in ETH-053).
- *Thriving Dark*: monsters regenerate.
- *Dry Wells*: no fountains.
- *Elite Spawns*: elite monsters appear more often.
- *Cursed Hoards*: more cursed items, with stronger enchantments.
- *Short Leash*: turn limit per floor.

Omens start locked. Town-tree nodes unlock most of them (each building has a few themed ones, e.g. the Smithy's *Cursed Hoards* and *Armed Warbands*), and clearing a run at a high Omen level unlocks more Omens and cosmetics. A tree node never turns on extra danger by itself and never pays its own risk bonus: all opt-in risk goes through an Omen and its one reward multiplier.

### Conducts
Tracked automatically each run (pacifist, never wore armor, never changed gear, no prayers, and so on). Keeping a conduct grants Favor. Some deities **require** certain conducts as taboos.

### Deities
The patron is chosen before the run. Each deity has:
- A **blessing**: a passive effect.
- A **taboo**: break it and you lose Favor or provoke divine anger.
- A **devotion tree**: the prestige layer.

The dungeon also contains altars: pray at them, sacrifice there, or convert them to your patron.

### Floor variety and routing
Floor types include caves, mines, flooded floors, fortresses, swamps, lava fields, towns and a single big room. At some depths the route **forks**, and the player's rules or a pre-set route preference decide which way to go.

---

## 7. Lineage

- **Roster:** named adventurers with history (runs, deepest floor, peak level, kills), traits, titles and a talent build. Survivors come back with these, but **levels reset to 1** each run (§4, Class Mastery). The dead leave the roster for the graveyard. A future class may resurrect a fallen party member during a run, at a high cost (a reagent bought in town or found in the dungeon).
- **Gravestones:** a fallen adventurer leaves a grave on the floor where they died, holding one **heirloom** (their best item). Later runs can find it. Some graves raise a **ghost**, either hostile or an ally if the Ossuary is upgraded. The party can **pay respects** at a grave: read the epitaph, take minor loot from that adventurer's last run, and receive a short boon from the fallen adventurer's patron deity.
- **Retirement:** veterans can retire to a Tavern job for a permanent passive bonus (smith → better starting gear, cartographer → map knowledge, and so on).
- **Descendants:** new recruits can be kin of a fallen adventurer and inherit one trait.
- **Found in the dungeon:** very rarely the party meets a lost adventurer who joins them for the rest of the run, at a lower level than the party's best, even beyond the party cap. They can be of a class the guild hasn't unlocked yet. They earn 50% Mastery XP for their class, and leave after the run unless their class is unlocked during that run, in which case they join the roster with a line of backstory.
- **Graveyard tab:** a memorial list with epitaphs. It is cosmetic, but it gives the game personality.

---

## 8. UI

A desktop app (§9) with a dark theme. The dungeon uses colored monospace ASCII glyphs; a tileset is a possible later option. It should still be usable at tablet width.

### Layout (in-run)
```
┌──────────────────────────────────────────────────────────────────────┐
│ Renown 12.4k  Trophies 3.1k  Favor 40 │ Floor 7/20 · Turn 4,812 │ ⏸ 1× 2× 4× 8× │
├───────────────┬──────────────────────────────────────┬───────────────┤
│ PARTY         │                                      │ TABS          │
│ ┌───────────┐ │          DUNGEON MAP                 │ Rules         │
│ │@ Mira  Val│ │     (glyph grid, fog of war,         │ Town          │
│ │HP ████░ MP│ │      follow selected / whole floor)  │ Codex         │
│ │→ exploring│ │                                      │ Graveyard     │
│ │  (rule #3)│ │                                      │ Stats         │
│ └───────────┘ │                                      │ Options       │
│  ...          │                                      │               │
├───────────────┴──────────────────────────────────────┴───────────────┤
│ LOG [All][Combat][Loot][Discovery][AI]   Mira quaffs a potion (rule #1: HP<30%) │
└──────────────────────────────────────────────────────────────────────┘
```

- **Party cards** show HP/MP bars, status effects, the current **intent** in plain language, and which rule produced it.
- **Map:** hover a tile to inspect it. Click an adventurer to select and follow them; double-click to possess.
- **Log:** filterable, with color-coded entries. AI log entries explain each decision.
- **Rules editor:** an ordered list of rows (condition dropdown → action dropdown, enable toggle, drag to reorder). A "last fired" indicator and a hit count appear next to each row. Presets can be saved and loaded.
- **Town:** one panel per building, with its upgrade tree drawn as a node graph.
- **Codex:** every class, race, monster, item and Omen, filled in as it is discovered.
- **Run summary** modal and **While you were away** modal.
- **Keyboard:** `Space` pause, `1–5` speed, `P` possess or release, `Q` / `E` or `[` / `]` cycle adventurers (not `Tab`, which moves focus). While possessed, WASD plus Q/E/Z/C (or the numpad) move, so Q/E become diagonals and only `[` / `]` cycle.
- **Codex:** a wide two-pane modal (list and search on the left, the entry on the right). Undiscovered entries show their glyph and a hint; monster entries reveal more at 1, 10 and 50 kills.
- Every number and icon has a tooltip. Respect `prefers-reduced-motion`, and never use color alone to convey meaning.

---

## 9. Tech and architecture

- **Language:** TypeScript (strict). It was chosen because the game is mostly UI (rules editor, upgrade trees, tooltips, log, Codex), which web tech handles best, and the simulation is lightweight turn-based logic that doesn't need a native language.
- **Stack:** Vite, Vitest and **React** (with Zustand stores and CSS Modules). The map renders to `<canvas>`.
- **Design docs:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) is the technical design (layers, shared building blocks, sim API, AI engine). [`docs/VISUAL-DESIGN.md`](docs/VISUAL-DESIGN.md) is the look: tokens, fonts, map glyphs and screen mock-ups. [`docs/DIFFICULTY_PHILOSOPHY.md`](docs/DIFFICULTY_PHILOSOPHY.md) is the difficulty, balancing and extensible danger-scaling guide. Read the relevant one before starting an item, and update it in the same change when a decision in it changes.
- **Distribution:** packaged as a desktop app with **Tauri** (default; Electron is the fallback if Tauri causes trouble), so it installs and runs with no browser or network. During development, run it with `npm run dev` in a local browser tab.
- **Commands:** `npm run dev` (dev server), `npm run build`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run check` (type-check, lint and test together), and `npm run sim -- --seeds N` (headless seeded runs with a report). Run `npm run check` before calling an item done.
- **Offline only:** no `fetch` to remote hosts, no CDN links, no analytics. Bundle every dependency and font. If a feature seems to need the network, stop and ask the user.
- **Separate the simulation from the UI:**
  - `src/sim/` is pure TypeScript with **no DOM access**, is deterministic with a seeded RNG, and is serializable. That lets it run in a Web Worker, run headless for offline catch-up, and run in tests.
  - The UI reads snapshots and events from the sim and sends commands back. It never mutates sim state directly.
- **Content is data:** classes, races, monsters, items, Omens, deities and upgrade nodes are typed definitions in `src/content/`, validated at load time.
- **Saves:** local only, written to a save file in the app data folder through Tauri (IndexedDB when running in a dev browser tab). Saves are versioned with migrations, with export/import to a file or string and a hard reset. Autosave regularly and on close.
- **Balance harness:** a script that runs N seeded headless runs and reports depth, death causes and currency per hour. Use it to check any balance change. It starts as `npm run sim` (M0: turns and explored share per floor). Which changes need it, and how many seeds (T0 identity 20, T1 direction 50, T2 gate 100, T3 acceptance 200), is set in `docs/DIFFICULTY_PHILOSOPHY.md` §9. UI-only, docs and test-only changes don't run it. A work item inside a milestone runs only the T0 identity check (with its new content unowned or switched off) and a short smoke run with it on; the milestone's balance capstone does the measuring (T2/T3).

### Proposed layout
```
src/
  core/       seeded RNG, Grid, Registry, ids, number formatting (no dependencies)
  content/    data definitions (classes, races, monsters, items, omens, deities, upgrades)
  sim/        core loop, entities, combat, FOV, pathing, AI (rules + baseline), dungeon gen
  meta/       currencies, town/upgrade trees, roster/lineage, save/load, offline progress
  platform/   storage and window adapters (Tauri, browser, in-memory for tests)
  ui/         React components, canvas map renderer, input
tools/        balance harness, content validation
test/
```
Imports only point downward in this list: `core` imports nothing, `ui` may import everything.
`core`, `content`, `sim` and `meta` compile without DOM types.

### Conventions
- **Formatting:** prettier is not used; there is no config and no `format` script, so never run `npx prettier --write` (it reformats whole files). Follow the existing style of the file you edit; ESLint (`npm run lint`) is the gate. Line endings are pinned to LF by `.gitattributes`.
- **File size and refactoring:** keep files small and single-purpose; look hard at ~400 lines, split at ~600 unless there's a stated reason not to. Refactor only on green, after tests pass, in its own commit. See `docs/ARCHITECTURE.md` §10.1.
- **Clean-room.** Roguathia is LGPL-3.0. Do not copy its code, names, lore or text (e.g. no "Selyk"). Using it as a source of ideas is fine.
- Gameplay randomness must use the sim's seeded RNG, never `Math.random()`.
- Every new mechanic needs Codex and tooltip text and a log message.
- Write sim tests for new AI behavior with a fixed seed and a hand-built map.
- **Clean up worktrees after merging.** Every agent worktree holds its own `node_modules` (~160 MB). Once a work item's PR is merged (or the item is approved and closed), remove its worktree in the same session: `git worktree remove --force <path>`, then `git worktree prune`. Before removing, check that the worktree is clean and its commits are on the remote. If a worktree's `node_modules` is a junction or symlink to another checkout, delete the link first (`cmd /c rmdir <path>\node_modules`), or the removal deletes the target's files. Keep only the worktrees of items still in progress.
- **Rust builds are ad hoc.** `npm run check` doesn't build the Tauri shell, and it isn't a normal gate. Run `cargo test --manifest-path src-tauri/Cargo.toml` only when a change touches `src-tauri/`, with `CARGO_TARGET_DIR` set to a scratch folder, and delete that folder once the result is in (a build is about 3 GB). Build installers (`npm run tauri build`) only when asked.
- Extend the cross-domain contract and property guards (`docs/ARCHITECTURE.md` §11.6) whenever adding new critical services (hidden-state AI rules, secret-bearing events, `Effect` kinds, Codex entries, `ItemPropertyKind`s, or `{ min?, max? }` range configs).

---

## 10. Roadmap

The milestones are broken down into work items in the backlog (§11). Every milestone, and every major content addition, ends with a balance check item (`docs/DIFFICULTY_PHILOSOPHY.md` §9.1).

1. **M0 – Skeleton:** scaffold the project; sim core with one floor, one adventurer, baseline exploration and canvas map; pause and speed controls.
2. **M1 – A full run:** multiple floors, stairs, combat, items, death, run summary, auto-restart; the Recover-relic contract and the return trip; attributes, leveling, monster roles, equipment slots, enchantment and identification.
3. **M1.5 – Living Dungeon & Balance:** extensible Danger scale and hidden variable dungeon depth, expanded starter bestiary and templates across Danger bands, threat-budget room encounters with group engagement and corridor patrols, return-trip deep surge, and the systemic balance pass (`ETH-080`, see `docs/DIFFICULTY_PHILOSOPHY.md`).
4. **M1.6 – Review follow-ups:** fixes found while reviewing merged items. Identification secrecy and curse safety for the idle player (`ETH-142`), a content check that every discoverable def can appear in a run (`ETH-143`), and per-monster Codex kill tiers (`ETH-144`).
From M2 on, each milestone is one theme, so a milestone delivers one capability the player can feel. Work is ordered by that capability, not by which epic it touches. (The shared foundations, such as the objective engine, run-wide modifiers, monster templates, the chronicle and the Codex, were built early and are already done.)

5. **M2 – Meta loop:** a run's earnings buy choices in town that change the next run. deeper Guild Hall and Smithy trees with ranked nodes, Foundations vs. Tactics, a starter set of classes and races to unlock, building and building-tier quests, gold and carried items to Trophies, persistent adventurer records, Class Mastery XP tracking, desktop packaging with file saves; economy pacing capstone. Its remaining work runs in two stages before the capstone:
   - **M2.1 – Town trees:** the Guild Hall and Smithy trees (Tiers I–II) from the approved town-tree page, including the nodes that need new mechanics.
   - **M2.2 – Minimal Omens:** Omen ranks, the one reward multiplier and the Prepare toggle, plus the first four Omens that the Guild Hall and Smithy unlock. The rest of the Omens and conducts stay in M6.
6. **M3 – Behavior rules and AI:** the rules editor, Library, presets, doctrines (clear vs. stairs, formation), smarter baseline escapes; rules balance capstone.
7. **M4 – Classes and roles:** proficiencies and aptitudes, signature abilities, class-aware AI roles, the talent tree engine (three trees per class, per-adventurer builds), a resurrection class; composition balance capstone.
8. **M5 – Foes and loot:** uniques, monster families, elites and mini-bosses, sleeping monsters, affixes and artifacts, more enchantments, food buffs, gear score, identify polish, party-scaled return surge; danger and loot capstone.
9. **M6 – Quests and risk:** everything the player opts into on the Prepare screen: more contract types and contract slots, the bounty board and bounty encounters, dungeon encounters, Omens, conducts and the reward multiplier, traps; risk/reward capstone.
10. **M7 – Lineage:** roster and graveyard, gravestones and heirlooms, retirement and the Tavern, allied creatures and ghosts, descendants, dungeon recruits, the Rescue contract; campaign capstone.
11. **M8 – Gods and world:** deities and altars, grave boons, themed dungeons, merchants, vaults, floor events, time-away catch-up; capstone.
12. **Later:** tileset, more content, achievements, cosmetics, pets, balance passes.

---

## 11. Backlog

Work is tracked as markdown files in `backlog/`. Read [`backlog/README.md`](backlog/README.md)
for the full conventions. In short:

- **Files:** each item is `ETH-###-slug.md` with YAML frontmatter, created from `backlog/_templates/`. Large feature areas get an epic folder containing an `_epic.md`.
- **Next item:** the highest-priority `ready` item in the current milestone whose dependencies are `done`.
- **Status updates:** when starting or finishing an item, update its `status`, its Log and `backlog/INDEX.md` in the same change. `INDEX.md` must always match the item files.
- **Side work:** bugs or tasks found along the way become new `idea` items rather than unplanned changes.
- **Never** reuse IDs, or move or delete finished items.
