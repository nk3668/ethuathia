# Ethuathia difficulty and balancing philosophy

The living design and tuning guide for difficulty, danger progression, bestiary growth, and run economy in Ethuathia (see [`../CLAUDE.md`](../CLAUDE.md) and [`ARCHITECTURE.md`](ARCHITECTURE.md)). Consult this document whenever adding monsters, templates, items, classes, town upgrades, Omens, or new dungeons, and when running balance passes such as `ETH-080`.

---

## 1. Core principles

1. **No level-scaling or party-size rubber-banding.** Monsters never scale up to match adventurer levels or party size. Stronger creatures live on deeper floors and inside harder dungeons. Unlocking a second berth, buying Smithy gear, or drafting a balanced party must make earlier content genuinely easier, pushing players toward higher Omen levels, additional contracts, and deeper dungeons instead of punishing progression (`CLAUDE.md` §1, Principle 3).
2. **Loss early; mastery raises the ceiling.** A fresh company with zero upgrades should expect to lose most attempts on a starter delve. Survival and victory come from town meta-progression, party composition, gear upgrades, and behavior rules that match the threats ahead.
3. **Attrition and tactics over one-shot spikes.** Combat should wear down HP, healing potions, fountain draughts, and positioning across an entire floor rather than deciding runs on a single coin-flip blow. Every combat death should be readable in hindsight (`CLAUDE.md` §1, Principle 2).
4. **Readable danger.** Out-of-depth spawns, templated/elite variants, return-trip surges, and killer identities are surfaced clearly in the log, highlights, Codex, and tooltips. Never balance through hidden luck values or silent scaling (`ROGUELIKE-SURVEY.md`).
5. **Extensible as pure data.** Adding a new monster, template, encounter pattern, or themed dungeon must be a data entry in `src/content/`, not a rewrite of spawning or difficulty logic (`ARCHITECTURE.md`).

---

## 2. Target difficulty and win-rate bands

Targets are measured with the headless balance harness (`npm run sim -- --seeds 100`) on a fresh or configured profile:

### Starter dungeon (*The Old Delve*, hidden 6–10 floors)

- **Fresh profile (solo Level 1 Vanguard, 0 upgrades):**
  - **Victory rate:** **~15–25%** (target **~20%**). Wins come mostly from shorter rolled depths, favorable gear/fountain drops, or smart retreat/healing rules; deeper rolls and the return trip claim most early runs.
  - **Onboarding floor reach:** **>85–90%** reach **Floor 3+** so early runs consistently earn Renown/Trophies and unlock early milestones (such as the Smithy at depth 3) without feeling brick-walled at the entrance.
- **Progressed profile (unlocked berths, early Guild Hall / Smithy upgrades):**
  - **Victory rate:** **~45–60%** (target **~50%**), varying meaningfully with **party composition** and **behavior rules**. A naive, corridor-bottlenecked mono-melee stack should sit closer to **~35–40%**, while a well-composed party (frontline + ranged/support + tailored rules) should climb past **~55–65%**.
- **Return-trip lethality:** **~15–25%** of relic-bearing runs wipe on the climb back out, making post-objective retreat rules matter rather than turning the ascent into a victory lap.

### Later dungeons and opt-in escalation

- **Themed dungeons (Cartographer / M6+):** Each new dungeon shifts its starting Danger curve upward (for example, starting at Danger 3+ or Danger 6+) and swaps in harsher monster tags and denser encounter budgets. Late dungeons remain dangerous to upgraded 4-person parties while *The Old Delve* naturally becomes a reliable training ground for fresh recruits or heirloom recovery.
- **Opt-in risk:** Once a player reliably clears a dungeon above ~65%, **Omens** (`ETH-067`) and **extra Contract slots** (`ETH-028`) raise difficulty voluntarily in exchange for higher reward multipliers and payouts.

---

## 3. Extensible tier and danger architecture

Hardcoding monster lists or tying monsters permanently to floors `1–10` of a single dungeon breaks as soon as a second dungeon is added. Difficulty is built on an **open-ended numeric Danger scale** shared by the bestiary, encounter generator, and dungeon variants.

### 3.1 Decouple monster Danger from raw floor numbers

