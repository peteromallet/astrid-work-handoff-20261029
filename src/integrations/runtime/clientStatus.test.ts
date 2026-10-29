import { describe, expect, it } from 'vitest';
import { RUNTIME_CLIENT_SCOPES } from './client.ts';
import { AstridRuntimeClient, RuntimeCompatibilityError } from './client.ts';
import { RUNTIME_SCHEMA_DIGEST, RUNTIME_TARGETED_EXECUTION_CAPABILITY } from './contract-metadata.ts';
import type { Transport } from './generated.ts';

function health(status: 'ok' | 'degraded', instance = 'runtime-1', serviceState: 'running' | 'failed' = 'running') {
  return {
    status,
    protocol: 'workspace.v1',
    schema_digest: RUNTIME_SCHEMA_DIGEST,
    runtime_epoch: 1,
    runtime_session_id: 'session-1',
    runtime_instance_id: instance,
    services: [{ name: 'pack-host', state: serviceState, last_exit: serviceState === 'failed' ? 1 : null, restart_count: serviceState === 'failed' ? 1 : 0 }],
  };
}

function statusTransport(healthResponses: unknown[]): { transport: Transport; calls: string[] } {
  const calls: string[] = [];
  const transport: Transport = async (_method, endpoint) => {
    calls.push(endpoint);
    let body: unknown;
    if (endpoint === '/v1/health') {
      body = healthResponses.shift();
      if (!body) throw new Error('unexpected extra health request');
    } else if (endpoint === '/v1/handshake') {
      body = {
        protocol: 'workspace.v1',
        schema_digest: RUNTIME_SCHEMA_DIGEST,
        session_id: 'session-1',
        actor_id: 'astrid-browser',
        realm_id: 'realm-1',
        scopes: RUNTIME_CLIENT_SCOPES,
        capabilities: [RUNTIME_TARGETED_EXECUTION_CAPABILITY],
      };
    } else if (endpoint === '/v1/realm') {
      body = { realm_id: 'realm-1', display_name: 'Studio', version: 3, created_at: '2026-01-01T00:00:00Z' };
    } else {
      throw new Error(`unexpected endpoint: ${endpoint}`);
    }
    return { status: 200, headers: {}, body: new TextEncoder().encode(JSON.stringify(body)) };
  };
  return { transport, calls };
}

describe('AstridRuntimeClient.readStatus', () => {
  it('reads fresh services and workspace details when the first Runtime health is degraded', async () => {
    const { transport, calls } = statusTransport([
      health('degraded'),
      health('degraded'),
      health('degraded', 'runtime-1', 'failed'),
    ]);
    const client = new AstridRuntimeClient({ transport });

    const status = await client.readStatus();

    expect(status.health.status).toBe('degraded');
    expect(status.health.services).toEqual([
      { name: 'pack-host', state: 'failed', last_exit: 1, restart_count: 1 },
    ]);
    expect(status.realm).toMatchObject({ realm_id: 'realm-1', display_name: 'Studio', version: 3 });
    expect(calls.filter((endpoint) => endpoint === '/v1/health')).toHaveLength(3);
    expect(calls).toContain('/v1/handshake');
    expect(calls).toContain('/v1/realm');
  });

  it('rejects fresh health from a different Runtime instance than the negotiated workspace', async () => {
    const { transport } = statusTransport([health('ok'), health('ok', 'runtime-2')]);
    const client = new AstridRuntimeClient({ transport });

    await expect(client.readStatus()).rejects.toBeInstanceOf(RuntimeCompatibilityError);
  });

  it('rejects a fresh Runtime instance that differs from a pinned profile identity', async () => {
    const { transport } = statusTransport([health('ok'), health('ok', 'runtime-2')]);
    const client = new AstridRuntimeClient({
      transport,
      expectedIdentity: { actorId: 'astrid-browser', realmId: 'realm-1', runtimeInstanceId: 'runtime-1' },
    });

    await expect(client.readStatus()).rejects.toBeInstanceOf(RuntimeCompatibilityError);
  });
});
