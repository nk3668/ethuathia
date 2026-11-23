/**
 * Resolves optional `{ min?, max? }` bounds against defaults, clamped to at least `floor`
 * (default `0`). When `options.max` is given, `max` is applied before clamping `min <= max`, so
 * passing `{ max: 0 }` disables a range instead of being bumped up by a positive `defaultMin`
 * (ETH-131). When only `options.min` is given, `max` expands if needed so `min <= max` holds.
 */
export function clampRange(
  options: { readonly min?: number; readonly max?: number } | undefined,
  defaults: { readonly min: number; readonly max: number },
  floor = 0,
): { min: number; max: number } {
  if (options?.max !== undefined) {
    const max = Math.max(floor, options.max);
    const min = Math.min(max, Math.max(floor, options.min ?? defaults.min));
    return { min, max };
  }
  const min = Math.max(floor, options?.min ?? defaults.min);
  const max = Math.max(min, Math.max(floor, defaults.max));
  return { min, max };
}
