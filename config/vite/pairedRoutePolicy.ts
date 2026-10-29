import type { IncomingHttpHeaders } from 'node:http';

export const PAIRED_MAX_FRAME_BYTES = 64 * 1024;
export const PAIRED_MAX_JSON_BYTES = 128 * 1024;
export const PAIRED_MAX_UPLOAD_BYTES = 64 * 1024 * 1024;
export const PAIRED_REQUEST_TIMEOUT_MS = 30_000;

export type PairedService = 'runtime' | 'astrid' | 'acp' | 'compose';

export interface PairedRoute {
  readonly service: PairedService;
  readonly upstreamPath: string;
  readonly stream: boolean;
}

// Defence in depth: admin/worker routes that never belong to the product, on any
// service. The explicit tables below already exclude them.
const denied = [
  /^\/v1\/(doctor|backup|restore|export)(?:\/|$)/,
  /^\/v1\/realm\/(?:tombstone|recover|purge|replace)(?:\/|$)/,
  /^\/v1\/(?:tasks\/claim|attempts\/|recovery\/|executors(?:\/|$))/,
];

// Segment charsets. A decoded segment may only hold unreserved characters and
// ':' (ids such as `timeline:x` or `sha256:...` arrive as `%3A`). Dynamic ids
// match what the Runtime issues: `[A-Za-z0-9][A-Za-z0-9._~:-]{0,255}`.
const SAFE_SEGMENT = /^[A-Za-z0-9._~:-]+$/;
const ID_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._~:-]{0,255}$/;
const CONNECTION_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;

const RESERVED_ACP = new Set(['health', 'connect', 'projects', 'models', 'model', 'agents', 'astrid']);
const MAX_PATH_LENGTH = 4096;

interface RouteEntry {
  readonly methods: ReadonlySet<string>;
  readonly segments: readonly string[];
  readonly stream: boolean;
}

/**
 * `:` stands for a dynamic id segment, `:conn` for an ACP connection id. Every
 * entry is one method set plus one exact path shape; nothing is a wildcard.
 */
function entry(methods: string, template: string, stream = false): RouteEntry {
  return { methods: new Set(methods.split(',')), segments: template.split('/').slice(1), stream };
}

// The paired relay's table. The hosted page's direct route, the Runtime's own browser door
// (astrid-runtime runtime_protocol/door.py), keeps the same table in the Runtime, and its
// conformance tests (tests/test_door_routes.py) port this file's product calls: change both.
//
// Runtime routes. The `astrid` service is an alias of the Runtime (the connector
// forwards it to the Runtime's own port unless VITE_ASTRID_BRIDGE_PORT overrides
// it), so both services share this single table. The product's generated-client,
// render and Astrid route calls define it.
const workspaceRoutes: readonly RouteEntry[] = [
  entry('GET', '/v1/health'),
  entry('POST', '/v1/handshake'),
  entry('GET', '/v1/realm'),
  entry('GET,PUT', '/v1/app-state/user/:'),
  entry('GET,POST', '/v1/projects'),
  entry('PUT', '/v1/projects/selection'),
  entry('GET,PATCH', '/v1/projects/:'),
  entry('GET', '/v1/projects/:/timelines'),
  entry('GET,PATCH', '/v1/projects/:/timelines/:'),
  entry('POST', '/v1/projects/:/timelines/import'),
  entry('GET', '/v1/projects/:/timelines/:/revisions/:'),
  entry('GET,POST', '/v1/projects/:/timelines/:/composition-revisions'),
  entry('GET', '/v1/projects/:/timelines/:/composition-revisions/:'),
  entry('POST', '/v1/projects/:/timelines/:/composition-revisions/:/restore'),
  entry('POST', '/v1/projects/:/timelines/:/inspect'),
  entry('GET', '/v1/projects/:/shots/:/revisions/:'),
  entry('GET,POST', '/v1/projects/:/documents'),
  entry('GET,PATCH', '/v1/projects/:/documents/:'),
  entry('GET,POST', '/v1/projects/:/thumbnails/source-frame'),
  entry('GET,POST', '/v1/projects/:/objects', true),
  entry('GET', '/v1/projects/:/objects/:/location', true),
  entry('POST', '/v1/projects/:/media-imports', true),
  entry('GET', '/v1/projects/:/media-imports/:', true),
  entry('GET,HEAD', '/v1/objects/:', true),
  entry('POST', '/v1/tasks'),
  entry('GET', '/v1/tasks/:'),
  entry('POST', '/v1/tasks/:/cancel'),
  entry('POST', '/v1/tasks/:/retry'),
  entry('GET', '/v1/projects/:/tasks'),
  entry('GET', '/v1/tasks/:/managed-outputs'),
  entry('GET', '/v1/managed-outputs/:'),
  entry('POST', '/v1/managed-outputs/:/export', true),
  entry('GET', '/v1/events'),
  entry('GET', '/v1/projects/:/generations'),
  entry('GET', '/v1/generations/:'),
  entry('GET', '/v1/generations/:/variants'),
  entry('POST', '/v1/generations/:/variants/viewed'),
  entry('POST', '/v1/variants/:/viewed'),
];

