import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { createAstridAcpHttpServer } from './astrid-acp-bridge.ts';
import type { ProjectChatRegistry } from './astrid-project-chat.ts';
import type { AcpProcessHost, AcpProcessHostCallbacks } from './acpProcessHost.ts';
import type { LocalAgentId } from './localAgents.ts';

type Json = Record<string, unknown>;
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

async function waitForPromptStart(started: Promise<void>, response: Promise<Response>): Promise<void> {
  let dispatched = false;
  await Promise.race([
    started.then(() => { dispatched = true; }),
    response.then(async result => {
      if (!dispatched) assert.fail(`Prompt returned HTTP ${result.status} before native dispatch: ${await result.text()}`);
    }),
  ]);
}

for (const agent of ['astrid', 'codex', 'claude-code'] as const) {
  test(`${agent}: two HTTP clients follow one live native session and transfer its writer without sending twice`, async () => {
    const id = agent === 'astrid' ? 'saved-session' : `${agent}:saved-session`;
    const calls: Array<{ host: number; method: string; params: unknown }> = [];
    const disposed: number[] = [];
    const callbacks: AcpProcessHostCallbacks[] = [];
    const nativeWriters = new Map<string, number>();
    let gate = { started: deferred(), finish: deferred() };
    let nextId = 0;
    const makeHost = (cb: AcpProcessHostCallbacks = {}): AcpProcessHost => {
      const host = callbacks.length;
      callbacks.push(cb);
      return {
        initialize: async () => ({ protocolVersion: 1 }),
        request: async (method: string, params: unknown) => {
          calls.push({ host, method, params });
          if (method === 'session/load') {
            assert.equal(nativeWriters.has(id), false, 'a second native writer must never be opened');
            nativeWriters.set(id, host);
            cb.onNotification?.({ jsonrpc: '2.0', method: 'session/update', params: {
              sessionId: id, update: { sessionUpdate: 'agent_message_chunk', messageId: 'history', content: { type: 'text', text: 'Saved history' } },
            } });
            return { configOptions: [] };
          }
          if (method === 'session/prompt') {
            const turn = gate;
            cb.onNotification?.({ jsonrpc: '2.0', method: 'session/update', params: {
              sessionId: id, update: { sessionUpdate: 'agent_message_chunk', messageId: `turn-${calls.length}`, content: { type: 'text', text: 'Still working' } },
            } });
            turn.started.resolve();
            await turn.finish.promise;
            return { stopReason: 'end_turn' };
          }
          return {};
        },
        cancel: async (params: unknown) => { calls.push({ host, method: 'session/cancel', params }); },
        dispose: async () => { disposed.push(host); if (nativeWriters.get(id) === host) nativeWriters.delete(id); },
      } as unknown as AcpProcessHost;
    };
    const assertSessionScope = async (project: string, session: string) => {
      assert.equal(project, 'p');
      assert.equal(session, id);
    };
    const registry = {
      assertOwned: assertSessionScope,
      markSessionStarted: assertSessionScope,
    } satisfies Pick<ProjectChatRegistry, 'assertOwned' | 'markSessionStarted'>;
    const { bridge, server } = createAstridAcpHttpServer({
      config: { token: 'test', port: 0, cwd: '/tmp/astrid-two-tabs' },
      chatRegistry: registry as ProjectChatRegistry,
      idFactory: () => `c${++nextId}`,
      hostFactory: options => makeHost(options.callbacks),
      localAgentHostFactory: async (_agent: Exclude<LocalAgentId, 'astrid'>, options) => makeHost(options.callbacks),
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const call = (path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') => fetch(base + path, {
      method, headers: { Authorization: 'Bearer test', 'X-Astrid-Bridge-Version': 'v1', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const rpc = (client: string, method: string, params: unknown = { sessionId: id }) => call(`/${client}/rpc`, { method, params });
    const prompt = (client: string, requestId: string, text = 'Do the work') => call('/projects/p/chat/prompt', {
      connection_id: client, session_id: id, request_id: requestId, prompt: [{ type: 'text', text }],
    });
    const controls = async (client: string) => {
      const response = await call(`/${client}/events`);
      assert.equal(response.status, 200);
      return (await response.json() as { notifications: Json[] }).notifications;
    };
    const control = (events: Json[]) => events.filter(event => (event.params as Json)?.update && ((event.params as Json).update as Json).sessionUpdate === 'astrid_session_control').map(event => ((event.params as Json).update as Json));
    try {
      assert.equal((await call('/connect', { agent })).status, 200);
      assert.equal((await call('/connect', { agent })).status, 200);
      const firstLoad = await rpc('c1', 'session/load');
      assert.equal(firstLoad.status, 200);
      assert.deepEqual(((await firstLoad.json() as Json).result as Json)._astridSession, { role: 'writer', active: false, activeRequestId: null });
      await controls('c1');

      const firstPrompt = prompt('c1', 'queue-1');
      await waitForPromptStart(gate.started.promise, firstPrompt);
      const follow = await rpc('c2', 'session/load');
      assert.equal(follow.status, 200);
      assert.deepEqual(((await follow.json() as Json).result as Json)._astridSession, { role: 'follower', active: true, activeRequestId: 'queue-1' });
      assert.equal(calls.filter(call => call.method === 'session/load').length, 1);
      const followed = await controls('c2');
      assert.ok(followed.some(event => JSON.stringify(event).includes('Saved history')));
      assert.ok(followed.some(event => JSON.stringify(event).includes('Still working')));

      assert.equal((await prompt('c2', 'must-not-send')).status, 409);
      const takeover = await rpc('c2', 'session/takeover');
      assert.equal(takeover.status, 200);
      assert.deepEqual(((await takeover.json() as Json).result as Json)._astridSession, { role: 'writer', active: true, activeRequestId: 'queue-1' });
      assert.equal(control(await controls('c1')).at(-1)?.role, 'follower');
      assert.equal((await prompt('c1', 'stale-send')).status, 409);
      assert.equal((await call('/c1/cancel', { sessionId: id })).status, 409);
      assert.equal((await prompt('c2', 'next-while-busy')).status, 409);
      assert.equal(calls.filter(call => call.method === 'session/prompt').length, 1);
      assert.equal(calls.filter(call => call.method === 'session/cancel').length, 0);

      const duplicate = prompt('c2', 'queue-1');
      gate.finish.resolve();
      assert.equal((await firstPrompt).status, 200);
      assert.equal((await duplicate).status, 200);
      assert.equal(calls.filter(call => call.method === 'session/prompt').length, 1);
      assert.equal((await prompt('c2', 'queue-1', 'Different work')).status, 409);
      assert.deepEqual(control(await controls('c2')).at(-1), { sessionUpdate: 'astrid_session_control', role: 'writer', active: false, activeRequestId: null });

      gate = { started: deferred(), finish: deferred() };
      const secondPrompt = prompt('c2', 'queue-2');
      await waitForPromptStart(gate.started.promise, secondPrompt);
      assert.equal((await call('/c1', undefined, 'DELETE')).status, 200);
      assert.deepEqual(disposed, [], 'closing the original tab must retain the physical host used by its follower');
      gate.finish.resolve();
      assert.equal((await secondPrompt).status, 200);
      assert.equal((await prompt('c2', 'queue-2')).status, 200);
      assert.equal(calls.filter(call => call.method === 'session/prompt').length, 2);
      assert.ok(calls.filter(call => call.method === 'session/prompt').every(call => call.host === 0));
      assert.equal((await call('/c2', undefined, 'DELETE')).status, 200);
      assert.deepEqual(disposed.sort(), [0, 1]);
      assert.equal(nativeWriters.size, 0);
    } finally {
      gate.finish.resolve();
      await bridge.close();
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
}