- Avoid closed difficulty enums (`easy` / `medium` / `hard`) and avoid assuming "depth 1 = weakest possible monster everywhere."
- Define every `MonsterDef` over an open-ended **Danger** band (`danger: { min, peak?, max }` — extending seamlessly from `1` through `10`, `15`, `20+`) plus **family/ecology tags** (`beast`, `small_folk`, `undead`, `fungus`, `construct`, `aquatic`, etc.).
- Existing `depth: { min, max }` on `MonsterDef` (`src/content/monsters.ts`) serves as the Danger-1-per-floor baseline in *The Old Delve* and should evolve into (or map cleanly onto) this Danger band before adding multi-dungeon variants.

### 3.2 Dungeon difficulty profiles as data (`DungeonDef`)

Each `DungeonDef` (`src/content/dungeons.ts`) should describe its difficulty curve and ecology as data:

- **Variable depth:** `depth: { min, max }` (e.g., `6–10` for *The Old Delve*, `10–15`+ for harder dungeons).
- **Danger curve:** Maps floor number `d` to effective floor Danger `D`, e.g. `danger: { start, perFloor }` (for *The Old Delve*, `start: 1, perFloor: 1`; for a deeper/harder dungeon like an abyssal forge or crypt, `start: 4, perFloor: 1.2`).
- **Ecology filter / weights:** Optional tag weights or allow/deny tags so a dungeon draws only fitting families alongside dungeon-agnostic threats.
- **Density, template, and patrol profiles:** Multipliers or curves for room threat budgets, `templateChance`, patrol count, and return-trip surge strength.

With this separation, Floor 1 of *The Old Delve* pulls Danger 1 mine vermin while Floor 1 of a late-game dungeon pulls Danger 5–6+ threats using the exact same spawning code.

### 3.3 Peak-danger weighting

A flat spawn weight across `[min, max]` leaves shallow pests spawning just as often at the top of their range as at the bottom. Spawn weighting should peak around `peak` (defaulting to `(min + max) / 2`) and taper toward `min` and `max`:

- Each depth feels ecologically distinct as new monsters phase in and older ones fade out.
- Overlap between adjacent Danger bands stays natural without hard cliffs between floors.

### 3.4 Threat-budget spawning

Instead of spawning a fixed count of monsters regardless of how deadly they are, floors and rooms should spend a **Danger/threat budget** that grows with floor Danger (`MonsterDef.threat`, scaled by `MonsterTemplateDef.threatMul`):

- Adding a high-threat brute or elite automatically reduces the raw headcount in that room, while low-threat swarmers spawn in larger clusters within the same budget.
- Expanding the bestiary never requires retuning every floor's spawn-count formula by hand.

### 3.5 Innate monster passives via `Bundle`

Give `MonsterDef` an optional `bundle` field (`src/content/bundles.ts`) alongside `role` and role powers (`bolt`, `mend`, `bolster`):

- On-hit afflictions (`trigger.hit` applying `status.poisoned`, `status.dazzled`, `status.queasy`), turn-start regeneration (`trigger.turn_start` healing 1 HP), or resistance modifiers work identically for base monsters, `MonsterTemplateDef` overlays (`ETH-117`), and adventurer gear.
- No bespoke special-case combat code is needed per monster species.

### 3.6 Role- and tag-driven squad blueprints

Encounters should be defined as data patterns over **monster roles** (`brute`, `skirmisher`, `caster`, `support`, `swarm` from `ETH-040`) and optional **family/tag affinity**, gated by a minimum floor Danger — never hardcoded lists of monster IDs:

| Archetype pattern | Role composition | Minimum Danger | Tactical purpose |
|---|---|---|---|
| **Solo scout** | `1× skirmisher` or `brute` | 1 | Low-pressure opener; teaches combat and fleeing |
| **Swarm pack** | `2–4× swarm` (same tag preferred) | 1 | Punishes standing exposed in open rooms (`act.surround`) |
| **Kin & tender** | `2–3× swarm/brute + 1× support` | 3 | Teaches target priority against `act.mend_ally` / `act.bolster_ally` |
| **Shield & bolt** | `1–2× brute + 1–2× caster` | 4 | Punishes doorway stalling while casters fire (`act.cast_bolt`) |
| **Hunting pack** | `2–4× skirmisher` (often patrol) | 5 | High-tempo hit-and-run pressure (`act.fall_back`) |
| **Deep warband** | `1–2× brute + 1× caster + 1× support + 0–2× swarm` | 7+ | Full combined-arms test for multi-member parties |

Whenever a new monster is registered in `MONSTERS` with a Danger range, role, and tags, it immediately integrates into every compatible squad pattern and dungeon without touching generation code.