// The capability catalog is read-only for the product and only through the
// astrid service; registration is Runtime-internal.
const astridOnlyRoutes: readonly RouteEntry[] = [entry('GET', '/v1/capabilities')];

const acpRoutes: readonly RouteEntry[] = [
  entry('GET', '/acp/health'),
  entry('GET', '/acp/models'),
  entry('GET', '/acp/agents'),
  entry('POST', '/acp/connect'),
  entry('POST', '/acp/astrid/api-key'),
  entry('GET', '/acp/:conn/models'),
  entry('POST', '/acp/:conn/rpc'),
  entry('POST', '/acp/:conn/cancel'),
  entry('POST', '/acp/:conn/reconnect'),
  entry('GET', '/acp/:conn/events'),
  entry('DELETE', '/acp/:conn'),
  entry('GET,PATCH', '/acp/projects/:/chat'),
  entry('POST', '/acp/projects/:/chat/sessions'),
  entry('GET', '/acp/projects/:/chat/unassigned'),
  entry('POST', '/acp/projects/:/chat/associate'),
  entry('PATCH', '/acp/projects/:/chat/draft'),
  entry('PATCH', '/acp/projects/:/chat/main'),
  entry('POST', '/acp/projects/:/chat/prompt'),
];

function findRoute(table: readonly RouteEntry[], method: string, segments: readonly string[]): RouteEntry | undefined {
  const matches = table.filter((candidate) => candidate.segments.length === segments.length
    && candidate.segments.every((expected, index) => (
      expected === ':' ? ID_SEGMENT.test(segments[index])
        : expected === ':conn' ? CONNECTION_SEGMENT.test(segments[index]) && !RESERVED_ACP.has(segments[index])
          : expected === segments[index])));
  // A literal route (e.g. /v1/projects/selection) owns its path; an ID pattern never reaches it with another method.
  const literal = matches.filter((candidate) => !candidate.segments.some((segment) => segment.startsWith(':')));
  return (literal.length > 0 ? literal : matches).find((candidate) => candidate.methods.has(method));
}

interface CanonicalPath {
  readonly segments: readonly string[];
  /** Raw query (without `?`), validated but never decoded. */
  readonly query: string;
}

/**
 * Percent-decode the path exactly once into a canonical form, or reject it.
 * Classification and forwarding both use this decoded form, so what the relay
 * judges is what the Runtime (which also decodes each segment once) receives.
 */
