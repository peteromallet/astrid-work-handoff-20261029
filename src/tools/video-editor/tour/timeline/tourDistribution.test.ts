import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import manifest from '../asset-manifest.json';
import { parsePreparedScenePackage, ingestPreparedPackage } from '@astrid/packs/rendering/ui/threejs-live-editor/authoring';
import type { ProjectObjectStorage } from '@/sdk/video/assets/projectObjects.ts';

afterEach(() => vi.unstubAllGlobals());

it('imports the distributed world through the real authoring contract into empty session storage', async () => {
  vi.stubGlobal('crypto', webcrypto);
  const asset = manifest.assets.world;
  const bytes = await readFile(`public/astrid/onboarding/${manifest.version}/${asset.filename}`);
  const parsed = await parsePreparedScenePackage(new Uint8Array(bytes));
  const objects = new Map<string, Uint8Array>();
  const storage: ProjectObjectStorage = {
    async ingest(value, mediaType, filename) {
      const hash = await webcrypto.subtle.digest('SHA-256', value);
      const digest = `sha256:${Buffer.from(hash).toString('hex')}`;
      const objectId = `fresh-session-${objects.size}`;
      objects.set(objectId, value);
      return { object_id: objectId, digest, media_type: mediaType, filename, size: value.byteLength };
    },
    async read(id) { const value = objects.get(id); if (!value) throw new Error('Missing object'); return value; },
  };
  const result = await ingestPreparedPackage(storage, parsed);
  expect(objects.size).toBe(2);
  expect(result.liveScene.html).toContain('window.astridScene');
  expect(result.liveScene.source).toEqual({ objectId: 'fresh-session-1', revision: result.package.digest });
  expect(JSON.parse(result.liveScene.packageBody as string).entry.object_id).toBe('fresh-session-0');
  expect(parsed.manifest.duration).toBeGreaterThanOrEqual(manifest.sourceTo);
  expect(manifest.assets.still4.sha256).toBe('e2f106ce2e53434487e24da748ddac7eb28aee43afe2b6f768efbd901622d31f');
});
