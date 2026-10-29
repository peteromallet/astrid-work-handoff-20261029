import { astridObjectContentPath } from '@/integrations/astrid/workspaceV1.ts';
import { astridBase } from '@/integrations/runtime/connection.ts';

/**
 * Display-URL addressing for managed media.
 *
 * Uses the `assetBaseUrl ?? astridBase()` posture: every managed-media reference becomes a
 * byte-route address (`GET /projects/:slug/media/:id/content`, Range/ETag)
 * under the Astrid base, read at call time: same-origin through the
 * per-boot-token-injecting dev proxy, or the loopback gateway on the hosted
 * build. Never a cross-origin storage host.
 *
 * Pure and idempotent: references that are already display addresses pass
 * through untouched, so callers can apply it at every point where a stored
 * `location`/`thumbnail_url` becomes a display URL.
 */

const ABSOLUTE_URL_PATTERN = /^(https?:|blob:|data:)/;


export function bridgeMediaUrl(
  projectSlug: string | null | undefined,
  mediaRef: string | null | undefined,
  baseUrl: string = astridBase(),
): string {
  // Preserve the placeholder contract of the previous display-URL layer.
  if (!mediaRef) {
    return '/placeholder.svg';
  }

  // Absolute (legacy remote rows, blob:/data: locals) and already-rooted
  // (content-route) addresses are final — never re-prefixed.
  if (ABSOLUTE_URL_PATTERN.test(mediaRef) || mediaRef.startsWith('/')) {
    return mediaRef;
  }

  // Neutral Runtime objects are addressed directly by their content digest;
  // legacy media IDs continue to use the project-scoped compatibility route.
  if (mediaRef.startsWith('sha256:')) {
    const base = baseUrl.replace(/\/+$/, '');
    return `${base}/v1/objects/${encodeURIComponent(mediaRef)}`;
  }

  // Without a project scope there is nothing to address the bytes under;
  // hand the raw reference back rather than fabricating a broken route.
  if (!projectSlug) {
    return mediaRef;
  }

  const base = baseUrl.replace(/\/+$/, '');
  return `${base}${astridObjectContentPath(projectSlug, mediaRef)}`;
}
