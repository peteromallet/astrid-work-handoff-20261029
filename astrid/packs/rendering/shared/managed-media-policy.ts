/** Recognize only the product's managed object byte routes, without assuming a fixed gateway port. */
export function isManagedObjectUrl(src: string | null | undefined): boolean {
  if (!src) return false;
  const relative = src.startsWith('/') && !src.startsWith('//');
  try {
    const url = new URL(src, relative ? 'http://managed-proxy.invalid' : undefined);
    if (url.username || url.password || !['http:', 'https:'].includes(url.protocol)) return false;
    if (!relative && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return false;
    const match = /^\/api\/(?:astrid|runtime)\/v1\/objects\/([^/]+)$/.exec(url.pathname);
    return match !== null && /^[A-Za-z0-9][A-Za-z0-9._~:-]{0,255}$/.test(decodeURIComponent(match[1]));
  } catch {
    return false;
  }
}
