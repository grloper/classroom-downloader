/**
 * Isomorphic, URL-safe base64 for UTF-8 strings. Works in the browser
 * (btoa/atob) and in Node (Buffer) so share-link encoding is testable.
 */

export function encodeBase64Url(str) {
  const bytes = utf8Encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  const b64 = toBase64(binary);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeBase64Url(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + padding(b64url.length);
  const binary = fromBase64(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return utf8Decode(bytes);
}

function padding(len) {
  const mod = len % 4;
  return mod === 0 ? '' : '='.repeat(4 - mod);
}

function toBase64(binary) {
  if (typeof btoa === 'function') return btoa(binary);
  return Buffer.from(binary, 'binary').toString('base64');
}

function fromBase64(b64) {
  if (typeof atob === 'function') return atob(b64);
  return Buffer.from(b64, 'base64').toString('binary');
}

function utf8Encode(str) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
  return new Uint8Array(Buffer.from(str, 'utf-8'));
}

function utf8Decode(bytes) {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
  return Buffer.from(bytes).toString('utf-8');
}
