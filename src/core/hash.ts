/**
 * A fast, non-cryptographic 53-bit string hash, for telling run states apart in determinism tests
 * and the headless run report (docs/ARCHITECTURE.md §10). Never use it for anything that needs to
 * resist tampering.
 */

/**
 * Hashes the UTF-16 code units of `text` into 53 bits, returned as 14 lowercase hex digits.
 * Two lanes of multiply-xor mixing (the public-domain "cyrb53" construction) are folded together
 * at the end, so similar strings give unrelated hashes.
 */
export function hashText(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x9e3779b1);
    h2 = Math.imul(h2 ^ c, 0x5f356495);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 0x85ebca6b);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 0xc2b2ae35);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 0x85ebca6b);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 0xc2b2ae35);
  // 21 bits of h2 and all 32 of h1: 53 bits, so the result fits a double exactly too.
  return ((h2 >>> 0) & 0x1fffff).toString(16).padStart(6, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}