---

## 4. Monster density, groupings, and patrols

Sparse 1-to-5-monster floors leave most rooms empty and isolate `swarm` and `support` roles. Floors should feel populated, with encounter density and coordination ramping up alongside floor Danger.

### 4.1 Room-occupancy and group-size curve

Reference targets for a standard ~10–12 room floor (keeping the arrival stairs room free of initial spawns):

| Floor Danger | Occupied rooms | Typical group size | Total monsters / floor | Floor pacing feel |
|---|---|---|---|---|
| **1–2** (Outskirts) | ~4–5 rooms | 1–2 | **6–10** | Alive immediately; mostly solo pests & tiny pairs |
| **3–5** (Galleries) | ~6–8 rooms | 2–4 | **12–18** | True packs appear; attrition begins taxing healing |
| **6–8** (Deep Workings) | ~8–9 rooms | 3–5 | **18–26** | Most rooms contested; combined-arms squads |
| **9+** (Abyssal Strata) | ~9–10 rooms | 4–6 | **25–35+** | Dense dens & warbands; severe flanking/attrition |

### 4.2 Cohesive group engagement

Spawning monsters in the same room only creates group fights if their AI keeps them together:

- **Room-tethered idle:** Unalerted pack monsters anchor near their home room rather than drifting randomly across the whole floor via `act.wander`, so kicking open a door reveals an intact squad (and pairs cleanly with future sleeping/stealth mechanics in `ETH-097`).
- **Pack alert:** When any member of a group spots an adventurer or takes damage, nearby packmates alert together and share the target's position so supports, casters, and frontline engage on the same wave.
- **Short pursuit memory (~6–10 turns):** Alerted monsters remember the last seen party position briefly rather than dropping aggro the instant a corner or doorway breaks line of sight.

### 4.3 Corridor patrols

Alongside room-bound packs, a small number of **patrols** (solo scouts at low Danger, 2–3 monster hunting squads deeper) follow deterministic multi-room waypoint loops:

- Corridors are no longer guaranteed safe recovery zones.
- Patrols can wander into an ongoing room fight and create emergent flanking pressure.
- Return-trip hunter patrols actively pressure a retreating or relic-carrying party.

### 4.4 How groups reward party composition without party-size scaling

Three existing mechanics in Ethuathia naturally reward balanced compositions when facing coordinated groups:

1. **1-tile doorways and choke points:** A stacked mono-melee party bottlenecks in a doorway while enemy casters bolt and supports heal behind a brute frontline. Balanced parties (tank + ranged/caster + support, or rules that rush casters) break these formations apart.
2. **Surround-blocked fleeing (`act.flee` + `flee` skill):** `ACT_FLEE` requires an open neighboring tile out of every enemy's reach, and breaking away from adjacent foes tests `Finesse` (`src/sim/combat/flee.ts`). Against a 4-monster pack in an open room, getting flanked traps careless adventurers — making `Finesse`, early flee thresholds, and formation rules genuinely valuable.
3. **Deeper room geometry:** Deeper floor types can gradually favor slightly larger rooms or higher `openChance` on doors so deep warbands can maneuver and surround rather than always getting fought one at a time through closed doors.

---

## 5. Variable and hidden dungeon depth

- **Seeded length:** `DungeonDef.depth` uses `{ min, max }` (e.g., `6–10` for *The Old Delve*), rolled deterministically from the run seed so **Rematch** reproduces the exact same dungeon depth.
- **Hidden until reached:** Max depth stays hidden from both the UI (`Floor 3` or `Floor 3 (6–10)`) and the adventurer AI until a living party member enters the bottom floor (verified by `ETH-131` secrecy guards). Not knowing whether the relic sits on floor 6 or floor 10 gives low-HP retreat rules real tension and creates a clean capability upgrade for the Cartographer building (revealing exact depth at run start).
- **Depth-scaled payouts:** Contract rewards and floor Renown (`ETH-085`) scale with actual depth reached/cleared, turning a deep `9–10` floor roll into a high-risk, high-reward jackpot rather than bad luck.

---

## 6. The return trip (deep surge)

Completing all contracts and triggering the return trip (`"The dungeon stirs."`, `ETH-025`) should transform the climb out into an active second act rather than an empty walk back over cleared rooms:

