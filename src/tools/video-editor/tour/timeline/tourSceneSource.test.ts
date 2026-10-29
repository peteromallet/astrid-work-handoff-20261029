import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

const html = '<!doctype html><title>Portable world</title>';
const bytes = new TextEncoder().encode(JSON.stringify({ html }));
const digest = async (value: Uint8Array) => Array.from(new Uint8Array(await webcrypto.subtle.digest('SHA-256', value)), (v) => v.toString(16).padStart(2, '0')).join('');

vi.mock('@astrid/packs/rendering/ui/threejs-live-editor/authoring', () => ({
  parsePreparedScenePackage: async (input: Uint8Array) => JSON.parse(new TextDecoder().decode(input)),
  ingestPreparedPackage: async (storage: { ingest: (bytes: Uint8Array, type: string, filename: string) => Promise<{object_id: string}> }, parsed: {html: string}) => {
    const object = await storage.ingest(new TextEncoder().encode(parsed.html), 'text/html', 'entry.html');
    return { liveScene: { html: parsed.html, source: { objectId: object.object_id } } };
  },
}));

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); vi.doUnmock('../tourMedia.ts'); });

async function setup(responseBytes = bytes) {
  vi.stubGlobal('crypto', webcrypto);
  const expectedDigest = await digest(bytes);
  vi.doMock('../tourMedia.ts', () => ({
    EDITOR_TOUR_ASSET_MANIFEST: { assets: { world: { filename: `${expectedDigest}.json`, sha256: expectedDigest, size: bytes.length } } },
    editorTourAssetUrl: (name: string) => `https://assets.example.test/${name}`,
  }));
  const fetch = vi.fn(async () => new Response(responseBytes));
  vi.stubGlobal('fetch', fetch);
  return { fetch, ...(await import('./tourSceneSource.ts')) };
}

describe('portable editor tour world', () => {
  it('loads without runtime credentials, caches within a session, and gives a new session its own object identity', async () => {
    const first = await setup();
    const one = await first.loadTourLiveScene();
    expect(await first.loadTourLiveScene()).toBe(one);
    expect(first.fetch).toHaveBeenCalledTimes(1);
    expect(first.fetch).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/assets.example.test\/[a-f0-9]{64}\.json$/), { credentials: 'omit' });
    vi.resetModules();
    const next = await import('./tourSceneSource.ts');
    const two = await next.loadTourLiveScene();
    expect(two.html).toBe(html);
    expect(two.source).not.toEqual(one.source);
    expect(next.TOUR_SCENE_SOURCE_TO - next.TOUR_SCENE_SOURCE_FROM).toBe(14);
  });

  it('rejects corrupted bytes and can retry after a failed download', async () => {
    const source = await setup(new TextEncoder().encode('corrupt'));
    await expect(source.loadTourLiveScene()).rejects.toThrow('integrity check');
    source.fetch.mockImplementation(async () => new Response(bytes));
    expect((await source.loadTourLiveScene()).html).toBe(html);
  });
});
