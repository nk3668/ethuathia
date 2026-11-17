/**
 * Color math for the map. Remembered tiles (docs/VISUAL-DESIGN.md §4.2) are the same glyph,
 * desaturated and at about 40% brightness against the map background.
 */

export type Rgb = readonly [r: number, g: number, b: number];

/** `#rrggbb` (or `#rgb`) to its channels. Throws on anything else. */
export function parseHex(hex: string): Rgb {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) throw new Error(`Not a hex color: "${hex}"`);
  const digits = m[1].length === 3 ? [...m[1]].map((d) => d + d).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)) as unknown as Rgb;
}

/** Channels to `#rrggbb`, rounding and clamping each one. */
export function toHex(rgb: Rgb): string {
  return `#${rgb.map((c) => Math.round(Math.min(Math.max(c, 0), 255)).toString(16).padStart(2, '0')).join('')}`;
}

/** How a remembered tile differs from one in view. */
export const REMEMBERED = {
  /** How much of the color's saturation is kept. */
  saturation: 0.3,
  /** How far from the background toward the (desaturated) color it is drawn. */
  brightness: 0.4,
} as const;

/** The color a glyph is drawn in on a remembered tile, over `background`. */
export function rememberedColor(color: string, background: string): string {
  const [r, g, b] = parseHex(color);
  const bg = parseHex(background);
  const grey = 0.299 * r + 0.587 * g + 0.114 * b;
  const desaturated = [r, g, b].map((c) => grey + (c - grey) * REMEMBERED.saturation);
  return toHex(desaturated.map((c, i) => (bg[i] as number) + (c - (bg[i] as number)) * REMEMBERED.brightness) as unknown as Rgb);
}
