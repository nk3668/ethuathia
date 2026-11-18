import { useMemo } from 'react';
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
