import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bridgeTestClient } from './bridge-test-client.ts';
import { createAstridAcpHttpServer } from './astrid-acp-bridge.ts';
import { ProjectChatRegistry } from './astrid-project-chat.ts';
import { AcpProcessHostError } from './acpProcessHost.ts';
import type { Project } from './runtime-client.ts';

test('an empty local-agent session recovers once after host replacement, then stays pinned when its first prompt starts', async () => {
  const projectId = 'empty-adapter-session';
  let project: Project = {
    project_id: projectId, realm_id: 'r', slug: projectId, name: projectId,
    metadata: {}, version: 1, created_at: '', updated_at: '',
  };
  const store = {
    getProject: async () => structuredClone(project),
    listProjects: async () => ({ items: [structuredClone(project)], next_cursor: null }),
    updateProject: async (_id: string, _key: string, version: number, _name?: string, metadata?: Record<string, unknown>) => {
      assert.equal(version, project.version);
      project = { ...project, version: version + 1, metadata: metadata ?? project.metadata };
      return structuredClone(project);
    },
  };
  const claimDirectory = mkdtempSync(join(tmpdir(), 'empty-adapter-session-'));
  const registry = new ProjectChatRegistry(store, 'recovery', Date.now, claimDirectory);
  const calls: Array<{ host: number; method: string; params: unknown }> = [];
  const transcripts = new Set<string>();
  let hostCount = 0;
  let nextSession = 0;
  let promptStarted!: () => void;
  let releasePrompt!: () => void;
  const promptHasStarted = new Promise<void>(resolve => { promptStarted = resolve; });
  const promptMayFinish = new Promise<void>(resolve => { releasePrompt = resolve; });
  const { bridge, server } = createAstridAcpHttpServer({
    config: { token: 'empty-session-token', port: 0, cwd: '/tmp/local' },
    chatRegistry: registry,
    idFactory: () => `c${hostCount + 1}`,
    localAgentHostFactory: async agent => {
      assert.equal(agent, 'claude-code');
      const host = hostCount++;
      return {
        initialize: async () => ({ protocolVersion: 1 }),
        request: async (method: string, params: unknown) => {
          calls.push({ host, method, params });
          if (method === 'session/new') {
            // This adapter creates an ID but persists no transcript until a prompt arrives.
            return { sessionId: `claude-code:empty-${++nextSession}` };
          }
          if (method === 'session/load' || method === 'session/resume') {
            const sessionId = (params as { sessionId: string }).sessionId;
            if (transcripts.has(sessionId)) return { sessionId };
            throw new AcpProcessHostError(`ACP request "${method}" failed: Resource not found`, { code: 'acp_transport', method });
          }
          if (method === 'session/prompt') {
            transcripts.add((params as { sessionId: string }).sessionId);
            promptStarted();
            await promptMayFinish;
            throw new AcpProcessHostError('ACP request "session/prompt" failed: adapter transport ended after accepting the prompt', { code: 'acp_transport', method });
          }
          return {};
        },
        cancel: async () => {},
        dispose: async () => {},
      } as never;
    },
  });
  try {
    const call = bridgeTestClient(bridge, 'empty-session-token');
    assert.equal((await call('/connect', { agent: 'claude-code' })).status, 200);
    const created = await call(`/projects/${projectId}/chat/sessions`, {
      connection_id: 'c1', mode: 'new', operation_id: 'create-empty',
    });
    assert.equal(created.status, 200);
    const firstId = (await created.json() as { operation_session_id: string }).operation_session_id;
    assert.equal(firstId, 'claude-code:empty-1');
    assert.deepEqual((await registry.get(projectId)).sessions, [
      { id: firstId, pending_first_message: true },
    ]);
    const beforeDraft = await registry.get(projectId);
    const queued = { id: 'queued-first', text: 'Begin the work', session_id: firstId };
    const draft = await call(`/projects/${projectId}/chat/draft`, {
      expected_revision: beforeDraft.draft.revision, text: '', queued_messages: [queued],
    }, { method: 'PATCH' });
    assert.equal(draft.status, 200);

    // The original host vanishes before it has accepted a prompt.
    assert.equal((await call('/c1', undefined, { method: 'DELETE' })).status, 200);
    assert.equal((await call('/connect', { agent: 'claude-code' })).status, 200);

    // A stale tab can submit before its replacement connection has loaded the session.
    const stalePrompt = await call(`/projects/${projectId}/chat/prompt`, {
      connection_id: 'c2', session_id: firstId, request_id: 'stale-first-prompt',
      prompt: [{ type: 'text', text: 'This must wait for session recovery' }],
    });
    assert.notEqual(stalePrompt.status, 200);
    assert.deepEqual((await registry.get(projectId)).sessions, [
      { id: firstId, pending_first_message: true },
    ]);

    // A replacement host cannot load this adapter-created ID because it has no transcript.
    const load = await call('/c2/rpc', { method: 'session/load', params: { sessionId: firstId } });
    assert.equal(load.status, 502);
    assert.deepEqual((await registry.get(projectId)).sessions, [
      { id: firstId, pending_first_message: true },
    ]);

    const recovered = await call(`/projects/${projectId}/chat/sessions`, {
      connection_id: 'c2', mode: 'ensure', operation_id: 'recover-empty', recover_session_id: firstId,
    });
    assert.equal(recovered.status, 200);
    const recoveredState = await recovered.json() as { operation_session_id: string; sessions: Array<{ id: string; pending_first_message?: boolean }> };
    const recoveredId = recoveredState.operation_session_id;
    assert.equal(recoveredId, 'claude-code:empty-2');
    assert.deepEqual(recoveredState.sessions, [{ id: recoveredId, pending_first_message: true }]);
    assert.deepEqual((await registry.get(projectId)).draft.queued_messages, [
      { ...queued, session_id: recoveredId },
    ]);
    const staleSave = await call(`/projects/${projectId}/chat/draft`, {
      expected_revision: beforeDraft.draft.revision + 1, text: '', queued_messages: [queued],
    }, { method: 'PATCH' });
    assert.equal(staleSave.status, 409);
    assert.deepEqual((await registry.get(projectId)).draft.queued_messages, [{ ...queued, session_id: recoveredId }]);
    assert.equal(calls.filter(call => call.method === 'session/new').length, 2);

    const prompt = call(`/projects/${projectId}/chat/prompt`, {
      connection_id: 'c2', session_id: recoveredId, request_id: queued.id,
      prompt: [{ type: 'text', text: queued.text }],
    });
    await promptHasStarted;
    const duplicatePrompt = call(`/projects/${projectId}/chat/prompt`, {
      connection_id: 'c2', session_id: recoveredId, request_id: queued.id,
      prompt: [{ type: 'text', text: queued.text }],
    });

    // Once prompt dispatch begins, even a long turn cannot trigger replacement.
    const afterStart = await call(`/projects/${projectId}/chat/sessions`, {
      connection_id: 'c2', mode: 'ensure', operation_id: 'must-not-recover', recover_session_id: recoveredId,
    });
    assert.equal(afterStart.status, 409);
    assert.equal(calls.filter(call => call.method === 'session/new').length, 2);
    assert.equal(calls.filter(call => call.method === 'session/prompt').length, 1);
    releasePrompt();
    assert.equal((await prompt).status, 502);
    assert.equal((await duplicatePrompt).status, 502);
    const afterFailure = await call(`/projects/${projectId}/chat/sessions`, {
      connection_id: 'c2', mode: 'ensure', operation_id: 'must-not-recover-after-dispatch', recover_session_id: recoveredId,
    });
    assert.equal(afterFailure.status, 409);
    assert.equal(calls.filter(call => call.method === 'session/new').length, 2);
    assert.deepEqual((await registry.get(projectId)).sessions, [
      { id: recoveredId, pending_first_message: false },
    ]);
  } finally {
    releasePrompt();
    await bridge.close();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(claimDirectory, { recursive: true, force: true });
  }
});