- **Anchor respawns to `bottomDepth` / bottom Danger:** Instead of repopulating each floor at `floor.depth + 1` (which puts weak Danger-2 critters back on Floor 1), pull return-trip waves from near the dungeon's **bottom Danger** (e.g., `[bottomDanger - 2, bottomDanger]`). Lower-level threats surge upward into the upper levels, and variable-length runs stay fair because a 6-floor run pulls Danger 4–6 waves while a 10-floor run pulls Danger 8–10 waves.
- **Route-biased placement & hunter patrols:** Since the party paths briskly from stairs-down to stairs-up along known tiles, bias a share of respawned packs toward rooms/corridors near that path (always respecting `stairsDistance` so arrival stairs are never spawn-camped), bump `templateChance` on pursuers, and allow hunter patrols on the climb out.
- **Keep voluntary Retreat and constant farming distinct:**
  - Leaving via **Retreat** *before* completing contracts keeps floors un-surged, rewarding smart retreat thresholds.
  - The Guild Hall's constant-respawn upgrade (`FLAG_CONSTANT_RESPAWN`, `ETH-129`) stays anchored to local floor Danger (+ a modest shift) so farming upper floors doesn't spawn bottom-floor terrors before the party ever descends.

---

## 7. Systemic balance levers

Adjusting monster stats in isolation causes swingy combat if the surrounding simulation numbers stay tuned for sparse floors:

- **Combat math (`src/sim/combat/index.ts`):**
  - Hit chance is `BASE_HIT_CHANCE (0.70) + (accuracy - evasion) * HIT_PER_POINT (0.05)`, clamped to `[0.05, 0.95]`.
  - Damage is `max(1, rng.int(1, BASE_BLOW [3]) + damage - armor)`.
  - Because armor clamps only down to `1` (`afterArmor`), monsters with `damage: 0` cannot threaten an armored adventurer beyond chip damage. Monster stats must scale across **all axes** (`hp`, `damage`, `accuracy`, `evasion`, `armor`, `speed`, and role powers) so armor mitigates smoothly instead of flattening every deep enemy to 1 damage.
- **Passive out-of-combat recovery (`RECOVERY_INTERVAL`):** Healing `1 HP` every 2 turns out of combat erases attrition between rooms. Slowing `RECOVERY_INTERVAL` (target band ~`8–12` turns, or scaling modestly with Grit / food / healer skills later) ensures multi-room damage persists and gives Mending Draughts, Scrolls of Renewal, fountains, and food buffs real value.
- **In-run leveling pace (`src/sim/stats/leveling.ts`):** With 4–5× more monsters per floor, `XP_PER_THREAT`, `XP_PER_DEPTH`, and `XP_STEP` must be tuned so a full starter delve finishes around **Level 5–8** (rather than Level 12+). This keeps found gear (`+1/+2/+3` weapons, armor, rings) and Smithy upgrades meaningful and preserves clear headroom for 15–20+ floor dungeons later.
- **Built-in group dilution:** Floor item counts (`3–6` per floor) do not multiply with party size, and kill XP splits across nearby sharers (`KILL_GROUP_BONUS = 0.25` within `KILL_SHARE_RADIUS = 6`). Larger parties gain action economy and combined-arms synergy while growing slightly slower per adventurer and sharing limited consumables.
- **Meta-economy pacing:** Size early Renown/Trophy rates and Guild Hall/Smithy costs (e.g., `UPGRADE_SECOND_BERTH`) so players experience several tense ~20% starter runs before unlocking a second adventurer, rather than buying out Tier 1 after a single lucky run.

---

## 8. Monster stat, role, and template benchmarks

Use these benchmarks when authoring new monsters (`src/content/monsters.ts`), templates (`src/content/monsterTemplates.ts`), or dungeons (`src/content/dungeons.ts`).

### 8.1 Baseline `brute` stats by Danger band

For a typical non-swarm, normal-speed (`100`) **brute** with no special on-hit status:

| Danger band | HP | Damage | Accuracy | Evasion | Armor | Speed | Threat |
|---|---|---|---|---|---|---|---|
| **1–2** (Outskirts) | 4–7 | 0–1 | 0 | 0–1 | 0–1 | 90–100 | 1–2 |
| **3–5** (Galleries) | 9–14 | 1–3 | 1 | 0–1 | 1–2 | 95–105 | 3–4 |
| **6–8** (Deep Workings) | 16–24 | 3–4 | 2 | 1 | 1–2 | 95–105 | 5–7 |
| **9–11** (Abyssal Strata) | 25–36 | 4–6 | 3 | 1–2 | 2–3 | 95–105 | 8–12 |
| **12+** (Future dungeons) | +8–10 per +3 Danger | +1–2 per +3 Danger | +1 per +3 Danger | +0.5–1 per +3 Danger | +0.5–1 per +3 Danger | 95–110 | Scales ~1.3× per +3 Danger |

