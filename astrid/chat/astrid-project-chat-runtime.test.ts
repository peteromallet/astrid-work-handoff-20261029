import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectChatRegistry, runtimeChatClient } from './astrid-project-chat.ts';
import type { Project } from './runtime-client.ts';

const initialProject: Project = {
  project_id: 'project-1', realm_id: 'realm-1', slug: 'project-1', name: 'Project 1',
  version: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', metadata: {},
};

async function runtimeServer(initialToken: string) {
  let acceptedToken = initialToken;
  let project = structuredClone(initialProject);
  const paths: string[] = [];
  const server: Server = createServer(async (request, response) => {
    paths.push(request.url ?? '');
    if (request.headers.authorization !== `Bearer ${acceptedToken}`) {
      response.writeHead(401, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ code: 'unauthorized', message: 'bad token' }));
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const path = request.url?.split('?')[0];
    if (request.method === 'GET' && path === '/v1/projects') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ items: [project], next_cursor: null }));
      return;
    }
    if (request.method === 'GET' && path === '/v1/projects/project-1') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(project));
      return;
    }
    if (request.method === 'PATCH' && path === '/v1/projects/project-1') {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { expected_version?: number; metadata?: Project['metadata'] };
      if (body.expected_version !== project.version) {
        response.writeHead(409, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ code: 'conflict', message: 'stale project' }));
        return;
      }
      project = { ...project, version: project.version + 1, metadata: body.metadata ?? project.metadata };
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(project));
      return;
    }
    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ code: 'not_found', message: 'missing route' }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    paths,
    setToken(token: string) { acceptedToken = token; },
    setProject(value: Project) { project = structuredClone(value); },
    snapshot() { return structuredClone(project); },
    async close() {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}

test('chat store resolves moved Runtime endpoint and rotated credential for each operation', async () => {
  const first = await runtimeServer('token-a');
  const second = await runtimeServer('token-b');
  const directory = mkdtempSync(join(tmpdir(), 'astrid-project-chat-runtime-'));
  const credential = join(directory, 'credential.json');
  const discovery = join(directory, 'discovery.json');
  const writeDiscovery = (endpoint: string, token: string) => {
    writeFileSync(credential, JSON.stringify({ token }));
    writeFileSync(discovery, JSON.stringify({ endpoint, credential_file: credential }));
  };
  try {
    writeDiscovery(first.endpoint, 'token-a');
    const env = { ASTRID_WORKSPACE_DISCOVERY: discovery } as NodeJS.ProcessEnv;
    const store = runtimeChatClient(env);
    assert.ok(store);
    const registry = new ProjectChatRegistry(store, 'runtime-rebind-test');

    assert.deepEqual((await store.listProjects()).items.map(project => project.project_id), ['project-1']);
    assert.equal((await registry.get('project-1')).revision, 0);
    await registry.draft('project-1', 0, 'saved before restart');

    // A process restart sees the same durable project metadata on the new
    // Runtime endpoint, while discovery and its product credential have moved.
    second.setProject(first.snapshot());
    writeDiscovery(second.endpoint, 'token-b');
    assert.deepEqual((await store.listProjects()).items.map(project => project.project_id), ['project-1']);
    assert.equal((await registry.get('project-1')).draft.text, 'saved before restart');
    const saved = await registry.draft('project-1', 1, 'saved after restart');
    assert.equal(saved.draft.text, 'saved after restart');
    assert.ok(first.paths.length >= 3);
    assert.ok(second.paths.length >= 3);
    assert.ok(second.paths.some(path => path.startsWith('/v1/projects?')));
    assert.ok(second.paths.includes('/v1/projects/project-1'));
    assert.equal(JSON.parse(readFileSync(credential, 'utf8')).token, 'token-b');
  } finally {
    await Promise.all([first.close(), second.close()]);
    rmSync(directory, { recursive: true, force: true });
  }
});

test('chat store retains the explicit endpoint and token-file fallback', async () => {
  const runtime = await runtimeServer('legacy-token');
  const directory = mkdtempSync(join(tmpdir(), 'astrid-project-chat-static-'));
  const tokenFile = join(directory, 'token');
  try {
    writeFileSync(tokenFile, 'legacy-token\n');
    const store = runtimeChatClient({
      VITE_WORKSPACE_RUNTIME_URL: runtime.endpoint,
      WORKSPACE_RUNTIME_TOKEN_FILE: tokenFile,
    } as NodeJS.ProcessEnv);
    assert.ok(store);
    assert.equal((await store.getProject('project-1')).project_id, 'project-1');
    assert.deepEqual(runtime.paths, ['/v1/projects/project-1']);
  } finally {
    await runtime.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
