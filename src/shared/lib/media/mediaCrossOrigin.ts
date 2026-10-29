import { isManagedObjectUrl } from '@astrid/packs/rendering/shared/managed-media-policy';

/**
 * `crossOrigin` attribute value for an `<img>`, `<video>` or canvas source.
 *
 * Managed object routes get `'anonymous'`: the gateway authorizes media by the
 * `Origin` header, which a cross-origin element sends only in CORS mode, and
 * it also lets the canvas stay untainted. Relative object routes use the same
 * policy through the dev proxy; other URLs retain their existing media mode.
 */
export function mediaCrossOrigin(url: string | null | undefined): 'anonymous' | undefined {
  return isManagedObjectUrl(url) ? 'anonymous' : undefined;
}

/** The gateway injects Runtime credentials itself and refuses browser cookies and authorization. */
export function mediaFetchCredentials(url: string, otherwise: RequestCredentials = 'same-origin'): RequestCredentials {
  return isManagedObjectUrl(url) ? 'omit' : otherwise;
}
