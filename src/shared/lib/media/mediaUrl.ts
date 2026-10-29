import { astridBase, runtimeApiBase } from '@/integrations/runtime/connection.ts';

const FULL_URL_PATTERN = /^(https?:|blob:|data:)/;

/**
 * Managed media is a path under the Runtime or Astrid media base, read now: `/api/...` same-origin,
 * or the gateway's absolute base (those arrive as full URLs and pass through above). Anything
 * else is an unmanaged path, and only that goes to `VITE_API_TARGET_URL`.
 */
const isManagedMediaPath = (path: string): boolean =>
  [astridBase(), runtimeApiBase()].some((base) => {
    if (!path.startsWith(base)) return false;
    const next = path.charAt(base.length);
    return next === '' || next === '/' || next === '?' || next === '#';
  });

const withCacheBust = (url: string): string => {
  const hashIndex = url.indexOf('#');
  const urlWithoutHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : url.slice(hashIndex);

  if (/(?:\?|&)t=[^&#]*/.test(urlWithoutHash)) {
    return url;
  }
  const separator = urlWithoutHash.includes('?') ? '&' : '?';
  return `${urlWithoutHash}${separator}t=${Date.now()}${hash}`;
};

const getEffectiveBaseUrl = (): string => {
  if (typeof window === 'undefined') {
    return import.meta.env.VITE_API_TARGET_URL || '';
  }

  const configuredBase = import.meta.env.VITE_API_TARGET_URL || window.location.origin;
  if (!configuredBase.includes('localhost')) {
    return configuredBase;
  }

  const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  return isLocalHost ? configuredBase : window.location.origin;
};

export const getDisplayUrl = (
  relativePath: string | undefined | null,
  forceRefresh: boolean = false
): string => {
  if (!relativePath) {
    return '/placeholder.svg';
  }

  if (FULL_URL_PATTERN.test(relativePath)) {
    return forceRefresh ? withCacheBust(relativePath) : relativePath;
  }

  // bridgeMediaUrl already resolved managed media to a byte route under the media base.
  // Keep that route intact so display normalization does not send it to the
  // development API target, which may be a different service.
  if (isManagedMediaPath(relativePath)) {
    return forceRefresh ? withCacheBust(relativePath) : relativePath;
  }

  const base = getEffectiveBaseUrl().replace(/\/$/, '');
  const normalizedPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  const resolvedUrl = `${base}${normalizedPath}`;

  if (forceRefresh || (relativePath.includes('flipped_') && !relativePath.includes('?t='))) {
    return withCacheBust(resolvedUrl);
  }

  return resolvedUrl;
};

export const stripQueryParameters = (url: string | undefined | null): string => {
  if (!url) return '';
  const questionMarkIndex = url.indexOf('?');
  if (questionMarkIndex === -1) return url;
  return url.substring(0, questionMarkIndex);
};
