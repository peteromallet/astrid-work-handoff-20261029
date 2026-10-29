// Cache policy for Runtime object reads, shared by every proxy hop (dev proxy,
// vite proxy, paired relay; the Runtime's browser door has its own copy). Plain .mjs so the
// dependency-free dev proxy script can import it without a TypeScript loader.

export const IMMUTABLE_OBJECT_CACHE_CONTROL = 'private, max-age=31536000, immutable';

// A digest-identified object: /v1/objects/sha256:<64 hex> (colon may be percent
// encoded). Content addressing is what makes the bytes immutable; ids that are
// not a digest, and every other route, keep the proxy's default (no-store).
const DIGEST_OBJECT_PATH = /^(?:\/api\/(?:runtime|astrid))?\/v1\/objects\/(?:sha256(?::|%3[aA]))?[0-9a-f]{64}$/;

/** True for GET/HEAD of a content-addressed object. The query string is ignored. */
export function isImmutableObjectRead(method, path) {
  const verb = String(method ?? '').toUpperCase();
  if (verb !== 'GET' && verb !== 'HEAD') return false;
  return DIGEST_OBJECT_PATH.test(String(path ?? '').split('?', 1)[0]);
}

/** Only successful (200/206) responses are cacheable; 304 revalidates an entry that already is. */
export function isCacheableObjectStatus(status) {
  return status === 200 || status === 206 || status === 304;
}

/** The Cache-Control a proxy should send for this response, or undefined to leave its default. */
export function objectCacheControl(method, path, status) {
  return isImmutableObjectRead(method, path) && isCacheableObjectStatus(status)
    ? IMMUTABLE_OBJECT_CACHE_CONTROL
    : undefined;
}
