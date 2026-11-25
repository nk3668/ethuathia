# Ethuathia difficulty and balancing philosophy

The living design and tuning guide for difficulty, danger progression, bestiary growth, and run economy in Ethuathia (see [`../CLAUDE.md`](../CLAUDE.md) and [`ARCHITECTURE.md`](ARCHITECTURE.md)). Consult this document whenever adding monsters, templates, items, classes, town upgrades, Omens, or new dungeons, and when running balance passes such as `ETH-080`.

---

## 1. Core principles

1. **No level-scaling, and only a small party-size surcharge.** Monster stats never scale to adventurer levels or party size. Stronger creatures live on deeper floors and inside harder dungeons. The one concession to party size is that a bigger party draws a *slightly* bigger encounter budget: a few more monsters or an extra pack per floor, never stronger monsters. The mechanism is a named constant, `PARTY_SIZE_BUDGET_STEP` (+X% floor threat budget for each adventurer after the first), **kept at 0** (`ETH-080` re-tested it at 0.03 on 200 seeds: party 4 fell below party 3 on the fresh preset and well under 2× solo on both): at 3% and above the win-rate ordering broke at 60 seeds, because a party of 4 still loses members one at a time. `ETH-080` tunes it upward, toward about +10% (so a party of 4 would face about +30%), as parties get sturdier and for as long as the ordering holds. The surcharge must never cancel the party's advantage (Principle 6). Unlocking a second berth, buying Smithy gear, or drafting a balanced party must make earlier content genuinely easier, pushing players toward higher Omen levels, additional contracts, and deeper dungeons instead of punishing progression (`CLAUDE.md` §1, Principle 3).
2. **Loss early; mastery raises the ceiling.** A fresh company with zero upgrades should expect to lose most attempts on a starter delve. Survival and victory come from town meta-progression, party composition, gear upgrades, and behavior rules that match the threats ahead.
3. **Attrition and tactics over one-shot spikes.** Combat should wear down HP, healing potions, fountain draughts, and positioning across an entire floor rather than deciding runs on a single coin-flip blow. Every combat death should be readable in hindsight (`CLAUDE.md` §1, Principle 2).
4. **Readable danger.** Out-of-depth spawns, templated/elite variants, return-trip surges, and killer identities are surfaced clearly in the log, highlights, Codex, and tooltips. Never balance through hidden luck values or silent scaling (`ROGUELIKE-SURVEY.md`).
5. **Extensible as pure data.** Adding a new monster, template, encounter pattern, or themed dungeon must be a data entry in `src/content/`, not a rewrite of spawning or difficulty logic (`ARCHITECTURE.md`).
6. **Solo is the hardest way to play.** On the same profile and dungeon, win rate rises with party size: 1 < 2 < 3 < 4, and a party of 4 should win at least twice as often as a solo adventurer (the strict ordering is checked by `ETH-145`; clearing the 2x target is `ETH-080`'s job). Bigger parties pay for their safety through shared XP, shared floor loot and consumables, crowding in narrow corridors, and the small encounter-budget surcharge from Principle 1. They never face stronger monsters because of their size. A solo adventurer must never out-level the dungeon by hoarding XP. The harness checks this ordering (`ETH-145`).
7. **Balance is re-checked, not finished.** Every milestone ends with a balance check against §2 using the §9 procedure, and that check also covers the milestone's major content additions (a class, a dungeon, a bestiary expansion, a new item family, a town tree). A milestone isn't done until its check passes or the targets are deliberately changed in this document (§9.1).
8. **Composition and synergy beat headcount.** Once more classes exist, a mixed party whose classes cover each other (frontline, ranged, support, with matching rules) is clearly stronger than the same number of Vanguards. A single-class party is the floor, not the ceiling. Each new class must make at least one party it joins stronger than its single-class equivalent, and no one composition may be best everywhere (Principle 13). This is measured from M3 on (`ETH-146`).
9. **The best gear is found, not bought.** Smithy kits, starting enchantments and other starting gear raise the floor: modest and reliable, roughly what a typical run finds by floor 2–3 **(default)**. The strongest items (high enchantments, affixes, artifacts, heirlooms) come from inside runs: floor loot, elites, mini-bosses and graves. On a typical delve, the starting kit should be outclassed by mid-run finds.
10. **Meta power adds consistency more than ceiling.** Town and roster progression (Guild Hall, Smithy, Temple, Tavern, unlocks) gives small, permanent stat boosts. Its bigger job is making runs **more consistent**: fewer early deaths, more reliable floor reach, better recruits and more options. The ceiling comes from what happens in the run: found gear, in-run levels, party composition and rules. In-run levels matter, but they never overshadow gear and party makeup (target end level in §7).
11. **Balanced for the hands-off player.** The player may simply watch. Every target in §2 is measured on AI-only runs, using the baseline AI and the rule presets available at that stage of progression. Manual control (possession, possibly unlocked later rather than available from the start) is a bonus. No target may depend on it.
12. **Retreating always pays.** A retreat banks everything earned, so it should rarely be worse than pushing on. Retreat rules must have a real payoff, never only a cost.
13. **No dead runs, and no dominant strategy.** Even a lost run moves the player toward their next unlock. A fresh player buys a cheap rank after almost every run and saves up for a milestone such as the Second Berth in about **4 runs** at a ~20% win rate (§9.3). No single rule preset, party makeup or Omen combination should be best in every dungeon.
14. **Risk is priced fairly.** Every Omen and extra contract must pay more than the win rate it costs, as the harness measures it. Opting into risk should be a good bet for a strong party, never a trap.

---

## 2. Target difficulty and win-rate bands

Targets are measured with the headless balance harness (`npm run sim -- --seeds 100`) on a fresh or configured profile:

### Starter dungeon (*The Old Delve*, hidden 6–10 floors)

- **Fresh profile (solo Level 1 Vanguard, 0 upgrades):**
  - **Victory rate:** **~15–25%** (target **~20%**). Wins come mostly from shorter rolled depths, favorable gear/fountain drops, or smart retreat/healing rules; deeper rolls and the return trip claim most early runs.
  - **Onboarding floor reach:** **>85–90%** reach **Floor 3+** so early runs consistently earn Renown/Trophies and unlock early milestones (such as the Smithy at depth 3) without feeling brick-walled at the entrance.
- **Progressed profile (unlocked berths, early Guild Hall / Smithy upgrades):**
  - **Victory rate:** **~45–60%** (target **~50%**), varying meaningfully with **party composition** and **behavior rules**. A naive, corridor-bottlenecked mono-melee stack should sit closer to **~35–40%**, while a well-composed party (frontline + ranged/support + tailored rules) should climb past **~55–65%**. *The composition spread can only be measured once several classes and the rules editor exist (M3, `ETH-146`). Until then, measure a progressed party of 4 Vanguards against the ~45–60% band.*
- **Fresh solo classes and races (ETH-160):** `npm run sim -- --class <id> --race <id>` fields a solo adventurer of one class and race; classes are measured with Human and races with Vanguard, and each should sit in the same victory and Floor 3+ bands as the Vanguard (200 seeds, after ETH-177 and `budgetMul` 1.4: Vanguard 18.5%, Outrider 26.5%, Reaver 23%, Stonekin 16.5%, Fenling 22%). The Lorekeeper may trail until its M4 spells (13%, Floor 3+ 89%). Since ETH-177 a point of Brawn (through a mace or axe), of Finesse (through a sword or dagger) and of Grit is priced to be worth about the same, so classes share the Vanguard's 37 starting points and +3.25 a level: the Outrider does; the Reaver starts on 33 (its hatchet's +2 damage is the rest of its edge) and the Lorekeeper on 33 (it trails on purpose). The formulas live in `ATTRIBUTE_FORMULAS` (`src/sim/stats/attributes.ts`): Grit 4.5 max HP a point above 8, damage 0.2 a point above 3 (Brawn, or the weapon's attribute), Finesse 0.3 accuracy and 0.3 evasion a point above 5. Re-check the table above after any change to them.
- **Party-size ordering (Principle 6):** on each preset, win rate rises from party 1 to 4, and party 4 should win at least **2×** as often as solo (the ordering is checked by `ETH-145`; the 2× target is owned by `ETH-080`).
- **Return-trip lethality:** **~15–25%** of relic-bearing runs wipe on the climb back out, making post-objective retreat rules matter rather than turning the ascent into a victory lap.

### Later dungeons and opt-in escalation

- **Themed dungeons (Cartographer / M8+):** Each new dungeon shifts its starting Danger curve upward (for example, starting at Danger 3+ or Danger 6+) and swaps in harsher monster tags and denser encounter budgets. Late dungeons remain dangerous to upgraded 4-person parties while *The Old Delve* naturally becomes a reliable training ground for fresh recruits or heirloom recovery.
- **Opt-in risk:** Once a player reliably clears a dungeon above ~65%, **Omens** (`ETH-067`) and **extra Contract slots** (`ETH-028`) raise difficulty voluntarily in exchange for higher reward multipliers and payouts.
- **Where the Omen multiplier sits (`ETH-185`):** all Omens share one reward multiplier, `1 + Σ` of each chosen rank's `reward` (a content number per rank; `ETH-161` tunes them). It is applied to Renown, Trophies and Favor as they are earned in the run, before the wipe loss (base → ×Omen → −25%). It is **not** applied to exit conversions (leftover gold, sold items, Field Salvage scrap) or to the Smithy's trade bonus, so hoarding loot can't inflate an Omen run. A town node never pays its own risk bonus: it only unlocks an Omen, and the Omen's rank is the only thing that adds danger and the only thing that pays for it.

---

## 3. Extensible tier and danger architecture

Hardcoding monster lists or tying monsters permanently to floors `1–10` of a single dungeon breaks as soon as a second dungeon is added. Difficulty is built on an **open-ended numeric Danger scale** shared by the bestiary, encounter generator, and dungeon variants.

### 3.1 Decouple monster Danger from raw floor numbers

- Avoid closed difficulty enums (`easy` / `medium` / `hard`) and avoid assuming "depth 1 = weakest possible monster everywhere."
- Define every `MonsterDef` over an open-ended **Danger** band (`danger: { min, peak?, max }` — extending seamlessly from `1` through `10`, `15`, `20+`) plus **family/ecology tags** (`beast`, `small_folk`, `undead`, `fungus`, `construct`, `aquatic`, etc.).
- `MonsterDef.danger` (`src/content/monsters.ts`) holds this band, added in `ETH-133`. *The Old Delve* maps one floor to one Danger step.

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

### 4.4 How groups reward party composition without scaling monsters to party size

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
- **Passive out-of-combat recovery (`RECOVERY_INTERVAL`):** Healing `1 HP` every few turns out of combat erases attrition between rooms. `RECOVERY_INTERVAL` is **12** turns since `ETH-080` (target band ~`8–12`; it may scale modestly with Grit / food / healer skills later). A slow trickle hurts a lone adventurer far more than a party, because a party spreads damage over several bodies and kills faster, so this is the main lever that pushes solo down without pushing party 4 down. It ensures multi-room damage persists and gives Mending Draughts, Scrolls of Renewal, fountains, and food buffs real value.
- **In-run leveling pace (`src/sim/stats/leveling.ts`):** With 4–5× more monsters per floor, `XP_PER_THREAT`, `XP_PER_DEPTH`, and `XP_STEP` must be tuned so a full starter delve finishes around **Level 5–8** (rather than Level 12+). This keeps found gear (`+1/+2/+3` weapons, armor, rings) and Smithy upgrades meaningful and preserves clear headroom for 15–20+ floor dungeons later.
- **Built-in group dilution:** Floor item counts (`3–6` per floor) do not multiply with party size, and kill XP splits across nearby sharers (`KILL_GROUP_BONUS = 0.55` since `ETH-080`, within `KILL_SHARE_RADIUS = 6`). Larger parties gain action economy and combined-arms synergy while growing slightly slower per adventurer and sharing limited consumables.
- **Party-size encounter surcharge (Principle 1):** the floor threat budget (§3.4, §4.1) grows by `PARTY_SIZE_BUDGET_STEP` per adventurer after the first (shipped at 0; `ETH-080` tunes it toward about +10%). It adds headcount or an extra pack, never stats or templates, and it is shown in the floor tooltip (once it is above 0) so it stays readable. Tune it last among the party levers, and only while the Principle 6 ordering still holds (`npm run sim -- --party-sweep`).
- **Dungeon encounter budget (`DungeonDef.encounters.budgetMul`):** the one dial that scales every floor's threat budget (§3.4) without touching a monster stat. *The Old Delve* ships at **1.5** since `ETH-176`, which gave every Vanguard a starting cudgel and shield (fresh solo win rate 17% → 33% at 1.0; 21% at 1.5 on 200 seeds, floor 3+ reach 96%, return-trip lethality 14%; `ETH-177` repriced the attribute formulas, which dropped the fresh Vanguard to 14% at 1.5, so the dial went to **1.4**: 18.5% on 200 seeds, floor 3+ reach 100%, mean depth 6.5). When starting gear or other power the player always has changes, retune this first, since it moves win rate without changing what monsters are. Room counts cap at ×2, so it has about +100% of headroom.
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

Balance is checked with the headless harness (`npm run sim`), never tuned by feel. Sweeps are slow, though, so run one only when the change can move the numbers, and only at the size the question needs.

### When a change needs the harness

Decide by what the change can affect, not by its size.

| Kind of change | Harness? | Tier |
|---|---|---|
| **Balance-affecting:** monster, item, loot or enchantment numbers; XP and leveling; recovery and healing; combat formulas; encounter generation, spawn budgets, templates and patrols; baseline AI decisions (rules, conditions, actions, their order); run-end and return-trip rules; rewards and currency formulas; anything party size or upgrades change inside a run | **Yes** | T0 with the new content off, plus a smoke run (below); T2 and T3 run only in the milestone's balance capstone |
| **Behavior-neutral sim changes:** refactors, performance work, serialization and state-shape changes that don't alter decisions, new events, trace or log text | **Identity check only** | T0 |
| **Not sim-related:** anything only in `src/ui/` (it can't change the sim; layer rule, `CLAUDE.md` §9), Codex and tooltip text, content names, descriptions and glyphs, docs, backlog, tests only, tooling that doesn't touch the sim | **No** | `npm run check` (+ a look at the running app for UI) |

If a "neutral" change fails the T0 identity check, it isn't neutral: find out why, then treat it as balance-affecting.

### Seed tiers

All comparisons run the **same seeds** on both commits (`--compare REF`, or `--baseline FILE`). Most seeds end the same way on both sides, and only the seeds that flip carry information. That makes a paired before/after far less noisy than comparing two independent win rates.

| Tier | Seeds | Use it for | Passes when |
|---|---|---|---|
| **T0 Identity** | 20, paired | Behavior-neutral sim changes | 0 seeds end in a different state hash |
| **T1 Direction** | 50 | Iterating while tuning in a capstone | No pass mark: it only shows which way a lever moves things |
| **T2 Gate** | 100, paired against a base | Capstone only: attributing a moved number to one piece's commit, and checking a retune before the final sweep | Every delta is explained as intended; no new stalls, stuck runs or unattributed deaths |
| **T3 Acceptance** | 200 per configuration | Capstone only: checking a §2 band, the Principle 6 party-size ordering, and a milestone baseline (§9.1–9.2) | Each target band or ordering holds |

T1, T2 and T3 are the larger suites, and they wait until the milestone's work is finished (Nate, 2026-11-25). Work items run only T0 and a smoke run, as the next section says.

Why 200 for acceptance: at 100 seeds the 95% interval on a ~20% win rate is about ±8 points, as wide as the bands in §2. At 200 it is about ±5.5. The party-size ordering compares two noisy rates (e.g. 20% vs 40%), so it needs T3 as well. Below 200 a true 2× can fail by chance.

### Pieces of a larger deliverable

Every work item is a piece of its milestone, which ends in a balance capstone (§9.1, such as `ETH-080` for M1.5), so no work item runs T1, T2 or T3 (Nate, 2026-11-25). Absolute bands and deltas are the capstone's job, and measuring a piece is mostly wasted once the next piece moves the numbers again. A piece runs:

- **T0** with its new content unowned or switched off, against its base: 0 hash diffs, so nothing changed for a player who doesn't use it. A piece that is meant to change every run (a formula or baseline AI change) records that T0 fails and why.
- **A smoke run** (20 seeds) with its content on, showing no stalls, stuck runs, crashes, or a collapse in win rate or depth.

It records both with the commit hash in its item Log. The capstone measures the milestone as a whole against the milestone's base; if a number moved unexpectedly, it attributes it by running the pieces' commits with `--compare`. Tuning work found along the way (a stat that looks off, a node that seems too strong) is noted for the capstone rather than measured on its own.

### Measure on a clean tree

Run balance numbers on committed code, or with `--compare` against a named ref, and record the commit hash next to every number you report.

```sh
npm run sim -- --seeds 20 --compare origin/main                          # T0: expect 0 hash diffs
npm run sim -- --seeds 50 --preset fresh                                 # T1 while tuning
npm run sim -- --seeds 100 --compare <item base>                         # T2 gate
npm run sim -- --seeds 200 --preset progressed --party 4                 # T3, one configuration
```

### Metrics

Track these metrics together:

- **Victory rate & run outcome split** (`victory` / `retreat` / `wipe`) across solo (`--party 1`) and upgraded party sizes (`2–4`).
- **Onboarding reach rate:** share of fresh runs reaching Floor 3+.
- **Return-trip deaths:** wipes occurring *after* `turnedBack` vs. on the descent.
- **Leveling & economy:** mean max level reached, kills per run, items picked up, and Renown / Trophies earned per run and per hour.
- **Death-cause diversity:** ensure no single monster or status accounts for an accidental majority of wipes due to a silent stat cliff, and that no death is unattributed (`other`).
- **Party-size ordering:** sweep party sizes 1–4 on each preset (Principle 6).
- **Runs to next unlock** (from M2 on): how many fresh-profile runs it takes to afford the first Guild Hall and Smithy nodes (Principle 13).
- **Composition spread** (from M3 on): mixed-class parties against same-size Vanguard parties (Principle 8).
- **Risk pricing** (from M6 on): win-rate drop against reward multiplier for each Omen rank (Principle 14).

### 9.1 Milestone balance checks

Per Principle 7, every milestone ends with a balance check, its capstone, which also measures the milestone's major content additions. It is the only place the larger suites (T1–T3) run. Each check is a backlog item in `tools-balance` that:

1. Runs the full §9 sweep at T3 (presets × party sizes 1–4, 200 seeds each) on the milestone's integration branch.
2. Compares against the previous baseline in §9.2 and explains every target that moved.
3. Retunes with data in `src/content/` and shared balance constants, or updates the §2 targets here with the reason.
4. Records the new baseline in §9.2.

Lever order when retuning (fix the earliest one that's off first, since each distorts the ones after it): party AI faults and unattributed deaths → XP and leveling curve → `RECOVERY_INTERVAL` and healing supply → monster stats against §8 → spawn budgets and templates → loot and drop rates → meta-economy pacing.

### 9.2 Baselines

| Milestone | Commit | Fresh solo win | Progressed ×4 win | Floor 3+ (fresh) | Return-trip lethality | Mean end level (solo / ×4) |
|---|---|---|---|---|---|---|
| M1.5 (`ETH-080`) | `a669cc3` (sim state; later commits are tests and docs only) | 18.0% (fresh, 200 seeds) | 54.5% (progressed, 200 seeds) | 90.0% | 20.0% (9/45 relic runs, fresh solo) | 5.5 fresh solo / 7.2 progressed ×4 (6.8 member mean) |
| M2 (`ETH-161`) | `4f1dcfd` (the pass changed only town prices and the harness, not the sim) | 18.5% (fresh, 200 seeds) | 47.5% (progressed, 200 seeds) | 100% | 2.6% (1/38 relic runs, fresh solo) | 6.5 fresh solo / 7.4 progressed ×4 (7.2 member mean) |

Full party sweep behind the M1.5 row (200 seeds per cell, win % / mean highest level):

| Preset | Party 1 | Party 2 | Party 3 | Party 4 | Party 4 ÷ solo |
|---|---|---|---|---|---|
| Fresh | 18.0 / 5.48 | 32.5 / 6.55 | 38.0 / 6.88 | 46.0 / 6.92 | 2.56× |
| Progressed | 26.5 / 6.08 | 37.0 / 6.71 | 45.0 / 6.99 | 54.5 / 7.21 | 2.06× |

Before `ETH-080` (base `d7fca44`): fresh 28.5 / 35.5 / 38.5 / 46.5, progressed 33.0 / 40.0 / 43.5 / 50.0 (ratios 1.63× and 1.52×). `PARTY_SIZE_BUDGET_STEP` stays **0**: at 0.03 party 4 fell to 33.0% (fresh, below party 3) and 39.5% (progressed), breaking both the ordering and the 2× ratio. A 200-seed cell has a 95% interval of about ±5.5 points, so the progressed 2.06× has little margin: re-check it whenever solo or party 4 moves.

M2 party sweep (`ETH-161`, `4f1dcfd`, 200 seeds per cell, win % / mean highest level). Since M2.1 the progressed preset is the Second Berth, Hardy Recruits I and the Reinforced Wagon from the new trees, so its row is not comparable with M1.5's:

| Preset | Party 1 | Party 2 | Party 3 | Party 4 | Party 4 ÷ solo |
|---|---|---|---|---|---|
| Fresh | 18.5 / 6.51 | 29.5 / 7.06 | 41.5 / 7.24 | 45.0 / 7.34 | 2.43× |
| Progressed | 21.5 / 6.50 | 33.0 / 7.09 | 39.5 / 7.21 | 47.5 / 7.37 | 2.21× |

Two M2 bands miss and are open questions for Nate: return-trip lethality is 2.6% (fresh solo) and 5.4% (progressed ×3) against the 15–25% target, and progressed ×4 sits at the bottom of the 45–60% band.

### 9.3 Town pacing

`npm run sim -- --pacing` prints, after the report, how many runs at the report's mean banked Renown and Trophies each Guild Hall and Smithy node takes: alone, and cumulatively when every rank is bought cheapest first within each tier band (a pick-one group counts its cheapest node). Income is held flat, so bracket it with a fresh solo run and a progressed party run. Tier quests and reveal milestones are assumed met.

**Targets (`ETH-161`, Nate 2026-11-24: slower than the strawman of a first unlock at run 5 and a full party at run 15; every run that gets anywhere buys something):**

- **Every run moves a bar.** The cheapest rank in each building costs under half of a fresh solo run's income, so a run that reaches floor 3 buys something.
- **The berths are milestones.** Saving for it, a fresh solo player affords the Second Berth around **run 4**, and the Reinforced Wagon (third berth) around **run 10**. The Library's fourth berth (later) should land past **run 15**.
- **Tier I of the Guild Hall and the Smithy done** around **run 15–25**; **both tiers done** around **run 45–75**. More buildings come in later milestones, so the trees need not outlast the whole game.
- `BUILDING_QUEST_SHARE` (0.3) and `TIER_QUEST_SHARE` (0.5) stay as they are.

**Measured (`4f1dcfd` income, prices after `ETH-161`):** fresh solo earns 354 Renown and 197 Trophies a run (2,960 and 1,640 an hour at 1×); progressed ×3 earns 480 and 318. Before the pass the first run bought five or more nodes and both trees were done after about 24 fresh runs (17 progressed), so every Guild Hall and Smithy price was tripled, with the Second Berth at 1,200 Renown (3.4 fresh runs alone) and the Reinforced Wagon at 2,400 Trophies. Cheapest first, Tier I is done after 26 (Guild Hall) and 25 (Smithy) fresh-income runs, 20 and 15 at progressed income; both tiers after about 75 and 50.

**Omen risk pricing (progressed ×3, 200 seeds, base 39.5% win):**

| Omen | Rank 1 win % / reward | Rank 3 win % / reward | Verdict |
|---|---|---|---|
| Deep Surge | 38.5 / +10% | 30.0 / +30% (return-trip deaths 23%) | Priced: the only real risk |
| Stalker's Ledger | 43.5 / +10% | 42.0 / +30% | Free: its finds outweigh the danger |
| Cursed Hoards | 39.5 / +10% | 39.0 / +30% | Free |
| Armed Warbands | 48.5 / +12% | 42.5 / +36% | Free, a buff at rank 1: the dropped gear arms the party |

Three of the four break "risk is a choice and pays for it": they pay without costing. Not changed in this pass; see the `ETH-161` Log.

**Town nodes flagged during M2 (progressed ×3, 200 seeds, base 39.5%):** Artisan Implements 63.0% (+23.5, far the strongest node), Extraction Drills III 47.5% (+8), Field Rations III 42.5% (+3), Forge Stamps 41.0% (+1.5).

## 10. Open questions

- **Does every threat need a counter the player already has?** One candidate principle: whenever a threat first appears, a counter to it (a rule, an item or an upgrade) is already available, so every death teaches "I could have done X". It is undecided because the player may be hands-off and possession may come later as an unlock, so any counter would have to come from the built-in AI, rule presets or upgrades. Revisit once the rules editor lands (M3).
