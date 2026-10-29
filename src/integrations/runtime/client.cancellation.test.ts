import { afterEach, describe, expect, it, vi } from "vitest";
import { AstridRuntimeClient } from "./client.ts";
import { RUNTIME_SCHEMA_DIGEST, RUNTIME_TARGETED_EXECUTION_CAPABILITY } from './contract-metadata.ts';

describe("Runtime client request cancellation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("passes the attempt AbortSignal to the health and handshake fetches", async () => {
    const controller = new AbortController();
    const observedSignals: AbortSignal[] = [];
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal;
      if (!(signal instanceof AbortSignal)) throw new Error("request omitted AbortSignal");
      observedSignals.push(signal);
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new AstridRuntimeClient({
      baseUrl: "https://runtime.test",
      readOnly: true,
      expectedIdentity: { actorId: "actor-a", realmId: "realm-a", runtimeInstanceId: "runtime-a" },
    }).withSignal(controller.signal);
    const opening = client.ensureSession();

    // Both independent session requests start synchronously before the first await.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(observedSignals).toEqual([controller.signal, controller.signal]);
    controller.abort();
    await expect(opening).rejects.toThrow();
    expect(observedSignals.every((signal) => signal.aborted)).toBe(true);
  });

  it('keeps the Runtime identity fence across separate cancellable attempts', async () => {
    let instance = 'runtime-a';
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      const body = path === '/v1/health'
        ? { status: 'ok', schema_digest: RUNTIME_SCHEMA_DIGEST, runtime_instance_id: instance }
        : path === '/v1/handshake'
          ? { actor_id: 'product', realm_id: 'realm', schema_digest: RUNTIME_SCHEMA_DIGEST,
              scopes: ['handshake', 'projects:read', 'projects:write', 'objects:read', 'objects:write', 'tasks:read', 'tasks:write'],
              capabilities: [RUNTIME_TARGETED_EXECUTION_CAPABILITY] }
          : path === '/v1/realm' ? { realm_id: 'realm' } : { items: [], next_cursor: null };
      return new Response(JSON.stringify(body));
    }));
    const client = new AstridRuntimeClient({ baseUrl: 'https://runtime.test', readOnly: true });
    await expect(client.withSignal(new AbortController().signal).listProjects()).resolves.toEqual([]);
    instance = 'runtime-b';
    await expect(client.withSignal(new AbortController().signal).listProjects()).rejects.toThrow('Runtime restarted');
    instance = 'runtime-a';
    await expect(client.withSignal(new AbortController().signal).listProjects()).rejects.toThrow('Runtime restarted');
  });
});