### 8.2 Role offset guidelines

Apply these shifts relative to the Danger-band baseline `brute` above:

- **`swarm`** (`sharesTile: true`, spawned in packs of 2–4): ~40–55% HP, `-1` damage, `+1–2` evasion or `+10–20` speed, `0` armor, ~60–75% individual threat.
- **`skirmisher`** (`act.fall_back` + `act.flee` below 40% HP): ~75–85% HP, `+10–25` speed (`110–125`), `+1–2` evasion, same or `-1` damage.
- **`caster`** (`bolt` range 4–5): ~65–80% HP, `80–100` speed, `0–1` armor, optionally pairs moderate direct damage with a status trigger (`status.dazzled`, `status.queasy`, `status.poisoned`).
- **`support`** (`mend` / `bolster` range 4): ~65–80% HP, lower personal damage (`-1`), `mend` scaled to roughly 20–30% of peer brute HP (and `bolster` applying `status.emboldened` or `status.hasted` at high Danger).
- **Specialists** (high-armor constructs, regenerating giants, venomous ambushers): trade `+1–2` armor or an innate `Bundle` trigger/regen for slower speed (`75–85`) or lower HP/evasion — never high HP, high armor, high evasion, *and* high speed on a non-unique monster.

### 8.3 Templates and out-of-depth spawns

- **Depth-ramped `templateChance`:** Keep templates (`MonsterTemplateDef`, `ETH-117`) at **0%** on Danger 1–2 so new players learn base monsters first, then ramp gradually from Danger 3+ (for example, ~`+3–4%` per Danger step above 2, plus higher rates in harder dungeons or under the *Elite Spawns* Omen).
- **Template budget weight:** Templates that add an extra turn-by-turn hazard (e.g., *Venomous*, *Hexspitting*, regeneration) or scale multiplicative stats (*Swift*, *Hulking*) carry `threatMul: 1.5–2.0` and raise `lootTier` (`ETH-052`) so tougher fights pay better Trophies and better drops.
- **Out-of-depth (OOD) spawns:** Allow a small chance (e.g., ~5% from Danger 3+) to spawn a creature +2 Danger above the current floor, marked with a log/highlight warning (`ROGUELIKE-SURVEY.md` §3.6).

### 8.4 Author checklist for new bestiary or dungeon content

1. **Clean-room identity (`CLAUDE.md` §9):** Original name, glyph, description, and Codex text (no copied names or lore from Roguathia, DCSS, or NetHack).
2. **Danger & ecology:** Set Danger range (`min`, optional `peak`, `max`), `weight`, `threat`, and family `tags`.
3. **Stats & role coherence:** Check against §8.1–8.2; give casters `bolt`, supports `mend`/`bolster`, and any innate on-hit/regen trait an explicit `Bundle` so tooltips explain it.
4. **Codex & log readiness:** Verify `validateContent` passes (`npm run validate:content`) and all new statuses/triggers/effects appear cleanly in tooltips.
5. **Sim verification:** Run `npm run sim -- --seeds 100 --compare origin/main` across party sizes `1..4` before finalizing numbers.

---

## 9. Measuring balance

Every change to monsters, items, XP, recovery, generation, or return-trip rules must be checked with the headless harness rather than tuned by feel:

```sh
npm run sim -- --seeds 100
npm run sim -- --seeds 100 --party 2
npm run sim -- --seeds 100 --party 4
npm run sim -- --seeds 100 --compare origin/main
```

Track these metrics together:

- **Victory rate & run outcome split** (`victory` / `retreat` / `wipe`) across solo (`--party 1`) and upgraded party sizes (`2–4`).
- **Onboarding reach rate:** share of fresh runs reaching Floor 3+.
- **Return-trip deaths:** wipes occurring *after* `turnedBack` vs. on the descent.
- **Leveling & economy:** mean max level reached, kills per run, items picked up, and Renown / Trophies earned per run and per hour.
- **Death-cause diversity:** ensure no single monster or status accounts for an accidental majority of wipes due to a silent stat cliff.
