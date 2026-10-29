import { describe, test } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bridgeTestClient } from './bridge-test-client.ts';
import { createAstridAcpHttpServer } from './astrid-acp-bridge.ts';
import { ProjectChatRegistry } from './astrid-project-chat.ts';
import { AcpProcessHostError } from './acpProcessHost.ts';
import type { Project } from './runtime-client.ts';

describe('local ACP models are scoped and fixed from the connection default at new session creation', () => {
  for (const adapter of ['config', 'models'] as const) test(`${adapter} adapter`, async () => {
    const calls: Array<{ method: string; params: unknown }> = [];
    let releasePrompt: (() => void) | undefined;
    let signalPromptStarted: (() => void) | undefined;
    let nextSession = 0;
    const { server, bridge } = createAstridAcpHttpServer({
      config: { token: 'local-model-token', port: 0, cwd: '/tmp/local' },
      idFactory: () => 'c1',
      localAgentHostFactory: async () => ({
        initialize: async () => ({ protocolVersion: 1 }),
        request: async (method: string, params: unknown) => {
          calls.push({ method, params });
          if (method === 'session/new') {
            const sessionId = `claude-code:s${++nextSession}`;
            return adapter === 'config'
              ? { sessionId, configOptions: [{ id: 'model', currentValue: 'alpha', options: [{ group: 'g', options: [{ value: 'alpha', name: 'Alpha' }, { value: 'beta', name: 'Beta' }] }] }], models: { currentModelId: 'legacy/alpha-high', availableModels: [{ modelId: 'legacy/alpha-high', name: 'Alpha high' }] } }
              : { sessionId, models: { currentModelId: 'alpha', availableModels: [{ modelId: 'alpha', name: 'Alpha' }, { modelId: 'beta', name: 'Beta' }] } };
          }
          if (method === 'session/load') return adapter === 'config'
            ? { sessionId: (params as { sessionId: string }).sessionId, configOptions: [{ id: 'model', currentValue: 'beta', options: [{ group: 'g', options: [{ value: 'alpha', name: 'Alpha' }, { value: 'beta', name: 'Beta' }] }] }], models: { currentModelId: 'legacy/beta-high', availableModels: [{ modelId: 'legacy/beta-high', name: 'Beta high' }] } }
            : { sessionId: (params as { sessionId: string }).sessionId, models: { currentModelId: 'beta', availableModels: [{ modelId: 'alpha', name: 'Alpha' }, { modelId: 'beta', name: 'Beta' }] } };
          if (method === 'session/prompt') {
            signalPromptStarted?.();
            await new Promise<void>(resolve => { releasePrompt = resolve; });
          }
          if (method === 'session/set_model' || method === 'session/set_config_option') {
            const modelId = (params as { modelId?: string; value?: string }).modelId ?? (params as { value?: string }).value!;
            return adapter === 'config'
              ? { configOptions: [{ id: 'model', currentValue: modelId, options: [{ group: 'g', options: [{ value: 'alpha', name: 'Alpha' }, { value: 'beta', name: 'Beta' }] }] }], models: { currentModelId: `legacy/${modelId}-high`, availableModels: [{ modelId: `legacy/${modelId}-high`, name: 'legacy' }] } }
              : {}; // Legacy setters may acknowledge without returning model metadata.
          }
          return {};
        },
        cancel: async () => {},
        dispose: async () => {},
      } as never),
    });
    try {
      const call = bridgeTestClient(bridge, 'local-model-token');
      const connected = await call('/connect', { agent: 'claude-code', defaultModelId: 'beta' });
      assert.equal(connected.status, 200);
      const created = await call('/c1/rpc', { method: 'session/new', params: {} });
      assert.equal(created.status, 200);
      assert.deepEqual((await created.json() as { result: { models?: { currentModelId: string } } }).result.models?.currentModelId, 'beta');
      const defaultSelection = calls.find(call => call.method === (adapter === 'config' ? 'session/set_config_option' : 'session/set_model'))!;
      assert.ok(defaultSelection);
      assert.deepEqual(defaultSelection.params, adapter === 'config'
        ? { sessionId: 'claude-code:s1', configId: 'model', value: 'beta' }
        : { sessionId: 'claude-code:s1', modelId: 'beta' });
      const initialModelState = await (await call('/c1/models?sessionId=claude-code%3As1')).json() as { models: { currentModelId: string; availableModels: Array<{ modelId: string }> } };
      assert.equal(initialModelState.models.currentModelId, 'beta');
      assert.deepEqual(initialModelState.models.availableModels.map(model => model.modelId), ['alpha', 'beta']);
      assert.equal((await call('/c1/models?sessionId=foreign')).status, 400);
      const beforeRejectedChanges = calls.length;
      assert.equal((await call('/c1/model', { sessionId: 'claude-code:s1', modelId: 'alpha' })).status, 404);
      assert.equal((await call('/c1/rpc', { method: 'session/set_config_option', params: { sessionId: 'claude-code:s1', configId: 'model', value: 'alpha' } })).status, 409);
      assert.equal(calls.length, beforeRejectedChanges);
      const promptStarted = new Promise<void>(resolve => { signalPromptStarted = resolve; });
      const pending = call('/c1/rpc', { method: 'session/prompt', params: { sessionId: 'claude-code:s1', prompt: [] } });
      await promptStarted;
      assert.equal((await call('/c1/model', { sessionId: 'claude-code:s1', modelId: 'alpha' })).status, 404);
      releasePrompt?.();
      assert.equal((await pending).status, 200);
      const nextCreated = await call('/c1/rpc', { method: 'session/new', params: {} });
      assert.equal(nextCreated.status, 200);
      const nextSet = calls.filter(call => call.method === (adapter === 'config' ? 'session/set_config_option' : 'session/set_model')).at(-1)!;
      assert.deepEqual(nextSet.params, adapter === 'config'
        ? { sessionId: 'claude-code:s2', configId: 'model', value: 'beta' }
        : { sessionId: 'claude-code:s2', modelId: 'beta' });

      // Loading a saved chat retains its reported model and ignores the connection default.
      const loaded = await call('/c1/rpc', { method: 'session/load', params: { sessionId: 'claude-code:saved' } });
      assert.equal(loaded.status, 200);
      const loadedModels = await (await call('/c1/models?sessionId=claude-code%3Asaved')).json() as { models: { currentModelId: string } };
      assert.equal(loadedModels.models.currentModelId, 'beta');
      assert.equal((await call('/c1/rpc', { method: 'session/close', params: { sessionId: 'claude-code:saved' } })).status, 200);
      assert.equal((await call('/c1/models?sessionId=claude-code%3Asaved')).status, 400);
    } finally {
      releasePrompt?.();
      await bridge.close();
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});

test('local ACP connections without advertised models keep the ordinary session path', async () => {
  const calls: string[] = [];
  const { server, bridge } = createAstridAcpHttpServer({
    config: { token: 'local-model-token', port: 0, cwd: '/tmp/local' },
    idFactory: () => 'c1',
    localAgentHostFactory: async () => ({
      initialize: async () => ({ protocolVersion: 1 }),
      request: async (method: string) => { calls.push(method); return method === 'session/new' ? { sessionId: 'codex:plain' } : {}; },
      cancel: async () => {}, dispose: async () => {},
    } as never),
  });
  try {
    const call = bridgeTestClient(bridge, 'local-model-token');
    assert.equal((await call('/connect', { agent: 'codex' })).status, 200);
    assert.equal((await call('/c1/rpc', { method: 'session/new', params: {} })).status, 200);
    assert.deepEqual(calls, ['session/new']);
    assert.deepEqual(await (await call('/c1/models?sessionId=codex%3Aplain')).json(), { models: null });
  } finally {
    await bridge.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

describe('shared external session model catalog follows the writer and takeover for config and legacy model APIs', () => {
  for (const adapter of ['config', 'models'] as const) test(`${adapter} adapter`, async () => {
    const hostCalls: Array<Array<{ method: string; params: unknown }>> = [];
    const nativeNotify: Array<((notification: unknown) => void) | undefined> = [];
    let hostNumber = 0;
    const configOptions = (currentValue: string) => [{
      id: 'model', currentValue,
      options: [{ group: 'models', options: ['alpha', 'beta'].map(value => ({ value, name: value.toUpperCase() })) }],
    }];
    const modelList = (currentModelId: string, available = ['alpha', 'beta']) => ({ currentModelId, availableModels: available.map(modelId => ({ modelId, name: modelId.toUpperCase() })) });
    const { server, bridge } = createAstridAcpHttpServer({
      config: { token: 'shared-model-token', port: 0, cwd: '/tmp/local' },
      idFactory: (() => { let id = 0; return () => `c${++id}`; })(),
      localAgentHostFactory: async (_agent, options) => {
        const index = hostNumber++;
        const calls: Array<{ method: string; params: unknown }> = [];
        hostCalls[index] = calls;
        nativeNotify[index] = options.callbacks?.onNotification as ((notification: unknown) => void) | undefined;
        return {
          initialize: async () => ({ protocolVersion: 1 }),
          request: async (method: string, params: unknown) => {
            calls.push({ method, params });
            if (method === 'session/new') return {
              sessionId: 'claude-code:shared-model-session',
              ...(adapter === 'config' ? { configOptions: configOptions('alpha') } : { models: modelList('alpha') }),
            };
            if (method === 'session/load') return {
              sessionId: (params as { sessionId: string }).sessionId,
              ...(adapter === 'config' ? { configOptions: configOptions('alpha') } : { models: modelList('alpha') }),
            };
            if (method === 'session/set_config_option') return { configOptions: configOptions((params as { value: string }).value) };
            if (method === 'session/set_model') return { models: modelList((params as { modelId: string }).modelId) };
            return {};
          },
          cancel: async () => {}, dispose: async () => {},
        } as never;
      },
    });
    try {
      const call = bridgeTestClient(bridge, 'shared-model-token');
      assert.equal((await call('/connect', { agent: 'claude-code' })).status, 200);
      assert.equal((await call('/connect', { agent: 'claude-code' })).status, 200);
      const sessionId = 'claude-code:shared-model-session';
      assert.equal((await call('/c1/rpc', { method: 'session/new', params: {} })).status, 200);
      assert.equal((await call('/c2/rpc', { method: 'session/load', params: { sessionId } })).status, 200);
      const modelsUrl = `/c2/models?sessionId=${encodeURIComponent(sessionId)}`;
      const formerWriterModelsUrl = `/c1/models?sessionId=${encodeURIComponent(sessionId)}`;
      await call('/c2/events');
      const attachedModels = await (await call(modelsUrl)).json() as { models: { currentModelId: string; availableModels: Array<{ modelId: string }> } };
      assert.equal(attachedModels.models.currentModelId, 'alpha');
      assert.deepEqual(attachedModels.models.availableModels.map(model => model.modelId), ['alpha', 'beta']);
      assert.equal(hostCalls[1]!.length, 0); // follower attached from bridge cache

      const update = async (clientId: string, modelId: string) => adapter === 'config'
        ? call(`/${clientId}/rpc`, { method: 'session/set_config_option', params: { sessionId, configId: 'model', value: modelId } })
        : call(`/${clientId}/model`, { sessionId, modelId });
      const callsBeforeDenied = hostCalls.flat().length;
      for (const client of ['c1', 'c2']) {
        const denied = await update(client, 'beta');
        assert.equal(denied.status, adapter === 'config' ? 409 : 404);
      }
      assert.equal(hostCalls.flat().length, callsBeforeDenied);
      assert.equal((await call('/c2/rpc', { method: 'session/takeover', params: { sessionId } })).status, 200);
      assert.equal((await update('c2', 'beta')).status, adapter === 'config' ? 409 : 404);
      assert.equal(hostCalls.flat().length, callsBeforeDenied);
      assert.equal(((await (await call(modelsUrl)).json() as { models: { currentModelId: string } }).models.currentModelId), 'alpha');
      await call('/c1/events');
      await call('/c2/events');

      const changedCatalog = adapter === 'config'
        ? { sessionUpdate: 'config_option_update', configOptions: configOptions('gamma').map(item => ({ ...item, options: [{ group: 'models', options: ['beta', 'gamma'].map(value => ({ value, name: value.toUpperCase() })) }] })) }
        : { sessionUpdate: 'current_model_update', currentModelId: 'gamma', models: modelList('gamma', ['beta', 'gamma']) };
      nativeNotify[0]?.({ jsonrpc: '2.0', method: 'session/update', params: { sessionId, update: changedCatalog } });
      const nativeEvents = (await (await call('/c1/events')).json() as { notifications: Array<{ params?: { update?: Record<string, unknown> } }> }).notifications;
      const nativeUpdate = nativeEvents.find(event => event.params?.update?.sessionUpdate === changedCatalog.sessionUpdate)?.params?.update;
      assert.ok(nativeUpdate);
      if (adapter === 'config') {
        assert.equal((nativeUpdate!.configOptions as Array<{ currentValue: string }>)[0]!.currentValue, 'gamma');
        assert.deepEqual(((nativeUpdate!.configOptions as Array<{ options: Array<{ options: Array<{ value: string }> }> }>)[0]!.options[0]!.options).map(item => item.value), ['beta', 'gamma']);
      } else {
        assert.equal(nativeUpdate!.currentModelId, 'gamma');
        assert.deepEqual(((nativeUpdate!.models as { availableModels: Array<{ modelId: string }> }).availableModels).map(item => item.modelId), ['beta', 'gamma']);
      }
      const nativeLoadCount = hostCalls[0]!.filter(item => item.method === 'session/load').length;
      const reload = await call('/c1/rpc', { method: 'session/load', params: { sessionId } });
      assert.equal(reload.status, 200);
      const reloadResult = (await reload.json() as { result: Record<string, unknown> }).result;
      if (adapter === 'config') assert.equal((reloadResult.configOptions as Array<{ currentValue: string }>)[0]!.currentValue, 'gamma');
      else assert.equal((reloadResult.models as { currentModelId: string }).currentModelId, 'gamma');
      assert.equal(hostCalls[0]!.filter(item => item.method === 'session/load').length, nativeLoadCount);
      assert.equal(((await (await call(formerWriterModelsUrl)).json() as { models: { currentModelId: string } }).models.currentModelId), 'gamma');
    } finally {
      await bridge.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});

test('project registry session creation applies the connection default and rejects unavailable defaults', async () => {
  const calls: Array<{ method: string; params: unknown }> = [];
  let sessionNumber = 0;
  let connectionNumber = 0;
  const { server, bridge } = createAstridAcpHttpServer({
    config: { token: 'local-model-token', port: 0, cwd: '/tmp/local' },
    idFactory: () => `c${++connectionNumber}`,
    chatRegistry: {
      create: async (_projectId: string, _mode: string, _operationId: string, createSession: () => Promise<unknown>) => {
        const result = await createSession() as { sessionId: string };
        return { operation_session_id: result.sessionId };
      },
    } as never,
    localAgentHostFactory: async () => ({
      initialize: async () => ({ protocolVersion: 1 }),
      request: async (method: string, params: unknown) => {
        calls.push({ method, params });
        if (method === 'session/new') return { sessionId: `claude-code:project-${++sessionNumber}`, configOptions: [{ id: 'model', currentValue: 'alpha', options: [{ value: 'alpha', name: 'Alpha' }] }] };
        if (method === 'session/set_config_option') return { configOptions: [{ id: 'model', currentValue: 'alpha', options: [{ value: 'alpha', name: 'Alpha' }] }] };
        return {};
      },
      cancel: async () => {}, dispose: async () => {},
    } as never),
  });
  try {
    const call = bridgeTestClient(bridge, 'local-model-token');
    assert.equal((await call('/connect', { agent: 'claude-code', defaultModelId: 'alpha' })).status, 200);
    const created = await call('/projects/p1/chat/sessions', { connection_id: 'c1', mode: 'new', operation_id: 'project-create' });
    assert.equal(created.status, 200);
    assert.equal((await created.json() as { operation_session_id: string }).operation_session_id, 'claude-code:project-1');
    assert.deepEqual(calls.map(call => call.method), ['session/new', 'session/set_config_option']);

    // A separate connection with an unavailable default fails closed when the
    // new session reports its supported model config.
    assert.equal((await call('/connect', { agent: 'claude-code', defaultModelId: 'missing' })).status, 200);
    const unavailable = await call('/projects/p1/chat/sessions', { connection_id: 'c2', mode: 'new', operation_id: 'project-unavailable' });
    assert.equal(unavailable.status, 409);
  } finally {
    await bridge.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

describe('missing Claude and Codex persisted sessions recover in place with the agent default model', () => {
  const cases = [
    { agent: 'claude-code' as const, oldId: 'claude-code:empty', freshId: 'claude-code:fresh', adapterError: 'Resource not found' },
    { agent: 'codex' as const, oldId: 'codex:empty', freshId: 'codex:fresh', adapterError: 'No rollout found for thread ID empty' },
  ];
  for (const { agent, oldId, freshId, adapterError } of cases) test(agent, async () => {
    const projectId = `p-${agent}`;
    let project: Project = {
      project_id: projectId, realm_id: 'r', slug: projectId, name: projectId, metadata: {
        astrid_agent_chat_v1: { recovery: {
          revision: 1, selected_session_id: oldId, main_session_id: oldId,
          sessions: [{ id: oldId, title: 'Existing empty chat' }],
          draft: { text: '', revision: 0, queued_messages: [] },
        } },
      }, version: 1, created_at: '', updated_at: '',
    };
    const claimDirectory = mkdtempSync(join(tmpdir(), `local-chat-${agent}-`));
    const store = {
      getProject: async () => structuredClone(project),
      listProjects: async () => ({ items: [structuredClone(project)], next_cursor: null }),
      updateProject: async (_id: string, _key: string, version: number, _name?: string, metadata?: Record<string, unknown>) => {
        assert.equal(version, project.version);
        project = { ...project, version: version + 1, metadata: metadata ?? project.metadata };
        return structuredClone(project);
      },
    };
    const registry = new ProjectChatRegistry(store, 'recovery', Date.now, claimDirectory);
    const calls: Array<{ method: string; params: unknown }> = [];
    const { server, bridge } = createAstridAcpHttpServer({
      config: { token: 'recovery-token', port: 0, cwd: '/tmp/local' },
      chatRegistry: registry,
      idFactory: () => 'c1',
      localAgentHostFactory: async requestedAgent => {
        assert.equal(requestedAgent, agent);
        return {
          initialize: async () => ({ protocolVersion: 1 }),
          request: async (method: string, params: unknown) => {
            calls.push({ method, params });
            if (method === 'session/resume') throw new AcpProcessHostError(
              `ACP request "session/resume" failed: ${adapterError}`,
              { code: 'acp_transport', method },
            );
            if (method === 'session/new') return { sessionId: freshId, models: { currentModelId: 'alpha', availableModels: [{ modelId: 'alpha', name: 'Alpha' }, { modelId: 'beta', name: 'Beta' }] } };
            if (method === 'session/set_model') return { models: { currentModelId: (params as { modelId: string }).modelId, availableModels: [{ modelId: 'alpha', name: 'Alpha' }, { modelId: 'beta', name: 'Beta' }] } };
            return {};
          },
          cancel: async () => {}, dispose: async () => {},
        } as never;
      },
    });
    try {
      const call = bridgeTestClient(bridge, 'recovery-token');
      assert.equal((await call('/connect', { agent, defaultModelId: 'beta' })).status, 200);
      const resumed = await call(`/projects/${projectId}/chat/sessions`, {
        connection_id: 'c1', mode: 'ensure', operation_id: `reload-${agent}`, recover_session_id: oldId,
      });
      assert.equal(resumed.status, 200);
      const state = await resumed.json() as {
        selected_session_id: string; main_session_id: string | null;
        sessions: Array<{ id: string; title?: string; missing?: boolean }>;
      };
      assert.equal(state.selected_session_id, freshId);
      assert.equal(state.main_session_id, freshId);
      assert.deepEqual(state.sessions, [{ id: freshId, title: 'Existing empty chat', pending_first_message: true, model_id: 'beta' }]);
      assert.deepEqual(calls.map(({ method }) => method), ['session/resume', 'session/new', 'session/set_model']);
      assert.deepEqual(calls[0]!.params, { sessionId: oldId, cwd: '/tmp/local', mcpServers: [] });
      assert.deepEqual(calls[2]!.params, { sessionId: freshId, modelId: 'beta' });
    } finally {
      await bridge.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
      rmSync(claimDirectory, { recursive: true, force: true });
    }
  });
});

test('targeted recovery retains each same-agent chat model and leaves started missing chats alone', async () => {
  const projectId = 'codex-model-recovery';
  let project: Project = {
    project_id: projectId, realm_id: 'r', slug: projectId, name: projectId, metadata: {
      astrid_agent_chat_v1: { recovery: {
        revision: 1, selected_session_id: 'codex:empty-a', main_session_id: 'codex:empty-b',
        sessions: [
          { id: 'codex:empty-a', title: 'A', pending_first_message: true, model_id: 'alpha' },
          { id: 'codex:empty-b', title: 'B', pending_first_message: true, model_id: 'beta' },
          { id: 'codex:started', title: 'Started', pending_first_message: false, model_id: 'alpha' },
        ],
        draft: { text: '', revision: 0, queued_messages: [] },
      } },
    }, version: 1, created_at: '', updated_at: '',
  };
  const claimDirectory = mkdtempSync(join(tmpdir(), 'codex-model-recovery-'));
  const store = {
    getProject: async () => structuredClone(project),
    listProjects: async () => ({ items: [structuredClone(project)], next_cursor: null }),
    updateProject: async (_id: string, _key: string, version: number, _name?: string, metadata?: Record<string, unknown>) => {
      assert.equal(version, project.version);
      project = { ...project, version: version + 1, metadata: metadata ?? project.metadata };
      return structuredClone(project);
    },
  };
  const registry = new ProjectChatRegistry(store, 'recovery', Date.now, claimDirectory);
  const calls: Array<{ method: string; params: unknown }> = [];
  let nextId = 0;
  const models = [{ modelId: 'alpha', name: 'Alpha' }, { modelId: 'beta', name: 'Beta' }];
  const { server, bridge } = createAstridAcpHttpServer({
    config: { token: 'recovery-token', port: 0, cwd: '/tmp/local' },
    chatRegistry: registry,
    idFactory: () => 'c1',
    localAgentHostFactory: async agent => {
      assert.equal(agent, 'codex');
      return {
        initialize: async () => ({ protocolVersion: 1 }),
        request: async (method: string, params: unknown) => {
          calls.push({ method, params });
          if (method === 'session/resume') throw new AcpProcessHostError('ACP request "session/resume" failed: No rollout found for thread ID', { code: 'acp_transport', method });
          if (method === 'session/new') return { sessionId: `codex:fresh-${++nextId}`, models: { currentModelId: 'alpha', availableModels: models } };
          if (method === 'session/set_model') return { models: { currentModelId: (params as { modelId: string }).modelId, availableModels: models } };
          return {};
        },
        cancel: async () => {}, dispose: async () => {},
      } as never;
    },
  });
  try {
    const call = bridgeTestClient(bridge, 'recovery-token');
    assert.equal((await call('/connect', { agent: 'codex', defaultModelId: 'alpha' })).status, 200);
    const recover = async (sessionId: string, operationId: string) => call(`/projects/${projectId}/chat/sessions`, {
      connection_id: 'c1', mode: 'ensure', operation_id: operationId, recover_session_id: sessionId,
    });
    const first = await recover('codex:empty-a', 'recover-a');
    assert.equal(first.status, 200);
    const firstState = await first.json() as { selected_session_id: string; main_session_id: string | null };
    assert.equal(firstState.selected_session_id, 'codex:fresh-1');
    assert.equal(firstState.main_session_id, 'codex:empty-b');
    const second = await recover('codex:empty-b', 'recover-b');
    assert.equal(second.status, 200);
    const secondState = await second.json() as { selected_session_id: string; main_session_id: string | null };
    assert.equal(secondState.selected_session_id, 'codex:fresh-1');
    assert.equal(secondState.main_session_id, 'codex:fresh-2');
    const denied = await recover('codex:started', 'recover-started');
    assert.equal(denied.status, 409);
    assert.deepEqual(calls.filter(call => call.method === 'session/set_model').map(call => (call.params as { modelId: string }).modelId), ['alpha', 'beta']);
    const created = await call(`/projects/${projectId}/chat/sessions`, { connection_id: 'c1', mode: 'new', operation_id: 'regular-new' });
    assert.equal(created.status, 200);
    assert.deepEqual(calls.filter(call => call.method === 'session/set_model').map(call => (call.params as { modelId: string }).modelId), ['alpha', 'beta', 'alpha']);
    assert.deepEqual((await registry.get(projectId)).sessions, [
      { id: 'codex:fresh-1', title: 'A', pending_first_message: true, model_id: 'alpha' },
      { id: 'codex:fresh-2', title: 'B', pending_first_message: true, model_id: 'beta' },
      { id: 'codex:started', title: 'Started', pending_first_message: false, model_id: 'alpha' },
      { id: 'codex:fresh-3', model_id: 'alpha', pending_first_message: true },
    ]);
  } finally {
    await bridge.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(claimDirectory, { recursive: true, force: true });
  }
});

test('config model update notifications refresh only an owned session model cache', async () => {
  let onNotification: ((notification: unknown) => void) | undefined;
  const configOptions = (currentValue: string, values: string[]) => [{
    id: 'model', currentValue,
    options: [{ group: 'models', options: values.map(value => ({ value, name: value.toUpperCase() })) }],
  }];
  const { server, bridge } = createAstridAcpHttpServer({
    config: { token: 'local-model-token', port: 0, cwd: '/tmp/local' },
    idFactory: () => 'notify-connection',
    localAgentHostFactory: async (_agent, options) => {
      onNotification = options.callbacks?.onNotification;
      return {
        initialize: async () => ({ protocolVersion: 1 }),
        request: async (method: string, params: unknown) => method === 'session/load'
          ? { sessionId: (params as { sessionId: string }).sessionId, configOptions: configOptions('alpha', ['alpha', 'beta']) }
          : {},
        cancel: async () => {}, dispose: async () => {},
      } as never;
    },
  });
  try {
    const call = bridgeTestClient(bridge, 'local-model-token');
    assert.equal((await call('/connect', { agent: 'claude-code' })).status, 200);
    assert.equal((await call('/notify-connection/rpc', { method: 'session/load', params: { sessionId: 'claude-code:owned' } })).status, 200);
    assert.deepEqual(await (await call('/notify-connection/models?sessionId=claude-code%3Aowned')).json(), {
      models: { currentModelId: 'alpha', modelConfigId: 'model', availableModels: [{ modelId: 'alpha', name: 'ALPHA' }, { modelId: 'beta', name: 'BETA' }] },
    });
    onNotification?.({
      jsonrpc: '2.0', method: 'session/update',
      params: { sessionId: 'claude-code:owned', update: { sessionUpdate: 'config_option_update', configOptions: configOptions('gamma', ['beta', 'gamma']) } },
    });
    assert.deepEqual(await (await call('/notify-connection/models?sessionId=claude-code%3Aowned')).json(), {
      models: { currentModelId: 'gamma', modelConfigId: 'model', availableModels: [{ modelId: 'beta', name: 'BETA' }, { modelId: 'gamma', name: 'GAMMA' }] },
    });
    onNotification?.({
      jsonrpc: '2.0', method: 'session/update',
      params: { sessionId: 'claude-code:unowned', update: { sessionUpdate: 'config_option_update', configOptions: configOptions('gamma', ['gamma']) } },
    });
    assert.equal((await call('/notify-connection/models?sessionId=claude-code%3Aunowned')).status, 400);
  } finally {
    await bridge.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
