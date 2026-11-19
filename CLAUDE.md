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
2. **Loadout:** assign traits and buffs bought in town, plus starting gear from the Smithy.
3. **Rules:** choose a behavior rule set per adventurer, or a party-wide one.
4. **Patron deity:** optional. It grants a blessing and imposes a taboo (§6).
5. **Omens:** toggle difficulty modifiers. The total Omen level is shown as a reward multiplier.
6. **Dungeon:** pick a dungeon variant once more than one is unlocked (depth, floor size, theme).
7. **Contracts:** pick a main quest for each contract slot (one slot to start; the Guild Hall adds more). See §6.
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
| **Trophies** | Kills, weighted by monster difficulty | Smithy (starting gear, enchantments), Bestiary unlocks |
| **Favor** (per deity) | Victories, kept conducts, honoring your patron | Temple / devotion trees; the prestige layer |

The Omen multiplier applies to all three.

**Banked vs. at-risk currency.** Currency earned during a run is tracked separately, as the run's *at-risk* total, and moves into the player's *banked* total only when the run ends. Banked currency is never at risk. On a victory or a retreat the whole at-risk total is banked. On a wipe, **25%** of each currency's at-risk total is lost and the rest is banked. The HUD shows banked and at-risk amounts separately, and the run summary shows the amount lost as its own line.

**Gold** is a fourth, in-run-only currency, spent at dungeon merchants. It is not at-risk currency. When the party leaves the dungeon, leftover gold converts into Trophies; on a wipe all gold is lost.

Numbers should stay readable: use suffixes (1.2k, 3.4M), not scientific notation.

---

## 4. Upgrades between runs: the Town

The town is a set of buildings. Each building has its own upgrade tree, and each building is unlocked by finishing its own small quest (e.g. the Smithy opens once a run brings an anvil back from floor 3).

| Building | Tree contents |
|---|---|
| **Guild Hall** | Class and race unlocks (first random, then selectable, as in Roguathia), party size, roster size |
| **Library** | New rule **conditions** and **actions**, and more rule slots per adventurer |
| **Smithy** | Starting gear kits, starting enchantment, item identification knowledge |
| **Temple** | Deities, blessings, altar frequency in the dungeon |
| **Cartographer** | Floor types, route forks, starting map knowledge, dungeon depth and size |
| **Ossuary** | Heirloom slots, ghost allies, epitaph perks (lineage system) |
| **Tavern** | Retired veterans assigned to jobs; recruit quality |

### Upgrade tree rules
- There are two kinds of tree:
  - **Foundations** are permanent: Guild Hall, Smithy, Cartographer, Temple, Ossuary and Tavern. Switching a pick costs a respec fee.
  - **Tactics** can be redone for free between runs (never during one): the Library, doctrine, and the class Mastery trees.
