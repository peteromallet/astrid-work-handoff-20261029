export function buildHomeDocumentHandoffUrl(
  location: Pick<Location, 'search' | 'hash'>,
  origin: string,
): string {
  const target = new URL('/home', origin);
  target.search = location.search;
  target.hash = location.hash;
  return target.href;
}