function canonicalizePath(path: string): CanonicalPath | null {
  if (!path || path.length > MAX_PATH_LENGTH || !path.startsWith('/')) return null;
  // Printable ASCII only: rejects control characters (TAB, CR, LF, NUL, DEL),
  // spaces and non-ASCII. Also no fragments, backslashes or embedded URLs.
  if (!/^[\x21-\x7e]+$/.test(path) || path.includes('#') || path.includes('\\') || path.includes('://')) return null;
  const queryStart = path.indexOf('?');
  const pathname = queryStart === -1 ? path : path.slice(0, queryStart);
  const query = queryStart === -1 ? '' : path.slice(queryStart + 1);
  const segments: string[] = [];
  for (const raw of pathname.slice(1).split('/')) {
    if (!/^(?:[^%]|%[0-9A-Fa-f]{2})*$/.test(raw)) return null;
    let decoded: string;
    try { decoded = decodeURIComponent(raw); } catch { return null; }
    // Rejects empty segments, '.'/'..' (also when encoded), encoded '/', '\\',
    // '?', '#', control characters and a '%' left after decoding (double encoding).
    if (!SAFE_SEGMENT.test(decoded) || decoded === '.' || decoded === '..') return null;
    segments.push(decoded);
  }
  return { segments, query };
}

export function isSafeForwardPath(path: string): boolean {
  return canonicalizePath(path) !== null;
}

export function classifyPairedRoute(
  requestPath: string,
  method: string,
  headers: IncomingHttpHeaders | Readonly<Record<string, string | string[] | undefined>> = {},
): PairedRoute | null {
  const normalizedMethod = method.toUpperCase();
  const canonical = canonicalizePath(requestPath);
  if (!canonical) return null;
  const contentLength = headers['content-length'];
  if (Array.isArray(contentLength) || (contentLength && !/^\d+$/.test(String(contentLength)))) return null;
  const { segments, query } = canonical;
  const suffix = query ? `?${query}` : '';
  if (segments[0] !== 'api' || (segments[1] !== 'runtime' && segments[1] !== 'astrid')) return null;
  if (segments.length === 4 && segments[1] === 'astrid' && segments[2] === 'generation' && segments[3] === 'compose') {
    return normalizedMethod === 'POST' && !query
      ? { service: 'compose', upstreamPath: '/api/astrid/generation/compose', stream: false }
      : null;
  }
  const upstream = segments.slice(2);
  const upstreamPath = `/${upstream.join('/')}${suffix}`;
  const pathOnly = `/${upstream.join('/')}`;
  if (segments[1] === 'astrid' && upstream[0] === 'acp') {
    return findRoute(acpRoutes, normalizedMethod, upstream)
      ? { service: 'acp', upstreamPath, stream: false }
      : null;
  }
  if (denied.some((route) => route.test(pathOnly))) return null;
  if (segments[1] === 'runtime') {
    const found = findRoute(workspaceRoutes, normalizedMethod, upstream);
    return found ? { service: 'runtime', upstreamPath, stream: found.stream } : null;
  }
  return findRoute(workspaceRoutes, normalizedMethod, upstream) || findRoute(astridOnlyRoutes, normalizedMethod, upstream)
    ? { service: 'astrid', upstreamPath, stream: false }
    : null;
}

export const PAIRED_FORWARD_HEADERS = new Set([
  'accept', 'content-type', 'content-length', 'content-range', 'range', 'if-match',
  'if-none-match', 'etag', 'idempotency-key', 'x-filename', 'x-original-name',
  'x-expected-version', 'x-expected-digest', 'x-media-width', 'x-media-height',
  'x-media-duration-seconds', 'cache-control', 'accept-encoding',
]);

export function forwardHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (!PAIRED_FORWARD_HEADERS.has(lower) || Array.isArray(value) || value === undefined) continue;
    if (lower === 'x-output-binding') continue;
    result[name] = value;
  }
  return result;
}

// Request headers the connector passes on to the local Runtime: the relay's own
// forwarding set (media metadata, conditional/range, idempotency) minus headers
// that are response-only or that fetch manages itself. Credentials, cookies and
// origin are never in the set.
const CONNECTOR_SKIPPED_HEADERS = new Set(['accept', 'accept-encoding', 'etag']);

export function upstreamRequestHeaders(headers: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (value === undefined || !PAIRED_FORWARD_HEADERS.has(lower) || CONNECTOR_SKIPPED_HEADERS.has(lower)) continue;
    result[lower] = value;
  }
  return result;
}