- **Class Mastery:** each class has one guild-wide Mastery level. Every adventurer of that class earns Mastery XP for it, the fallen included, and each level gives about one point for that class's tree (spell damage, healing, spell unlocks, techniques). Simple classes get fewer, bigger nodes; complex classes get more, smaller ones.
- Nodes branch. At least some tiers are **pick one of two**.
- A numeric upgrade (e.g. +10% HP) shares its tier with an option that unlocks a capability (e.g. a new rule action).
- Show costs, effects and prerequisites in the tooltip. Locked nodes show what they need.

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
- **Contracts** are main quests, picked on the Prepare screen. Types: *Recover the relic* (bottom floor), *Slay a named foe* (a unique on a set floor), *Gather* (N magical items spread over the floors), *Delve* (reach depth N), and later *Rescue* (a lost adventurer or a fallen one's heirloom, §7).
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
- *Cursed Hoard*: more cursed items.
- *Short Leash*: turn limit per floor.

Clearing a run at a high Omen level unlocks new Omens and cosmetics.

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

- **Roster:** named adventurers with level, history (runs, deepest floor, kills) and traits. Survivors come back with XP.
- **Gravestones:** a fallen adventurer leaves a grave on the floor where they died, holding one **heirloom** (their best item). Later runs can find it. Some graves raise a **ghost**, either hostile or an ally if the Ossuary is upgraded. The party can **pay respects** at a grave: read the epitaph, take minor loot from that adventurer's last run, and receive a short boon from the fallen adventurer's patron deity.
- **Retirement:** veterans can retire to a Tavern job for a permanent passive bonus (smith → better starting gear, cartographer → map knowledge, and so on).
- **Descendants:** new recruits can be kin of a fallen adventurer and inherit one trait.
- **Found in the dungeon:** very rarely the party meets a lost adventurer who joins them at a lower level than the party's best, even beyond the party cap. If they survive the run they join the roster permanently, with a line of backstory.
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
- **Design docs:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) is the technical design (layers, shared building blocks, sim API, AI engine). [`docs/VISUAL-DESIGN.md`](docs/VISUAL-DESIGN.md) is the look: tokens, fonts, map glyphs and screen mock-ups. Read the relevant one before starting an item, and update it in the same change when a decision in it changes.
- **Distribution:** packaged as a desktop app with **Tauri** (default; Electron is the fallback if Tauri causes trouble), so it installs and runs with no browser or network. During development, run it with `npm run dev` in a local browser tab.
- **Commands:** `npm run dev` (dev server), `npm run build`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run check` (type-check, lint and test together), and `npm run sim -- --seeds N` (headless seeded runs with a report). Run `npm run check` before calling an item done.
- **Offline only:** no `fetch` to remote hosts, no CDN links, no analytics. Bundle every dependency and font. If a feature seems to need the network, stop and ask the user.
- **Separate the simulation from the UI:**
  - `src/sim/` is pure TypeScript with **no DOM access**, is deterministic with a seeded RNG, and is serializable. That lets it run in a Web Worker, run headless for offline catch-up, and run in tests.
  - The UI reads snapshots and events from the sim and sends commands back. It never mutates sim state directly.
- **Content is data:** classes, races, monsters, items, Omens, deities and upgrade nodes are typed definitions in `src/content/`, validated at load time.
- **Saves:** local only, written to a save file in the app data folder through Tauri (IndexedDB when running in a dev browser tab). Saves are versioned with migrations, with export/import to a file or string and a hard reset. Autosave regularly and on close.
- **Balance harness:** a script that runs N seeded headless runs and reports depth, death causes and currency per hour. Use it to check any balance change. It starts as `npm run sim` (M0: turns and explored share per floor).

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
- **Clean-room.** Roguathia is LGPL-3.0. Do not copy its code, names, lore or text (e.g. no "Selyk"). Using it as a source of ideas is fine.
- Gameplay randomness must use the sim's seeded RNG, never `Math.random()`.
- Every new mechanic needs Codex and tooltip text and a log message.
- Write sim tests for new AI behavior with a fixed seed and a hand-built map.

---

## 10. Roadmap

The milestones are broken down into work items in the backlog (§11).

1. **M0 – Skeleton:** scaffold the project; sim core with one floor, one adventurer, baseline exploration and canvas map; pause and speed controls.
2. **M1 – A full run:** multiple floors, stairs, combat, items, death, run summary, auto-restart; the Recover-relic contract and the return trip; attributes, leveling, monster roles, equipment slots, enchantment and identification.
3. **M2 – Meta layer:** currencies, Town with Guild Hall and Smithy, saves, Codex; more contract types, contract slots, the bounty board; proficiencies and aptitudes, class unlocks, uniques, monster families, elites and mini-bosses, affixes and artifacts, food buffs; highlights feed, run history.
4. **M3 – Behavior rules:** rules editor, Library, presets, AI trace in the log; quest rule conditions, class abilities and class-aware AI roles.
5. **M4 – Risk:** Omens, conducts, reward multiplier; bounty encounters, traps and searching.
6. **M5 – Lineage:** roster, gravestones and grave interactions, heirlooms, retirement, Ossuary and Tavern; the Rescue contract.
7. **M6 – Depth:** deities, altars, floor types, route forks, offline progress, dungeon merchants.
8. **Later:** tileset, more content, achievements, cosmetics, balance passes.

---

## 11. Backlog

Work is tracked as markdown files in `backlog/`. Read [`backlog/README.md`](backlog/README.md)
for the full conventions. In short:

- **Files:** each item is `ETH-###-slug.md` with YAML frontmatter, created from `backlog/_templates/`. Large feature areas get an epic folder containing an `_epic.md`.
- **Next item:** the highest-priority `ready` item in the current milestone whose dependencies are `done`.
- **Status updates:** when starting or finishing an item, update its `status`, its Log and `backlog/INDEX.md` in the same change. `INDEX.md` must always match the item files.
- **Side work:** bugs or tasks found along the way become new `idea` items rather than unplanned changes.
- **Never** reuse IDs, or move or delete finished items.
