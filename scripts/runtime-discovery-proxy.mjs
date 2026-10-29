import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { createServer, request as requestHttp } from 'node:http';
import { URL, fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { objectCacheControl } from '../config/vite/objectCachePolicy.mjs';

const discoveryPath = process.env.ASTRID_WORKSPACE_DISCOVERY?.trim();
const port = Number(process.env.ASTRID_RUNTIME_PROXY_PORT ?? '17336');
// Connecting to the loopback Runtime is near-instant, so a long wait is a real failure.
// Once connected, only silence is an error: media streams may take as long as they keep
// producing bytes (same idea as the paired relay's idle timeout).
export const CONNECT_TIMEOUT_MS = 10_000;
export const IDLE_TIMEOUT_MS = 60_000;
const ACP_IDLE_TIMEOUT_MS = 5 * 60_000;
// Upstream requests currently open across the proxy, for the upstream error log line.
let upstreamInFlight = 0;

function fail(message, status = 503) {
  return { status, body: JSON.stringify({
    code: 'runtime_unavailable',
    message,
  }) };
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readToken(path) {
  const raw = readFileSync(path, 'utf8').trim();
  if (!raw) throw new Error('runtime credential is empty');
  if (!raw.startsWith('{')) return raw;
  const parsed = JSON.parse(raw);
  if (typeof parsed?.token !== 'string' || !parsed.token.trim()) {
    throw new Error('runtime credential has no token');
  }
  return parsed.token.trim();
}

/**
 * The Runtime to forward to right now: its loopback endpoint from the discovery file and its bearer token, read afresh on every
 * call so a restart on a new port or a rotated token is followed. Throws on a missing, malformed or non-loopback file.
 * `credentialFile` names a different token file than the discovery's own (the loopback gateway holds a product-scoped one).
 */
export function currentRuntime(discoveryPath, { credentialFile: credentialFileOverride } = {}) {
  if (!discoveryPath) throw new Error('ASTRID_WORKSPACE_DISCOVERY is not configured');
  const discovery = readJson(discoveryPath, 'runtime discovery');
  const endpoint = new URL(String(discovery.endpoint ?? ''));
  if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(endpoint.hostname) || !endpoint.port) {
    throw new Error('runtime discovery endpoint must be an explicit HTTP loopback URL');
  }
  const credentialFile = String(credentialFileOverride ?? discovery.credential_file ?? '').trim();
  if (!credentialFile) throw new Error('runtime discovery has no credential file');
  return { endpoint, token: readToken(credentialFile) };
}

/** The agent owns this registration and can rotate it independently of Vite. */
export function currentChat(discoveryPath) {
  if (!discoveryPath) throw new Error('ASTRID_WORKSPACE_DISCOVERY is not configured');
  const path = resolve(dirname(discoveryPath), 'chat.json');
  const metadata = lstatSync(path);
  if (!metadata.isFile() || (process.platform !== 'win32'
    && ((metadata.mode & 0o077) !== 0 || metadata.uid !== process.getuid()))) {
    throw new Error('chat registration must be an owner-only regular file');
  }
  const registration = readJson(path, 'chat registration');
  const endpoint = new URL(String(registration.endpoint ?? ''));
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || !endpoint.port || Number(endpoint.port) < 1
    || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash
    || typeof registration.token !== 'string' || !registration.token.trim()) {
    throw new Error('chat registration must name an authenticated loopback service');
  }
  return { endpoint, token: registration.token };
}

export function readWorkspaceRuntimeConfig(discoveryPath) {
  if (!discoveryPath) throw new Error('ASTRID_WORKSPACE_DISCOVERY is not configured');
  const discovery = readJson(discoveryPath, 'runtime discovery');
  const endpoint = new URL(String(discovery.endpoint ?? ''));
  if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) || !endpoint.port) {
    throw new Error('runtime discovery endpoint must be an explicit HTTP loopback URL');
  }
  const credential = readJson(String(discovery.credential_file ?? ''), 'runtime product credential');
  const actorId = typeof credential.actor_id === 'string' ? credential.actor_id.trim() : '';
  const realmId = typeof discovery.active_realm === 'string' ? discovery.active_realm.trim() : '';
  const runtimeInstanceId = typeof discovery.runtime_instance_id === 'string' ? discovery.runtime_instance_id.trim() : '';
  if (credential.version !== 1 || credential.scope !== 'astrid' || !actorId
    || ['owner', 'astrid-pack-host', 'admin', 'worker'].includes(actorId)
    || typeof credential.token !== 'string' || !credential.token.trim()
    || !realmId || !runtimeInstanceId) {
    throw new Error('runtime discovery has no valid Astrid product identity');
  }
  const catalog = readJson(resolve(dirname(discoveryPath), 'catalog.json'), 'runtime profile catalog');
  const matches = Array.isArray(catalog.realms)
    ? catalog.realms.filter((row) => row?.realm_id === realmId) : [];
  if (catalog.selected_realm_id !== realmId || matches.length !== 1
    || matches[0].source_profile !== 'astrid'
    || realpathSync(discovery.realm_root) !== realpathSync(matches[0].data_root)) {
    throw new Error('runtime discovery does not match the selected Astrid realm');
  }
  return { schemaVersion: 1, endpoint: endpoint.origin, actorId, realmId, runtimeInstanceId };
}

