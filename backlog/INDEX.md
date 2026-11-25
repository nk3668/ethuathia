# Backlog Index

**Next ID: ETH-198**

**Current milestone: M3 (Tactics and AI).** M2 (Meta loop) is complete: its capstone ETH-161 and the follow-up ETH-191 merged 2026-11-25. On 2026-11-25 Nate replaced player-written behavior rules with **tactics** the player picks and swaps (`CLAUDE.md` §5.2), and the M3 items were rewritten for it.

**Assigned to Gemini (Antigravity):** ETH-197 (M3). Earlier items (ETH-083, ETH-095, ETH-157, ETH-158, ETH-175) are reviewed and merged.

Sorted by milestone, then priority. See [README.md](README.md) for conventions.

## Milestones

From M2 on, each milestone is one theme (roadmap in [`../CLAUDE.md`](../CLAUDE.md) §10). Each ends with a balance capstone.

| Milestone | Theme | Capstone |
|---|---|---|
| M0–M1.6 | Skeleton, a full run, living dungeon, review follow-ups | done |
| M2 | Meta loop: town economy, unlocks, records, desktop saves | ETH-161 |
| M2.1 | Town trees: the Guild Hall and Smithy trees from the town-tree page (v4) | ETH-161 |
| M2.2 | Minimal Omens: ranks, one reward multiplier, unlocked by town nodes | ETH-161 |
| M3 | Tactics and AI | ETH-165 |
| M4 | Classes and roles | ETH-146 |
| M5 | Foes and loot | ETH-166 |
| M6 | Quests and risk (contracts, bounties, encounters, Omens) | ETH-167 |
| M7 | Lineage | ETH-168 |
| M8 | Gods and world | ETH-169 |

## Epics

| Epic | Title | Status | Milestones |
|---|---|---|---|
| [project-setup](project-setup/_epic.md) | Project setup and tooling | active | M0 |
| [sim-core](sim-core/_epic.md) | Simulation core | active | M0, M1, M2 |
| [dungeon-gen](dungeon-gen/_epic.md) | Dungeon generation | active | M0, M1.5, M2, M6, M8, later |
| [adventurer-ai](adventurer-ai/_epic.md) | Decision engine and baseline AI | active | M0, M1, M1.6, M3, M6 |
| [behavior-rules](behavior-rules/_epic.md) | Tactics (formerly behavior rules) | active | M2, M3 |
| [combat-items](combat-items/_epic.md) | Combat, items and statuses | active | M1, M1.6, M5, M7, later |
| [content](content/_epic.md) | Content definitions | active | M0, M7 |
| [town-meta](town-meta/_epic.md) | Town, currencies and upgrades | active | M2, M2.1, M3, M6, M7, M8, later |
| [saves-platform](saves-platform/_epic.md) | Saves, desktop packaging and time-away | active | M2, M8 |
| [risk-omens](risk-omens/_epic.md) | Omens and conducts | active | M2, M2.2, M6 |
| [lineage](lineage/_epic.md) | Lineage | active | M2, M7, M8 |
| [deities](deities/_epic.md) | Deities and altars | active | M8 |
| [ui-shell](ui-shell/_epic.md) | UI shell and kit | active | M0, M1, M2, later |
| [map-renderer](map-renderer/_epic.md) | Map renderer | active | M0, M1 |
| [codex-tooltips](codex-tooltips/_epic.md) | Codex and tooltips | active | M1.6, M2, M5 |
| [tools-balance](tools-balance/_epic.md) | Test and balance tooling | active | M0, M1, M1.5, M1.6, M2, M3, M4, M5, M6, M7, M8 |
| [quests](quests/_epic.md) | Quests: contracts and bounties | active | M1, M1.5, M2, M6, M7 |
| [characters](characters/_epic.md) | Characters: attributes, classes and races | active | M1, M2, M4, M7 |
| [bestiary](bestiary/_epic.md) | Bestiary: monsters, uniques and elites | active | M1, M1.5, M2, M5, M7, later |

## Items

