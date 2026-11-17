# Backlog Index

**Next ID: ETH-071**

Sorted by milestone, then priority. See [README.md](README.md) for conventions.

## Epics

| Epic | Title | Status | Milestones |
|---|---|---|---|
| [project-setup](project-setup/_epic.md) | Project setup and tooling | active | M0 |
| [sim-core](sim-core/_epic.md) | Simulation core | active | M0, M1 |
| [dungeon-gen](dungeon-gen/_epic.md) | Dungeon generation | active | M0, M1, M4, M5, M6 |
| [adventurer-ai](adventurer-ai/_epic.md) | Decision engine and baseline AI | active | M0, M1 |
| [behavior-rules](behavior-rules/_epic.md) | Behavior rules | active | M3 |
| [combat-items](combat-items/_epic.md) | Combat, items and statuses | active | M1, M2, later |
| [content](content/_epic.md) | Content definitions | active | M0, M1, M2, M3, M4, M5, M6 |
| [town-meta](town-meta/_epic.md) | Town, currencies and upgrades | active | M2, M3, M5 |
| [saves-platform](saves-platform/_epic.md) | Saves, desktop packaging and time-away | active | M2, M6 |
| [risk-omens](risk-omens/_epic.md) | Omens and conducts | active | M4 |
| [lineage](lineage/_epic.md) | Lineage | active | M5 |
| [deities](deities/_epic.md) | Deities and altars | active | M6 |
| [ui-shell](ui-shell/_epic.md) | UI shell and kit | active | M0, M1, M2 |
| [map-renderer](map-renderer/_epic.md) | Map renderer | active | M0, M1 |
| [codex-tooltips](codex-tooltips/_epic.md) | Codex and tooltips | active | M2 |
| [tools-balance](tools-balance/_epic.md) | Test and balance tooling | active | M0, M1 |
| [quests](quests/_epic.md) | Quests: contracts and bounties | active | M1, M2, M3, M4, M5 |
| [characters](characters/_epic.md) | Characters: attributes, classes and races | active | M1, M2, M3 |
| [bestiary](bestiary/_epic.md) | Bestiary: monsters, uniques and elites | active | M1, M2 |

## Items