function writeFailure(response, failure) {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.writeHead(failure.status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
  });
  response.end(failure.body);
}

export function createRuntimeProxyServer({
  discoveryPath,
  connectTimeoutMs = CONNECT_TIMEOUT_MS,
  idleTimeoutMs = IDLE_TIMEOUT_MS,
  request = requestHttp,
} = {}) {
  return createServer((incoming, response) => {
  if (incoming.url?.split('?')[0] === '/runtime-config/v1/workspace.json') {
    if (incoming.method !== 'GET') {
      writeFailure(response, fail('method not allowed', 405));
      return;
    }
    try {
      const config = readWorkspaceRuntimeConfig(discoveryPath);
      response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(config));
    } catch (error) {
      writeFailure(response, fail(error instanceof Error ? error.message : String(error)));
    }
    return;
  }
  let runtime;
  const chat = incoming.url === '/acp' || incoming.url?.startsWith('/acp/');
  try {
    runtime = chat ? currentChat(discoveryPath) : currentRuntime(discoveryPath);
  } catch (error) {
    writeFailure(response, chat
      ? { status: 503, body: JSON.stringify({ error: 'acp_unavailable' }) }
      : fail(error instanceof Error ? error.message : String(error)));
    return;
  }

  const headers = { ...incoming.headers };
  delete headers.host;
  delete headers.authorization;
  headers.authorization = `Bearer ${runtime.token}`;
  if (chat) headers['x-astrid-bridge-version'] = 'v1';

  const startedAt = Date.now();
  const upstream = request({
    hostname: runtime.endpoint.hostname,
    port: Number(runtime.endpoint.port),
    method: incoming.method,
    path: chat ? incoming.url.slice(4) || '/' : incoming.url || '/',
    headers,
  }, (upstreamResponse) => {
    clearTimeout(connectTimer);
    const status = upstreamResponse.statusCode ?? 502;
    const responseHeaders = { ...upstreamResponse.headers };
    // The Runtime marks every reply no-store; digest-addressed object bytes are immutable.
    const cacheControl = objectCacheControl(incoming.method, incoming.url, status);
    if (cacheControl) responseHeaders['cache-control'] = cacheControl;
    response.writeHead(status, responseHeaders);
    upstreamResponse.pipe(response);
  });
  upstreamInFlight += 1;

  const connectTimer = setTimeout(() => upstream.destroy(new Error('runtime connect timed out')), connectTimeoutMs);
  upstream.on('socket', (socket) => {
    const connected = () => {
      clearTimeout(connectTimer);
      // Socket idle timeout: re-armed by every byte in either direction.
      upstream.setTimeout(chat ? ACP_IDLE_TIMEOUT_MS : idleTimeoutMs, () => upstream.destroy(new Error('runtime request idle timeout')));
    };
    if (socket.connecting) socket.once('connect', connected); else connected();
  });
  upstream.on('close', () => {
    clearTimeout(connectTimer);
    upstreamInFlight -= 1;
  });
  upstream.on('error', (error) => {
    console.error(`runtime proxy upstream error ${new Date().toISOString()} ${incoming.method} ${(incoming.url ?? '/').split('?')[0]} code=${error.code ?? 'none'} message=${error.message} reusedSocket=${upstream.reusedSocket} elapsedMs=${Date.now() - startedAt} inFlight=${upstreamInFlight}`);
    writeFailure(response, fail(`runtime request failed: ${error.message}`, /timed out|timeout/.test(error.message) ? 504 : 503));
  });
  incoming.on('aborted', () => upstream.destroy());
  incoming.pipe(upstream);
});
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
const server = createRuntimeProxyServer({ discoveryPath });
server.on('error', (error) => {
  console.error(`runtime discovery proxy failed: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Runtime discovery proxy listening on 127.0.0.1:${port}`);
});
}