| ID | Title | Epic | Milestone | Priority | Status | Size |
|---|---|---|---|---|---|---|
| [ETH-001](project-setup/ETH-001-scaffold-project.md) | "Scaffold Vite, React, strict TS, Vitest and ESLint layer rules" | project-setup | M0 | P0 | done | M |
| [ETH-002](sim-core/ETH-002-core-utilities.md) | "Core utilities: seeded RNG streams, Grid and Registry" | sim-core | M0 | P0 | done | M |
| [ETH-003](sim-core/ETH-003-run-state-entities.md) | "Run state and entity model with serialize round-trip" | sim-core | M0 | P0 | done | M |
| [ETH-004](sim-core/ETH-004-scheduler-step-loop.md) | "Energy scheduler and step loop with commands and events" | sim-core | M0 | P0 | done | M |
| [ETH-005](sim-core/ETH-005-action-pipeline.md) | "Action pipeline: move, wait and open door" | sim-core | M0 | P0 | done | S |
| [ETH-006](dungeon-gen/ETH-006-dungeon-gen-pipeline.md) | "Dungeon gen pipeline: rooms-and-corridors floor" | dungeon-gen | M0 | P0 | done | M |
| [ETH-007](sim-core/ETH-007-fov-map-memory.md) | "FOV and map memory" | sim-core | M0 | P0 | done | S |
| [ETH-008](sim-core/ETH-008-goal-maps-pathing.md) | "Goal maps (Dijkstra) and pathing" | sim-core | M0 | P0 | done | S |
| [ETH-009](adventurer-ai/ETH-009-decision-engine-baseline-explore.md) | "Decision engine with baseline exploration, trace and stuck detection" | adventurer-ai | M0 | P0 | done | M |
| [ETH-010](sim-core/ETH-010-sim-host.md) | "SimHost: inline and Web Worker hosts, snapshot protocol and speed" | sim-core | M0 | P0 | done | M |
| [ETH-013](map-renderer/ETH-013-canvas-map-renderer.md) | "Canvas map renderer: glyph atlas, fog and camera follow" | map-renderer | M0 | P0 | done | M |
| [ETH-011](ui-shell/ETH-011-tokens-fonts-kit.md) | "Design tokens, bundled fonts and first kit primitives" | ui-shell | M0 | P1 | done | M |
| [ETH-012](ui-shell/ETH-012-app-shell-layout.md) | "App shell layout: top bar, party column, map area, tabs and log" | ui-shell | M0 | P1 | done | M |
| [ETH-014](ui-shell/ETH-014-pause-speed-controls.md) | "Pause, speed controls and keyboard shortcuts" | ui-shell | M0 | P1 | done | S |
| [ETH-015](content/ETH-015-content-registry-first-defs.md) | "Content registry with validation and first definitions" | content | M0 | P1 | done | S |
| [ETH-016](tools-balance/ETH-016-determinism-headless-run.md) | "Determinism test and headless run script" | tools-balance | M0 | P1 | done | S |
| [ETH-055](sim-core/ETH-055-extension-seams.md) | Extension seams so feature work lands in per-domain files | sim-core | M1 | P0 | done | M |
| [ETH-056](tools-balance/ETH-056-invariants-soak-compare.md) | Safety net: state invariants, soak test, app-boot smoke test and sim compare | tools-balance | M1 | P0 | done | M |
| [ETH-057](combat-items/ETH-057-bundles-stats-statuses.md) | Bundles (modifiers, effects, triggers), stats with sources and timed statuses | combat-items | M1 | P0 | done | M |
| [ETH-058](sim-core/ETH-058-multi-floor-descent.md) | Multiple floors: stairs, lazily generated floors and a baseline descend rule | sim-core | M1 | P0 | done | M |
| [ETH-060](combat-items/ETH-060-monsters-melee-combat.md) | Monsters, melee combat and death | combat-items | M1 | P0 | done | M |
| [ETH-061](combat-items/ETH-061-items-inventory-core.md) | Items on the floor, inventory, pickup and drop, and in-run gold | combat-items | M1 | P0 | done | M |
| [ETH-062](sim-core/ETH-062-run-end-summary.md) | Run end (victory, retreat, wipe), run trackers, run summary and auto-restart | sim-core | M1 | P0 | done | M |
| [ETH-024](quests/ETH-024-contracts-recover-relic.md) | Contract model and the Recover-relic contract; victory needs every contract plus the exit | quests | M1 | P1 | done | M |
| [ETH-025](quests/ETH-025-return-trip.md) | Return trip: walk back up through explored floors, with light respawns | quests | M1 | P1 | done | M |
| [ETH-033](characters/ETH-033-attributes-derived-stats.md) | Four attributes and the stats derived from them | characters | M1 | P1 | done | M |
| [ETH-034](characters/ETH-034-xp-leveling-class-growth.md) | XP, leveling and per-class attribute growth | characters | M1 | P1 | done | M |
| [ETH-040](bestiary/ETH-040-monster-roles.md) | Monster roles and role behaviors | bestiary | M1 | P1 | done | M |
| [ETH-043](combat-items/ETH-043-equipment-slots-base-items.md) | Equipment slots and base item types | combat-items | M1 | P1 | done | M |
| [ETH-082](combat-items/ETH-082-weapon-attribute-scaling.md) | Each weapon type scales damage off its own attribute | combat-items | M1 | P1 | done | M |
| [ETH-110](characters/ETH-110-leveling-followup.md) | Rolled growth, shared kill XP and uncapped levels | characters | M1 | P1 | done | M |
| [ETH-111](combat-items/ETH-111-ring-neck-slots.md) | Ring and neck equipment slots | combat-items | M1 | P1 | done | S |
| [ETH-113](sim-core/ETH-113-stairs-blocker-softlock.md) | A creature that never moves on the stairs soft-locks the run | sim-core | M1 | P1 | done | S |
| [ETH-118](combat-items/ETH-118-item-properties.md) | Item properties: per-instance layers that feed gearBundles, value, names and stacking | combat-items | M1 | P1 | done | M |
| [ETH-017](adventurer-ai/ETH-017-party-yield-in-corridors.md) | "Party members yield or swap places in narrow passages" | adventurer-ai | M1 | P2 | done | S |
| [ETH-019](map-renderer/ETH-019-map-overlays-goal-possession-flash.md) | "Map overlays: goal line, possession frame and hit flash" | map-renderer | M1 | P2 | done | S |
| [ETH-020](ui-shell/ETH-020-cycle-adventurers-key.md) | "Key to cycle the selected adventurer" | ui-shell | M1 | P2 | done | S |
| [ETH-021](ui-shell/ETH-021-show-sim-errors.md) | "Tell the player when the sim stops on an error" | ui-shell | M1 | P2 | done | S |
| [ETH-044](combat-items/ETH-044-enchant-curse-identify.md) | Enchantment, blessed and cursed items, and identification | combat-items | M1 | P2 | done | M |
| [ETH-066](ui-shell/ETH-066-possession.md) | Possess an adventurer and play them directly | ui-shell | M1 | P2 | done | M |
| [ETH-073](ui-shell/ETH-073-collapse-repeated-trace-lines.md) | Collapse repeated identical AI trace lines in the log | ui-shell | M1 | P2 | done | S |
| [ETH-075](combat-items/ETH-075-killer-named-death-line.md) | Name the killer in the death log line and the wipe summary | combat-items | M1 | P2 | done | S |
| [ETH-081](characters/ETH-081-attribute-secondary-jobs.md) | Give each attribute a second job | characters | M1 | P2 | done | M |
| [ETH-090](ui-shell/ETH-090-qe-cycle-keys.md) | Q and E cycle adventurers; diagonals while possessed | ui-shell | M1 | P2 | done | S |
| [ETH-022](tools-balance/ETH-022-validate-content-cli.md) | "Run content validation as a tsx command" | tools-balance | M1 | P3 | done | S |
| [ETH-039](characters/ETH-039-survey-roguelike-ideas.md) | Survey ideas from DCSS and NetHack with clean-room notes | characters | M1 | P3 | done | S |
| [ETH-076](tools-balance/ETH-076-sim-compare-stale-base-warning.md) | Sim compare warns when its base has moved since the branch was cut | tools-balance | M1 | P3 | done | S |
| [ETH-078](ui-shell/ETH-078-remove-unused-tab-empty-texts.md) | Remove the unused empty texts from SidePanel TAB_INFO | ui-shell | M1 | P3 | done | S |
| [ETH-079](sim-core/ETH-079-run-started-floor-type.md) | runStarted carries the first floor's type | sim-core | M1 | P3 | done | S |
| [ETH-080](tools-balance/ETH-080-monster-balance-pass.md) | Systemic monster, loot and progression balance pass (M1.5 capstone) | tools-balance | M1.5 | P1 | done | M |
| [ETH-133](dungeon-gen/ETH-133-extensible-danger-and-hidden-depth.md) | Extensible Danger scale, innate monster Bundles, and variable hidden dungeon depth | dungeon-gen | M1.5 | P1 | done | M |
| [ETH-134](bestiary/ETH-134-expand-old-delve-bestiary-and-templates.md) | Expand The Old Delve bestiary and templates across Danger bands | bestiary | M1.5 | P1 | done | M |
| [ETH-135](dungeon-gen/ETH-135-density-encounters-groups-and-patrols.md) | Threat-budget room encounters, cohesive group engagement, and corridor patrols | dungeon-gen | M1.5 | P1 | done | M |
| [ETH-136](quests/ETH-136-return-trip-deep-surge.md) | Return-trip deep surge: lower-floor threats and hunter patrols on ascent | quests | M1.5 | P1 | done | S |
| [ETH-145](tools-balance/ETH-145-party-size-ordering.md) | Fix the party-size inversion so solo is the hardest way to play | tools-balance | M1.5 | P1 | done | M |
| [ETH-142](combat-items/ETH-142-identify-secrecy-and-curse-safety.md) | Identification secrecy and curse safety for the idle player | combat-items | M1.6 | P1 | done | M |
| [ETH-143](tools-balance/ETH-143-content-spawn-reachability-check.md) | Content check that every discoverable def can actually appear in a run | tools-balance | M1.6 | P2 | done | S |
| [ETH-147](combat-items/ETH-147-consumable-hidden-property-leak.md) | Known-type potions and scrolls stop giving away a hidden blessing or curse | combat-items | M1.6 | P2 | done | S |
| [ETH-148](adventurer-ai/ETH-148-flee-hysteresis.md) | Smarter fleeing: hysteresis, only from real threats, and no walking back into danger | adventurer-ai | M1.6 | P2 | done | M |
| [ETH-152](tools-balance/ETH-152-parallel-sim-harness.md) | Run harness seeds in parallel across CPU cores | tools-balance | M1.6 | P2 | done | S |
| [ETH-144](codex-tooltips/ETH-144-per-monster-kill-tiers.md) | Per-monster Codex kill-tier thresholds for rare monsters | codex-tooltips | M1.6 | P3 | done | S |
| [ETH-149](tools-balance/ETH-149-tooling-hygiene.md) | Tooling hygiene: formatter policy, line endings and worktree-safe tests | tools-balance | M1.6 | P3 | done | S |
| [ETH-059](saves-platform/ETH-059-profile-saves.md) | Profile, banked currencies and versioned local saves | saves-platform | M2 | P0 | done | M |
| [ETH-023](town-meta/ETH-023-at-risk-run-currency.md) | Track run earnings as at-risk currency and lose 25% on a wipe | town-meta | M2 | P1 | done | M |
| [ETH-036](characters/ETH-036-milestone-unlocks-guild-hall.md) | Milestone-gated class and race unlocks bought at the Guild Hall | characters | M2 | P1 | done | M |
| [ETH-063](town-meta/ETH-063-upgrade-engine-town.md) | Upgrade engine and the Town screen with a Guild Hall | town-meta | M2 | P1 | done | M |
| [ETH-064](ui-shell/ETH-064-prepare-screen.md) | Prepare screen and building a run config from the profile | ui-shell | M2 | P1 | done | M |
| [ETH-065](codex-tooltips/ETH-065-codex-framework.md) | Codex tab, discovery tracking and Explain tooltips from content | codex-tooltips | M2 | P1 | done | M |
| [ETH-086](town-meta/ETH-086-foundations-and-tactics-trees.md) | Split upgrade trees into permanent Foundations and free Tactics | town-meta | M2 | P1 | done | M |
| [ETH-087](characters/ETH-087-class-mastery-levels.md) | Class Mastery XP: every run banks XP toward a guild-wide level per class | characters | M2 | P1 | done | M |
| [ETH-095](saves-platform/ETH-095-tauri-packaging-saves.md) | Tauri desktop packaging and save backend | saves-platform | M2 | P1 | done | M |
| [ETH-114](quests/ETH-114-objective-engine.md) | Objective engine: reusable objectives with progress, generalized from contracts | quests | M2 | P1 | done | M |
| [ETH-115](risk-omens/ETH-115-run-wide-modifiers.md) | Run-wide modifiers: a run-level BundleSource with sources, scopes, flags and tooltips | risk-omens | M2 | P1 | done | M |
| [ETH-117](bestiary/ETH-117-monster-templates.md) | Monster templates: prefixes, traits and named overrides layered on a base MonsterDef | bestiary | M2 | P1 | done | M |
| [ETH-119](lineage/ETH-119-adventurer-records.md) | Persistent adventurer records: a profile slice with identity, history, traits, peak level and death | lineage | M2 | P1 | done | M |
| [ETH-120](sim-core/ETH-120-run-chronicle.md) | Run chronicle: a durable list of a run's notable events, kept apart from the event buffer | sim-core | M2 | P1 | done | M |
| [ETH-121](behavior-rules/ETH-121-shared-conditions-requirements.md) | Shared conditions: run-scope conditions and a Requirement type usable outside rules | behavior-rules | M2 | P1 | done | M |
| [ETH-160](characters/ETH-160-starter-classes-and-races.md) | Starter set of unlockable classes and races | characters | M2 | P1 | done | M |
| [ETH-161](tools-balance/ETH-161-meta-loop-economy-balance.md) | Meta-loop economy balance pass (M2 capstone) | tools-balance | M2 | P1 | done | M |
| [ETH-172](town-meta/ETH-172-upgrade-ranks-and-tiers.md) | Upgrade engine supports ranked nodes and quest-locked tiers | town-meta | M2 | P1 | done | M |
| [ETH-047](ui-shell/ETH-047-highlights-auto-pause.md) | Highlights feed and optional auto-pause | ui-shell | M2 | P2 | done | M |
| [ETH-083](town-meta/ETH-083-gold-to-trophies.md) | Leftover gold converts to Trophies when the party exits | town-meta | M2 | P2 | done | S |
| [ETH-084](ui-shell/ETH-084-rematch-same-seed.md) | Rematch button on the run summary replays the same seed | ui-shell | M2 | P2 | done | S |
| [ETH-085](town-meta/ETH-085-depth-weighted-renown.md) | Depth-weighted Renown rewards | town-meta | M2 | P2 | done | S |
| [ETH-091](codex-tooltips/ETH-091-codex-hints-kill-tiers.md) | Codex hints for undiscovered entries and kill-count tiers | codex-tooltips | M2 | P2 | done | M |
| [ETH-092](codex-tooltips/ETH-092-codex-two-pane-modal.md) | Codex as a wide two-pane modal | codex-tooltips | M2 | P2 | done | M |
| [ETH-093](town-meta/ETH-093-building-unlock-quests.md) | Unlock town buildings by finishing a quest for each | town-meta | M2 | P2 | done | M |
| [ETH-131](tools-balance/ETH-131-contract-and-property-guards.md) | Cross-domain contract and property-based test guards (honesty, secrecy, potency, discoverability) | tools-balance | M2 | P2 | done | S |
| [ETH-157](dungeon-gen/ETH-157-split-encounters-module.md) | Split src/sim/combat/encounters.ts into focused modules | dungeon-gen | M2 | P2 | done | M |
| [ETH-158](tools-balance/ETH-158-split-headless-tool.md) | Split tools/headless.ts into focused modules | tools-balance | M2 | P2 | done | M |
| [ETH-170](town-meta/ETH-170-building-tier-quests.md) | Building-tier quests open each building's next tier | town-meta | M2 | P2 | done | M |
| [ETH-171](town-meta/ETH-171-sell-carried-items.md) | Items carried out of the dungeon sell for Trophies | town-meta | M2 | P2 | done | S |
| [ETH-175](ui-shell/ETH-175-disabled-button-tooltips.md) | Kit button that explains why it is disabled, with a tooltip | ui-shell | M2 | P2 | done | S |
| [ETH-176](characters/ETH-176-class-starting-kits.md) | Classes start each run with a kit of gear | characters | M2 | P1 | done | S |
| [ETH-177](characters/ETH-177-reprice-finesse.md) | Reprice Finesse so classes can share one point budget | characters | M2 | P1 | done | M |
| [ETH-178](tools-balance/ETH-178-sim-mixed-party.md) | Sim harness option for a random mixed party, as players get it | tools-balance | M2 | P2 | done | S |
| [ETH-180](town-meta/ETH-180-ranked-tooltip-stacking.md) | Stat tooltips name a ranked upgrade once, with its rank count | town-meta | M2 | P3 | done | S |
| [ETH-181](ui-shell/ETH-181-whole-number-stats.md) | Show derived stats the way combat uses them, as whole numbers | ui-shell | M2 | P3 | done | S |
| [ETH-183](ui-shell/ETH-183-trophies-tooltip-single-source.md) | One source for the Trophies tooltip text | ui-shell | M2 | P3 | done | S |
| [ETH-184](characters/ETH-184-kill-identify-reveal-conditions.md) | Run-scope kill and identify counts, so the Reaver and Lorekeeper get their intended reveals | characters | M2 | P2 | done | S |
| [ETH-048](town-meta/ETH-048-run-history.md) | Run history list | town-meta | M2 | P3 | done | S |
| [ETH-074](town-meta/ETH-074-locked-buildings.md) | Town buildings unlocked by milestones | town-meta | M2 | P3 | done | S |
| [ETH-077](ui-shell/ETH-077-prepare-attribute-previews.md) | Show attribute previews in the Prepare screen's class and race selects | ui-shell | M2 | P3 | done | S |
| [ETH-132](town-meta/ETH-132-rescale-guild-hall-renown-costs.md) | Rebuild the Guild Hall tree deeper, with ranked nodes and tiered costs | town-meta | M2.1 | P1 | done | M |
| [ETH-159](town-meta/ETH-159-smithy-tree.md) | Smithy upgrade tree spent in Trophies | town-meta | M2.1 | P1 | done | M |
| [ETH-187](town-meta/ETH-187-guild-hall-mechanic-nodes.md) | Guild Hall nodes that need new mechanics - Field Rations, Extraction Drills, Waymark Lanterns, Mystery Crate | town-meta | M2.1 | P1 | done | M |
| [ETH-188](town-meta/ETH-188-smithy-mechanic-nodes.md) | Smithy nodes that need new mechanics - Maker's Marks, class-tier kits, Forge Stamps, Apprentice Trinket, Field Salvage Kit | town-meta | M2.1 | P1 | done | M |
| [ETH-185](risk-omens/ETH-185-minimal-omen-system.md) | Minimal Omen system with ranks, one reward multiplier and a Prepare toggle, unlocked by town nodes | risk-omens | M2.2 | P1 | done | M |
| [ETH-186](risk-omens/ETH-186-first-town-omens.md) | The first four Omens and their town-tree unlock nodes | risk-omens | M2.2 | P1 | done | M |
| [ETH-191](risk-omens/ETH-191-omens-that-bite.md) | Make Stalker's Ledger, Cursed Hoards and Armed Warbands cost win rate | risk-omens | M2.2 | P1 | done | S |
| [ETH-192](behavior-rules/ETH-192-ability-tags.md) | Ability tags - abilities, consumables and wands declare what they do, and the AI picks the best of a tag | behavior-rules | M3 | P1 | ready | M |
| [ETH-162](behavior-rules/ETH-162-rules-editor.md) | Tactics engine - tactic options as content that build each adventurer's rules | behavior-rules | M3 | P1 | ready | M |
| [ETH-193](behavior-rules/ETH-193-roles-ranges-focuses.md) | Roles, ranges and focuses - Tank, Healer, Damage and Scout; engagement distance; target choice | behavior-rules | M3 | P1 | idea | M |
| [ETH-194](behavior-rules/ETH-194-habits-and-slots.md) | Habits and habit slots - several per adventurer, with exclusive pairs | behavior-rules | M3 | P1 | idea | M |
| [ETH-196](behavior-rules/ETH-196-tactics-panel.md) | Tactics panel, party-card intent and the Prepare tactics column | behavior-rules | M3 | P1 | idea | M |
| [ETH-197](town-meta/ETH-197-library-building-quest.md) | The Library building and its building quest | town-meta | M3 | P1 | ready | S |
| [ETH-163](behavior-rules/ETH-163-library-tree.md) | Library tree unlocks tactics and habit slots | behavior-rules | M3 | P1 | idea | M |
| [ETH-164](behavior-rules/ETH-164-rule-presets.md) | Saved tactics loadouts for the party and each adventurer, ready for talent builds | behavior-rules | M3 | P1 | idea | S |
| [ETH-165](tools-balance/ETH-165-rules-balance-pass.md) | Tactics balance pass (M3 capstone) | tools-balance | M3 | P1 | idea | M |
| [ETH-189](adventurer-ai/ETH-189-flee-return-oscillation.md) | Break the flee-and-return loop against a ranged foe | adventurer-ai | M3 | P2 | ready | S |
| [ETH-071](town-meta/ETH-071-doctrine-clear-or-stairs.md) | Party stances - Steady, Cautious, Reckless, Delve, Plunder and Fall back | town-meta | M3 | P2 | idea | M |
| [ETH-151](behavior-rules/ETH-151-formation-doctrine.md) | Formation tactic - Stick together, Loose or Spread out | behavior-rules | M3 | P2 | idea | S |
| [ETH-154](adventurer-ai/ETH-154-smarter-escape-direction.md) | Smarter escape direction: flee toward allies, stairs or home instead of just away | adventurer-ai | M3 | P2 | ready | M |
| [ETH-195](behavior-rules/ETH-195-controller-role.md) | Controller role and Softens targets habit, with a stun status and the first control and debuff sources | behavior-rules | M3 | P2 | idea | M |
| [ETH-035](characters/ETH-035-proficiencies-aptitudes.md) | Class equipment proficiencies and race aptitudes | characters | M4 | P2 | idea | M |
| [ETH-037](characters/ETH-037-class-signature-abilities.md) | A signature ability per class | characters | M4 | P2 | idea | M |
| [ETH-038](characters/ETH-038-class-aware-ai-roles.md) | Class fit for tactics - class-only options and bonuses for a good fit | characters | M4 | P2 | idea | M |
| [ETH-088](characters/ETH-088-class-mastery-trees.md) | Talent tree engine: three trees per class and a build per adventurer | characters | M4 | P2 | idea | M |
| [ETH-146](tools-balance/ETH-146-composition-balance-pass.md) | Composition and rules balance pass (M4 capstone) | tools-balance | M4 | P2 | idea | M |
| [ETH-173](characters/ETH-173-resurrection-class.md) | A class that can resurrect a fallen party member during a run | characters | M4 | P3 | idea | M |
| [ETH-179](characters/ETH-179-corpse-eating-race.md) | A woodland race that heals by consuming the fallen but can't drink healing potions | characters | M4 | P3 | idea | M |
| [ETH-182](characters/ETH-182-attribute-stat-revisit.md) | Revisit attributes and derived stats, starting with Grit | characters | M4 | P2 | idea | M |
| [ETH-041](bestiary/ETH-041-named-uniques.md) | Named uniques and bosses | bestiary | M5 | P2 | idea | M |
| [ETH-042](bestiary/ETH-042-monster-families-floor-themes.md) | Monster families and floor themes | bestiary | M5 | P2 | idea | M |
| [ETH-045](combat-items/ETH-045-affixes-artifacts.md) | Light affixes and named artifacts | combat-items | M5 | P2 | idea | M |
| [ETH-052](bestiary/ETH-052-elites-mini-bosses.md) | Elite monsters and mini-bosses with better loot | bestiary | M5 | P2 | idea | M |
| [ETH-054](combat-items/ETH-054-food-buffs.md) | Food as consumables that grant short-term buffs | combat-items | M5 | P2 | idea | M |
| [ETH-153](tools-balance/ETH-153-party-scaled-return-surge.md) | Scale the return-trip surge with party size | tools-balance | M5 | P2 | idea | M |
| [ETH-155](combat-items/ETH-155-smarter-identify-scrolls.md) | Smarter Scroll of Identify use: better targets, optionally skip consumables | combat-items | M5 | P2 | idea | S |
| [ETH-166](tools-balance/ETH-166-foes-and-loot-balance-pass.md) | Foes and loot balance pass (M5 capstone) | tools-balance | M5 | P2 | idea | M |
| [ETH-097](bestiary/ETH-097-sleeping-monsters-stealth.md) | Sleeping monsters and stealth | bestiary | M5 | P3 | idea | M |
| [ETH-109](bestiary/ETH-109-ethan-rare-boss.md) | Ethan, an extremely rare and very weak boss | bestiary | M5 | P3 | idea | S |
| [ETH-112](combat-items/ETH-112-weighted-gear-score.md) | Weighted gear score so auto-equip can take trade-offs | combat-items | M5 | P3 | idea | M |
| [ETH-130](combat-items/ETH-130-more-enchantments.md) | Expand the enchantment pool with additional effects and triggers | combat-items | M5 | P3 | idea | M |
| [ETH-150](codex-tooltips/ETH-150-rare-monster-codex-polish.md) | Codex polish for rare monsters: a faster-reveal hint and a lore-tier content warning | codex-tooltips | M5 | P3 | idea | S |
| [ETH-156](codex-tooltips/ETH-156-hidden-blessing-codex-help.md) | Codex help text: hidden blessings and mixed stacks of potions and scrolls | codex-tooltips | M5 | P3 | idea | S |
| [ETH-116](dungeon-gen/ETH-116-dungeon-encounters.md) | Dungeon encounters: placed interactive features with an interact action, choices and outcomes | dungeon-gen | M6 | P1 | ready | M |
| [ETH-026](quests/ETH-026-slay-named-foe-contract.md) | Slay-named-foe contract | quests | M6 | P2 | idea | M |
| [ETH-027](quests/ETH-027-gather-delve-contracts.md) | Gather and Delve contracts | quests | M6 | P2 | idea | M |
| [ETH-028](quests/ETH-028-contract-slots-upgrade.md) | Contract slots as a Guild Hall upgrade | quests | M6 | P2 | idea | S |
| [ETH-029](quests/ETH-029-bounty-board.md) | Bounty board on the Prepare screen; bounty rewards are at risk | quests | M6 | P2 | idea | M |
| [ETH-031](quests/ETH-031-quest-rule-conditions-ai.md) | Quest rule conditions and objective weighting in the AI | quests | M6 | P2 | idea | M |
| [ETH-067](risk-omens/ETH-067-omens-conducts-core.md) | More starter Omens and conduct tracking | risk-omens | M6 | P2 | idea | M |
| [ETH-129](town-meta/ETH-129-guild-hall-constant-respawn.md) | Guild Hall upgrade: constant floor respawns on revisit | town-meta | M6 | P2 | idea | S |
| [ETH-072](dungeon-gen/ETH-072-fountains.md) | Fountains with a documented effect table and a drink action | dungeon-gen | M6 | P2 | done | M |
| [ETH-167](tools-balance/ETH-167-quests-and-risk-balance-pass.md) | Quests, Omens and reward multiplier balance pass (M6 capstone) | tools-balance | M6 | P2 | idea | M |
| [ETH-030](quests/ETH-030-bounty-encounters.md) | Bounty encounters inside the dungeon | quests | M6 | P3 | idea | M |
| [ETH-046](dungeon-gen/ETH-046-traps-searching.md) | Traps and searching | dungeon-gen | M6 | P3 | idea | M |
| [ETH-053](risk-omens/ETH-053-ravenous-omen-without-food.md) | Redefine the Ravenous Omen for food buffs (no hunger) | risk-omens | M6 | P3 | idea | S |
| [ETH-094](adventurer-ai/ETH-094-fountain-avoid-harmful.md) | The AI avoids fountain draughts known to be harmful | adventurer-ai | M6 | P3 | done | S |
| [ETH-105](risk-omens/ETH-105-cursed-modifiers-mid-run.md) | Cursed modifiers found in the dungeon | risk-omens | M6 | P3 | idea | M |
| [ETH-141](quests/ETH-141-scale-contract-rewards-by-depth.md) | Scale contract rewards by completion depth and balance M2 payouts | quests | M6 | P3 | idea | S |
| [ETH-122](content/ETH-122-seeded-text-generator.md) | Seeded text generator: grammar templates for names, titles, epitaphs, ballads and backstories | content | M7 | P1 | done | M |
| [ETH-123](combat-items/ETH-123-allied-creatures.md) | Allied non-party creatures: actors that fight with the party without being members | combat-items | M7 | P1 | ready | M |
| [ETH-068](lineage/ETH-068-roster-lineage-core.md) | Persistent roster, graveyard and Graveyard tab | lineage | M7 | P2 | idea | M |
| [ETH-069](lineage/ETH-069-gravestones-heirlooms.md) | Gravestones and heirlooms in the dungeon | lineage | M7 | P2 | idea | M |
| [ETH-124](town-meta/ETH-124-tavern-veterans-retirement.md) | Retire veterans to Tavern jobs for permanent passive bonuses | town-meta | M7 | P2 | idea | M |
| [ETH-168](tools-balance/ETH-168-lineage-balance-pass.md) | Lineage balance pass (M7 capstone) | tools-balance | M7 | P2 | idea | M |
| [ETH-032](quests/ETH-032-rescue-contract.md) | Rescue contract | quests | M7 | P3 | idea | M |
| [ETH-089](lineage/ETH-089-rare-dungeon-recruits.md) | Rare adventurers met in the dungeon who join the party | lineage | M7 | P3 | idea | M |
| [ETH-099](lineage/ETH-099-unique-carrying-heirloom.md) | A monster that killed an adventurer returns carrying their heirloom | lineage | M7 | P3 | idea | M |
| [ETH-101](bestiary/ETH-101-nemesis-system.md) | Nemesis system | bestiary | M7 | P3 | idea | M |
| [ETH-103](lineage/ETH-103-bards-ballads.md) | Bard's ballads from run highlights | lineage | M7 | P3 | idea | M |
| [ETH-104](characters/ETH-104-personality-quirks.md) | Personality quirks | characters | M7 | P3 | idea | M |
| [ETH-108](town-meta/ETH-108-guild-trophy-room.md) | Guild trophy room | town-meta | M7 | P3 | idea | M |
| [ETH-125](lineage/ETH-125-ghost-allies.md) | Ghosts at graves, hostile or allied with the Ossuary | lineage | M7 | P3 | idea | M |
| [ETH-126](lineage/ETH-126-descendants.md) | Descendant recruits inherit a trait from a fallen adventurer | lineage | M7 | P3 | idea | S |
| [ETH-051](lineage/ETH-051-gravestone-interactions.md) | Gravestone interactions: minor loot, a patron boon and an epitaph | lineage | M8 | P2 | idea | M |
| [ETH-070](deities/ETH-070-deity-core.md) | Patron deities with a blessing, a taboo and Favor | deities | M8 | P2 | idea | M |
| [ETH-128](saves-platform/ETH-128-time-away-catch-up.md) | Time-away catch-up simulation and summary | saves-platform | M8 | P2 | idea | M |
| [ETH-169](tools-balance/ETH-169-gods-and-world-balance-pass.md) | Deities, merchants and themed dungeons balance pass (M8 capstone) | tools-balance | M8 | P2 | idea | M |
| [ETH-174](town-meta/ETH-174-cartographer.md) | The Cartographer building | town-meta | M8 | P2 | idea | M |
| [ETH-190](town-meta/ETH-190-better-loot-nodes.md) | Cartographer Tier I node that raises the quality of dungeon loot | town-meta | M8 | P2 | idea | S |
| [ETH-049](dungeon-gen/ETH-049-dungeon-merchants.md) | Dungeon merchants | dungeon-gen | M8 | P3 | idea | M |
| [ETH-098](dungeon-gen/ETH-098-hand-made-vaults.md) | Hand-made room vaults | dungeon-gen | M8 | P3 | idea | M |
| [ETH-107](dungeon-gen/ETH-107-dungeon-events.md) | Rare floor-wide dungeon events | dungeon-gen | M8 | P3 | idea | M |
| [ETH-137](dungeon-gen/ETH-137-themed-dungeon-drowned-cisterns.md) | "Themed dungeon: The Drowned Cisterns" | dungeon-gen | M8 | P3 | idea | M |
| [ETH-138](dungeon-gen/ETH-138-themed-dungeon-mycelial-warren.md) | "Themed dungeon: The Mycelial Warren" | dungeon-gen | M8 | P3 | idea | M |
| [ETH-139](dungeon-gen/ETH-139-themed-dungeon-ash-kilns.md) | "Themed dungeon: The Ash Kilns" | dungeon-gen | M8 | P3 | idea | M |
| [ETH-140](dungeon-gen/ETH-140-themed-dungeon-salt-catacombs.md) | "Themed dungeon: The Salt Catacombs" | dungeon-gen | M8 | P3 | idea | M |
| [ETH-018](ui-shell/ETH-018-trim-font-bundle.md) | "Ship only the font files the app needs" | ui-shell | later | P3 | done | S |
| [ETH-050](combat-items/ETH-050-summons-pets.md) | Summons and pets | combat-items | later | P3 | idea | M |
| [ETH-096](combat-items/ETH-096-rechargeable-wands.md) | Wands that recharge on each new floor | combat-items | later | P3 | idea | M |
| [ETH-100](bestiary/ETH-100-scavenger-family.md) | Scavenger monster family | bestiary | later | P3 | idea | M |
| [ETH-102](dungeon-gen/ETH-102-rival-guild.md) | A rival guild party in the dungeon | dungeon-gen | later | P3 | idea | M |
| [ETH-106](combat-items/ETH-106-pets-that-level.md) | Pets that persist and level up | combat-items | later | P3 | idea | M |
| [ETH-127](town-meta/ETH-127-achievements.md) | Achievements tracked with the objective engine | town-meta | later | P3 | idea | M |