| ID | Title | Epic | Milestone | Priority | Status | Size |
|---|---|---|---|---|---|---|
| [ETH-001](project-setup/ETH-001-scaffold-project.md) | Scaffold Vite, React, strict TS, Vitest and ESLint layer rules | project-setup | M0 | P0 | done | M |
| [ETH-002](sim-core/ETH-002-core-utilities.md) | Core utilities: seeded RNG streams, Grid and Registry | sim-core | M0 | P0 | done | M |
| [ETH-003](sim-core/ETH-003-run-state-entities.md) | Run state and entity model with serialize round-trip | sim-core | M0 | P0 | done | M |
| [ETH-004](sim-core/ETH-004-scheduler-step-loop.md) | Energy scheduler and step loop with commands and events | sim-core | M0 | P0 | done | M |
| [ETH-005](sim-core/ETH-005-action-pipeline.md) | Action pipeline: move, wait and open door | sim-core | M0 | P0 | done | S |
| [ETH-006](dungeon-gen/ETH-006-dungeon-gen-pipeline.md) | Dungeon gen pipeline: rooms-and-corridors floor | dungeon-gen | M0 | P0 | done | M |
| [ETH-007](sim-core/ETH-007-fov-map-memory.md) | FOV and map memory | sim-core | M0 | P0 | done | S |
| [ETH-008](sim-core/ETH-008-goal-maps-pathing.md) | Goal maps (Dijkstra) and pathing | sim-core | M0 | P0 | done | S |
| [ETH-009](adventurer-ai/ETH-009-decision-engine-baseline-explore.md) | Decision engine with baseline exploration, trace and stuck detection | adventurer-ai | M0 | P0 | done | M |
| [ETH-010](sim-core/ETH-010-sim-host.md) | SimHost: inline and Web Worker hosts, snapshot protocol and speed | sim-core | M0 | P0 | done | M |
| [ETH-013](map-renderer/ETH-013-canvas-map-renderer.md) | Canvas map renderer: glyph atlas, fog and camera follow | map-renderer | M0 | P0 | done | M |
| [ETH-011](ui-shell/ETH-011-tokens-fonts-kit.md) | Design tokens, bundled fonts and first kit primitives | ui-shell | M0 | P1 | done | M |
| [ETH-012](ui-shell/ETH-012-app-shell-layout.md) | App shell layout: top bar, party column, map area, tabs and log | ui-shell | M0 | P1 | done | M |
| [ETH-014](ui-shell/ETH-014-pause-speed-controls.md) | Pause, speed controls and keyboard shortcuts | ui-shell | M0 | P1 | done | S |
| [ETH-015](content/ETH-015-content-registry-first-defs.md) | Content registry with validation and first definitions | content | M0 | P1 | done | S |
| [ETH-016](tools-balance/ETH-016-determinism-headless-run.md) | Determinism test and headless run script | tools-balance | M0 | P1 | done | S |
| [ETH-055](sim-core/ETH-055-extension-seams.md) | Extension seams so feature work lands in per-domain files | sim-core | M1 | P0 | done | M |
| [ETH-056](tools-balance/ETH-056-invariants-soak-compare.md) | Safety net: state invariants, soak test, app-boot smoke test and sim compare | tools-balance | M1 | P0 | done | M |
| [ETH-057](combat-items/ETH-057-bundles-stats-statuses.md) | Bundles (modifiers, effects, triggers), stats with sources and timed statuses | combat-items | M1 | P0 | ready | M |
| [ETH-058](sim-core/ETH-058-multi-floor-descent.md) | Multiple floors: stairs, lazily generated floors and a baseline descend rule | sim-core | M1 | P0 | ready | M |
| [ETH-060](combat-items/ETH-060-monsters-melee-combat.md) | Monsters, melee combat and death | combat-items | M1 | P0 | ready | M |
| [ETH-061](combat-items/ETH-061-items-inventory-core.md) | Items on the floor, inventory, pickup and drop, and in-run gold | combat-items | M1 | P0 | ready | M |
| [ETH-062](sim-core/ETH-062-run-end-summary.md) | Run end (victory, retreat, wipe), run trackers, run summary and auto-restart | sim-core | M1 | P0 | ready | M |
| [ETH-024](quests/ETH-024-contracts-recover-relic.md) | Contract model and the Recover-relic contract; victory needs every contract plus the exit | quests | M1 | P1 | idea | M |
| [ETH-025](quests/ETH-025-return-trip.md) | Return trip: walk back up through explored floors, with light respawns | quests | M1 | P1 | idea | M |
| [ETH-033](characters/ETH-033-attributes-derived-stats.md) | Four attributes and the stats derived from them | characters | M1 | P1 | idea | M |
| [ETH-034](characters/ETH-034-xp-leveling-class-growth.md) | XP, leveling and per-class attribute growth | characters | M1 | P1 | idea | M |
| [ETH-040](bestiary/ETH-040-monster-roles.md) | Monster roles and role behaviors | bestiary | M1 | P1 | idea | M |
| [ETH-043](combat-items/ETH-043-equipment-slots-base-items.md) | Equipment slots and base item types | combat-items | M1 | P1 | idea | M |
| [ETH-019](map-renderer/ETH-019-map-overlays-goal-possession-flash.md) | Map overlays: goal line, possession frame and hit flash | map-renderer | M1 | P2 | idea | S |
| [ETH-017](adventurer-ai/ETH-017-party-yield-in-corridors.md) | Party members yield or swap places in narrow passages | adventurer-ai | M1 | P2 | done | S |
| [ETH-020](ui-shell/ETH-020-cycle-adventurers-key.md) | Key to cycle the selected adventurer | ui-shell | M1 | P2 | done | S |
| [ETH-021](ui-shell/ETH-021-show-sim-errors.md) | Tell the player when the sim stops on an error | ui-shell | M1 | P2 | done | S |
| [ETH-044](combat-items/ETH-044-enchant-curse-identify.md) | Enchantment, blessed and cursed items, and identification | combat-items | M1 | P2 | idea | M |
| [ETH-066](ui-shell/ETH-066-possession.md) | Possess an adventurer and play them directly | ui-shell | M1 | P2 | ready | M |
| [ETH-022](tools-balance/ETH-022-validate-content-cli.md) | Run content validation as a tsx command | tools-balance | M1 | P3 | done | S |
| [ETH-039](characters/ETH-039-survey-roguelike-ideas.md) | Survey ideas from DCSS and NetHack with clean-room notes | characters | M1 | P3 | done | S |
| [ETH-059](saves-platform/ETH-059-profile-saves.md) | Profile, banked currencies and versioned local saves | saves-platform | M2 | P0 | done | M |
| [ETH-023](town-meta/ETH-023-at-risk-run-currency.md) | Track run earnings as at-risk currency and lose 25% on a wipe | town-meta | M2 | P1 | idea | M |
| [ETH-063](town-meta/ETH-063-upgrade-engine-town.md) | Upgrade engine and the Town screen with a Guild Hall | town-meta | M2 | P1 | ready | M |
| [ETH-064](ui-shell/ETH-064-prepare-screen.md) | Prepare screen and building a run config from the profile | ui-shell | M2 | P1 | ready | M |
| [ETH-065](codex-tooltips/ETH-065-codex-framework.md) | Codex tab, discovery tracking and Explain tooltips from content | codex-tooltips | M2 | P1 | ready | M |
| [ETH-026](quests/ETH-026-slay-named-foe-contract.md) | Slay-named-foe contract | quests | M2 | P2 | idea | M |
| [ETH-027](quests/ETH-027-gather-delve-contracts.md) | Gather and Delve contracts | quests | M2 | P2 | idea | M |
| [ETH-028](quests/ETH-028-contract-slots-upgrade.md) | Contract slots as a Guild Hall upgrade | quests | M2 | P2 | idea | S |
| [ETH-029](quests/ETH-029-bounty-board.md) | Bounty board on the Prepare screen; bounty rewards are at risk | quests | M2 | P2 | idea | M |
| [ETH-035](characters/ETH-035-proficiencies-aptitudes.md) | Class equipment proficiencies and race aptitudes | characters | M2 | P2 | idea | M |
| [ETH-036](characters/ETH-036-milestone-unlocks-guild-hall.md) | Milestone-gated class and race unlocks bought at the Guild Hall | characters | M2 | P2 | idea | M |
| [ETH-041](bestiary/ETH-041-named-uniques.md) | Named uniques and bosses | bestiary | M2 | P2 | idea | M |
| [ETH-042](bestiary/ETH-042-monster-families-floor-themes.md) | Monster families and floor themes | bestiary | M2 | P2 | idea | M |
| [ETH-052](bestiary/ETH-052-elites-mini-bosses.md) | Elite monsters and mini-bosses with better loot | bestiary | M2 | P2 | idea | M |
| [ETH-045](combat-items/ETH-045-affixes-artifacts.md) | Light affixes and named artifacts | combat-items | M2 | P2 | idea | M |
| [ETH-047](ui-shell/ETH-047-highlights-auto-pause.md) | Highlights feed and optional auto-pause | ui-shell | M2 | P2 | idea | M |
| [ETH-054](combat-items/ETH-054-food-buffs.md) | Food as consumables that grant short-term buffs | combat-items | M2 | P2 | idea | M |
| [ETH-048](town-meta/ETH-048-run-history.md) | Run history list | town-meta | M2 | P3 | idea | S |
| [ETH-031](quests/ETH-031-quest-rule-conditions-ai.md) | Quest rule conditions and objective weighting in the AI | quests | M3 | P2 | idea | M |
| [ETH-037](characters/ETH-037-class-signature-abilities.md) | A signature ability per class | characters | M3 | P2 | idea | M |
| [ETH-038](characters/ETH-038-class-aware-ai-roles.md) | Class-aware AI roles | characters | M3 | P2 | idea | M |
| [ETH-067](risk-omens/ETH-067-omens-conducts-core.md) | Omens with ranks, the reward multiplier and conduct tracking | risk-omens | M4 | P2 | idea | M |
| [ETH-030](quests/ETH-030-bounty-encounters.md) | Bounty encounters inside the dungeon | quests | M4 | P3 | idea | M |
| [ETH-046](dungeon-gen/ETH-046-traps-searching.md) | Traps and searching | dungeon-gen | M4 | P3 | idea | M |
| [ETH-053](risk-omens/ETH-053-ravenous-omen-without-food.md) | Redefine the Ravenous Omen for food buffs (no hunger) | risk-omens | M4 | P3 | idea | S |
| [ETH-051](lineage/ETH-051-gravestone-interactions.md) | Gravestone interactions: minor loot, a patron boon and an epitaph | lineage | M5 | P2 | idea | M |
| [ETH-068](lineage/ETH-068-roster-lineage-core.md) | Persistent roster, graveyard and Graveyard tab | lineage | M5 | P2 | idea | M |
| [ETH-069](lineage/ETH-069-gravestones-heirlooms.md) | Gravestones and heirlooms in the dungeon | lineage | M5 | P2 | idea | M |
| [ETH-032](quests/ETH-032-rescue-contract.md) | Rescue contract | quests | M5 | P3 | idea | M |
| [ETH-070](deities/ETH-070-deity-core.md) | Patron deities with a blessing, a taboo and Favor | deities | M6 | P2 | idea | M |
| [ETH-049](dungeon-gen/ETH-049-dungeon-merchants.md) | Dungeon merchants | dungeon-gen | M6 | P3 | idea | M |
| [ETH-018](ui-shell/ETH-018-trim-font-bundle.md) | Ship only the font files the app needs | ui-shell | later | P3 | done | S |
| [ETH-050](combat-items/ETH-050-summons-pets.md) | Summons and pets | combat-items | later | P3 | idea | M |
