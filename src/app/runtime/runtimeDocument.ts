const LEGACY_KEYS = ['runtime', 'runtimeProject', 'runtimeTimeline', 'localProject', 'localTimeline'];

function isRuntimeDocumentRoute(pathname: string): boolean {
  return pathname === '/tools' || pathname.startsWith('/tools/');
}

/** Routes owned by the authenticated app workspace. */
export function isWorkspaceRoute(pathname: string): boolean {
  return isRuntimeDocumentRoute(pathname) || pathname === '/shots' || pathname === '/art';
}

/** Canonical project/timeline URLs always use Runtime authority. */
export function isRuntimeDocumentMode(
  search = typeof window === 'undefined' ? '' : window.location.search,
  pathname = typeof window === 'undefined' ? '' : window.location.pathname,
): boolean {
  if (!isRuntimeDocumentRoute(pathname)) return false;
  const params = new URLSearchParams(search);
  return Boolean(params.get('project')?.trim() || params.get('timeline')?.trim())
    || pathname === '/tools/video-editor';
}

/** Return the URL-owned canonical Runtime project for a document route. */
export function getRuntimeDocumentProjectId(
  search = typeof window === 'undefined' ? '' : window.location.search,
  pathname = typeof window === 'undefined' ? '' : window.location.pathname,
): string | null {
  if (!isRuntimeDocumentMode(search, pathname)) return null;
  return new URLSearchParams(search).get('project')?.trim() || null;
}

export interface RuntimeDocumentClient {
  listProjects(): Promise<Array<{ project_id?: unknown; slug?: unknown; archived?: unknown }>>;
  listTimelines(projectId: string): Promise<Array<{
    project_id?: unknown; timeline_id?: unknown; timeline_ulid?: unknown; slug?: unknown; archived?: unknown;
  }>>;
}

type RuntimeDocumentProject = Awaited<ReturnType<RuntimeDocumentClient['listProjects']>>[number];
type RuntimeDocumentTimeline = Awaited<ReturnType<RuntimeDocumentClient['listTimelines']>>[number];

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function hasRuntimeDocumentIdentity(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.has('project') || params.has('timeline');
}

export function hasRuntimeDocumentSelectors(
  search: string,
  pathname = typeof window === 'undefined' ? '' : window.location.pathname,
): boolean {
  if (!isRuntimeDocumentRoute(pathname)) return false;
  const params = new URLSearchParams(search);
  return ['project', 'timeline', ...LEGACY_KEYS].some((key) => params.has(key));
}

function findProjectId(projects: RuntimeDocumentProject[], selector: string): string | null {
  const available = projects.filter((project) => project.archived !== true);
  const identityMatch = available.find((project) => project.project_id === selector);
  const match = identityMatch ?? available.find((project) => project.slug === selector);
  return match ? text(match.project_id) : null;
}

function findTimelineId(timelines: RuntimeDocumentTimeline[], selector: string, projectId: string): string | null {
  const available = timelines.filter((timeline) =>
    timeline.archived !== true && (!text(timeline.project_id) || text(timeline.project_id) === projectId),
  );
  const identityMatch = available.find((timeline) =>
    timeline.timeline_id === selector,
  );
  const match = identityMatch ?? available.find((timeline) =>
    timeline.timeline_ulid === selector || timeline.slug === selector,
  );
  return match ? text(match.timeline_id) : null;
}

/**
 * Resolve document selectors after the Runtime connection is established.
 * Unresolvable selectors remain intact so the editor can show its missing
 * selection error; transport failures throw so the caller can offer recovery.
 */
export async function normalizeRuntimeDocumentUrl(
  client: RuntimeDocumentClient,
  location: Pick<Location, 'pathname' | 'search' | 'hash'> = window.location,
  replace: (href: string) => void = (href) => window.history.replaceState(window.history.state, '', href),
  isCurrent?: () => boolean,
): Promise<boolean> {
  // Location objects are live. Capture their values before any catalog request
  // so a later navigation cannot become the source of an older normalization.
  const { pathname, search: initialSearch, hash } = location;
  const initialHref = `${pathname}${initialSearch}${hash}`;
  const original = new URLSearchParams(initialSearch);
  const hasLegacy = LEGACY_KEYS.some((key) => original.has(key));
  if (!isRuntimeDocumentRoute(pathname)) return false;
  const hasCanonicalIdentity = original.has('project') || original.has('timeline');
  if (!hasLegacy && !hasCanonicalIdentity) return false;

  // Canonical values win per key. Where absent, `runtime=1` keeps its former
  // precedence over local selectors.
  const runtimeWins = original.get('runtime') === '1';
  const projectSelector = original.has('project')
    ? text(original.get('project'))
    : runtimeWins ? text(original.get('runtimeProject')) : text(original.get('localProject'));
  const timelineSelector = original.has('timeline')
    ? text(original.get('timeline'))
    : runtimeWins ? text(original.get('runtimeTimeline')) : text(original.get('localTimeline'));

  let projectId = projectSelector;
  let timelineId = timelineSelector;
  const projects = projectSelector ? await client.listProjects() : [];
  const resolvedProjectId = projectSelector ? findProjectId(projects, projectSelector) : null;
  if (projectSelector) projectId = resolvedProjectId ?? projectSelector;
  if (resolvedProjectId && timelineSelector) {
    const timelines = await client.listTimelines(resolvedProjectId);
    timelineId = findTimelineId(timelines, timelineSelector, resolvedProjectId) ?? timelineSelector;
  }

  // Do not overwrite navigation that happened while the catalog was resolving.
  if (isCurrent ? !isCurrent() : `${window.location.pathname}${window.location.search}${window.location.hash}` !== initialHref) return false;

  const next = new URLSearchParams(initialSearch);
  for (const key of LEGACY_KEYS) next.delete(key);
  if (projectId) next.set('project', projectId);
  else next.delete('project');
  if (timelineId) next.set('timeline', timelineId);
  else next.delete('timeline');
  const search = next.toString();
  const nextHref = `${pathname}${search ? `?${search}` : ''}${hash}`;
  if (nextHref === initialHref) return false;
  replace(nextHref);
  return true;
}

/** Carry canonical project/timeline identity and unrelated intent onto a route. */
export function withRuntimeDocumentParams(path: string, search: string): string {
  const source = new URLSearchParams(search);
  const target = new URL(path, 'http://runtime.local');
  for (const [key, value] of source) {
    if (key === 'project' || key === 'timeline' || LEGACY_KEYS.includes(key)) continue;
    if (!target.searchParams.has(key)) target.searchParams.append(key, value);
  }
  for (const key of ['project', 'timeline']) {
    const value = source.get(key)?.trim();
    if (value) target.searchParams.set(key, value);
  }
  return `${target.pathname}${target.search}${target.hash}`;
}
