import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The gateway origin is the only difference between the two cases below, so the origin is the one mutable mock.
let origin = '';
vi.mock('@/integrations/runtime/connection.ts', () => ({ runtimeOrigin: () => origin }));
vi.mock('virtual:astrid-element-admissions', () => ({
  projectId: null, configured: true, selectionDigest: 'compiled', realmId: 'realm', projects: [], elements: [], components: {},
}));

let host: typeof import('./admitted-elements');
const fetchMock = vi.fn();

beforeEach(async () => {
  origin = '';
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.resetModules();
  host = await import('./admitted-elements');
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('element admissions on the hosted build', () => {
  it('with the gateway origin, skips the refresh, sends nothing and keeps the compiled set', async () => {
    origin = 'http://127.0.0.1:17340';
    host.setAdmittedElementScope('project', []);
    const compiled = host.getAdmittedElementSelection();

    await expect(host.refreshAdmittedElements()).resolves.toBe(compiled);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(host.getAdmittedElementSelection()).toBe(compiled);
    expect(host.getAdmittedElementReadiness()).toMatchObject({ projectId: 'project', phase: 'ready', error: null });
    expect(host.usesScopedElementAdmissions()).toBe(false);
  });

  it('with the gateway origin, applying a pack ref sends nothing and settles at once', async () => {
    origin = 'http://127.0.0.1:17340';
    const ref = { packId: 'project_pack', kind: 'effect' as const, id: 'blocks', revision: 'r1' };
    host.setAdmittedElementScope('project', []);

    await host.refreshAdmittedElementRef(ref);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(host.getAdmittedElementReadiness()).toMatchObject({ phase: 'ready', error: null });
    expect(host.isAdmittedElementPreviewPreparing('project', [ref])).toBe(false);
  });

  it('same-origin is unchanged: the refresh asks the local admission route', async () => {
    host.setAdmittedElementScope('project', []);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ digest: 'empty', moduleUrl: '' }) });

    await host.refreshAdmittedElements();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/astrid-element-admissions');
    expect(host.usesScopedElementAdmissions()).toBe(true);
  });
});
