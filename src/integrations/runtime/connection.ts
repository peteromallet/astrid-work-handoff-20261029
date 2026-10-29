import type { Realm } from './generated.ts';

/**
 * Where the browser reaches the local Runtime. One origin, set once at boot:
 *
 * - `''`: same-origin. Local dev (Vite proxies `/api/*`) and the relay.
 * - an origin such as `http://127.0.0.1:17340`: the hosted build, talking to the Runtime's own browser door
 *   (astrid-runtime `runtime_protocol/door.py`; "the gateway" in this codebase), which serves the same
 *   `/api/runtime/*` and `/api/astrid/*` paths.
 *
 * Everything else reads the bases through the functions below at request time, never a cached
 * string, so a client or helper created before boot still reaches the right place. Whether the
 * page is on the gateway is decided here, from the configured origin, never by inspecting the shape
 * of a base string elsewhere.
 */

const RUNTIME_API_PATH = '/api/runtime';
const ASTRID_API_PATH = '/api/astrid';

/** The build-time Runtime identity `client.ts` binds to (`dev:local` compiles it in). */
export const RUNTIME_IDENTITY_ENV_KEYS = [
  'VITE_WORKSPACE_RUNTIME_EXPECTED_ACTOR_ID',
  'VITE_WORKSPACE_RUNTIME_EXPECTED_REALM_ID',
  'VITE_WORKSPACE_RUNTIME_EXPECTED_INSTANCE_ID',
] as const;

/** The slice of `import.meta.env` read here: `VITE_RUNTIME_ORIGIN` and the identity keys. */
export type RuntimeOriginEnv = Readonly<Record<string, unknown>>;

let configuredOrigin: string | undefined;

function envString(env: RuntimeOriginEnv, key: string): string {
  const value = env[key];
  return typeof value === 'string' ? value.trim() : '';
}

function parseOrigin(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`VITE_RUNTIME_ORIGIN must be an http(s) origin such as http://127.0.0.1:17340, got "${raw}"`);
  }
  const bare = url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password;
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !bare) {
    throw new Error(`VITE_RUNTIME_ORIGIN must be an http(s) origin with no path, query or credentials, got "${raw}"`);
  }
  return url.origin;
}

/**
 * Resolves the origin from the build's environment. Call once at boot, before the first Runtime
 * request; calling again with the same value is a no-op (StrictMode, HMR), a different value throws.
 *
 * A gateway origin with a compiled Runtime identity is refused: the hosted build binds to the first
 * healthy session it sees (`client.ts`), so a compiled identity would pin every visitor's browser to
 * one machine's Runtime instance and fence it on that Runtime's first restart.
 */
export function setRuntimeOrigin(env: RuntimeOriginEnv = import.meta.env): string {
  const raw = envString(env, 'VITE_RUNTIME_ORIGIN');
  const origin = raw ? parseOrigin(raw) : '';
  if (origin) {
    const compiled = RUNTIME_IDENTITY_ENV_KEYS.filter((key) => envString(env, key));
    if (compiled.length > 0) {
      throw new Error(
        `VITE_RUNTIME_ORIGIN (${origin}) cannot be combined with a compiled Runtime identity (${compiled.join(', ')}); `
        + 'the hosted build binds to the first healthy session instead (npm run build:hosted sets none).',
      );
    }
  }
  if (configuredOrigin !== undefined && configuredOrigin !== origin) {
    throw new Error(`Runtime origin is already set to "${configuredOrigin}"; refusing to change it to "${origin}"`);
  }
  configuredOrigin = origin;
  return origin;
}

/** `''` (same-origin) until `setRuntimeOrigin()` says otherwise. */
export function runtimeOrigin(): string {
  return configuredOrigin ?? '';
}

/** Base for `AstridRuntimeClient` and Runtime media: `/api/runtime`, or the gateway's. */
export function runtimeApiBase(): string {
  return `${runtimeOrigin()}${RUNTIME_API_PATH}`;
}

/** Base for the Astrid bridge routes and their media: `/api/astrid`, or the gateway's. */
export function astridBase(): string {
  return `${runtimeOrigin()}${ASTRID_API_PATH}`;
}

/** True only for an absolute URL on the configured gateway origin; always false same-origin. */
export function isGatewayUrl(url: string | null | undefined): boolean {
  const origin = runtimeOrigin();
  if (!origin || !url) return false;
  try {
    return new URL(url).origin === origin;
  } catch {
    return false; // relative URLs are same-origin by definition
  }
}

/** True when a provider's `apiBaseUrl` is the Runtime's (rather than the Astrid bridge's), on either origin. */
export function isRuntimeMode(apiBaseUrl: string | null | undefined): boolean {
  return typeof apiBaseUrl === 'string' && apiBaseUrl.replace(/\/+$/, '') === runtimeApiBase();
}

/** The boot gate's view of the connection; each status names one screen. */
export type RuntimeConnectionState =
  | { status: 'connecting' }
  /** Permission has never been asked: the page has no evidence about this computer. */
  | { status: 'needs_permission' }
  | { status: 'connected'; realm: Pick<Realm, 'realm_id' | 'display_name'>; managedByPinokio?: boolean }
  /** Granted permission and at least two unanswered probes. */
  | { status: 'not_running' }
  /** Granted permission, at least two unreadable readings, and a `no-cors` probe still got an answer: Astrid refuses this origin. */
  | { status: 'refused' }
  /** This device cannot run Astrid locally. */
  | { status: 'phone' }
  /** This browser cannot request local-network access. */
  | { status: 'unsupported' }
  /** Runtime schema is not accepted by this hosted app. */
  | { status: 'update_needed' }
  /** The browser's local-network permission is denied. */
  | { status: 'blocked' };

/**
 * Query-key roots that read the Runtime through the gateway. The boot gate invalidates them when the
 * connection comes up, so nothing cached from before it (an error, an empty read) is served as current.
 */
export const RUNTIME_QUERY_ROOTS: readonly string[] = [
  'runtime',
  'runtime-editor',
  'runtime-tasks',
  'runtime-final-videos',
  'agent-models',
  'local-agents',
  'timeline-agent-sessions',
  'timeline-agent-session',
  'project-agent-chat',
  'project-agent-chat-unassigned',
  'project-agent-task-links',
  'agent-linked-task-results',
];

/** True for a query key whose root is one of `RUNTIME_QUERY_ROOTS`. */
export function isRuntimeQueryKey(queryKey: readonly unknown[]): boolean {
  return typeof queryKey[0] === 'string' && RUNTIME_QUERY_ROOTS.includes(queryKey[0]);
}
