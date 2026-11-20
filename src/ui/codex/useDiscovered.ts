import { useMemo } from 'react';
import { mergeMonsterKills } from '../../meta';
import type { MonsterKills } from '../../meta';
import { mergeDiscoveries } from '../../sim';
import type { CodexDiscoveries } from '../../sim';
import { useProfileStore } from '../stores/profileStore';
import { useSimStore } from '../stores/simStore';

/**
 * Everything discovered: the profile's Codex plus what the current run has found so far (which
 * joins the profile when the run ends).
 */
export function useDiscovered(): CodexDiscoveries {
  const banked = useProfileStore((s) => s.profile.codex.entries);
  const live = useSimStore((s) => s.discoveries);
  return useMemo(() => mergeDiscoveries(banked, live), [banked, live]);
}

/**
 * Lifetime plus current-run (while unbanked) kill counts per monster content id (`monster.*`), for
 * the Codex kill-count tiers (ETH-091). Once the run's result has been banked into `profileStore`,
 * live kills are excluded so the final run is never counted twice.
 */
export function useMonsterKills(): MonsterKills {
  const banked = useProfileStore((s) => s.profile.codex.kills);
  const live = useSimStore((s) => s.monsterKills);
  const runBanked = useSimStore((s) => s.banked);
  return useMemo(() => (runBanked ? banked : mergeMonsterKills(banked, live)), [banked, live, runBanked]);
}

/**
 * Effective kill count for `id`: the recorded kill count, or at least 1 if the entry already has
 * the `'killed'` discovery mark (e.g. from a v1 save migrated before kill counts were tracked).
 */
export function monsterKillCount(id: string, discovered: CodexDiscoveries, kills: MonsterKills): number {
  const recorded = kills[id] ?? 0;
  const fromMark = discovered[id]?.includes('killed') === true ? 1 : 0;
  return Math.max(recorded, fromMark);
}
