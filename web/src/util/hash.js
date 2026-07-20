/**
 * Small, stable, dependency-free string hash used only to build deterministic
 * IDs for entities that Google returns without one (topics, links, etc.).
 *
 * This is NOT cryptographic. It exists so the browser scraper does not need
 * `node:crypto`, which keeps every core module importable in both Node (for
 * tests) and the browser. The exact digest value is irrelevant — the viewer
 * treats IDs as opaque strings — it only needs to be stable for equal inputs.
 */
export function shortHash(value) {
  const str = String(value);
  // FNV-1a 32-bit, run twice with different offsets for a 16-hex-char output.
  const a = fnv1a(str, 0x811c9dc5);
  const b = fnv1a(str, 0x01000193 ^ 0xdeadbeef);
  return (toHex8(a) + toHex8(b)).slice(0, 16);
}

function fnv1a(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    // h *= 16777619 (FNV prime) without overflow surprises
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function toHex8(n) {
  return (n >>> 0).toString(16).padStart(8, '0');
}

export default shortHash;
