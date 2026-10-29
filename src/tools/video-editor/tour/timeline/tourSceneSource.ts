import type { ProjectObjectMetadata, ProjectObjectStorage } from '@/sdk/video/assets/projectObjects.ts';
import { EDITOR_TOUR_ASSET_MANIFEST, editorTourAssetUrl } from '../tourMedia.ts';

/** The completed guide: continuous bird flight and early descent into town. */
export const TOUR_SCENE_SOURCE_FROM = 2.5;
export const TOUR_SCENE_SOURCE_TO = 16.5;

async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return `sha256:${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** Content-addressed bytes held in memory only; the tour never talks to a project object plane. */
function createMemoryObjectStorage(): ProjectObjectStorage {
  const objects = new Map<string, Uint8Array>();
  return {
    async ingest(bytes, mediaType, filename): Promise<ProjectObjectMetadata> {
      const digest = await sha256(bytes);
      const objectId = `tour-object-${globalThis.crypto.randomUUID()}`;
      objects.set(objectId, new Uint8Array(bytes));
      return { object_id: objectId, digest, media_type: mediaType, size: bytes.byteLength, filename };
    },
    async read(objectId) {
      const bytes = objects.get(objectId);
      if (!bytes) throw new Error(`Tour object ${objectId} is not in memory.`);
      return new Uint8Array(bytes);
    },
  };
}

let liveScenePromise: Promise<Record<string, unknown>> | null = null;

/** Load and verify the portable world, then create this session's object identities. */
export function loadTourLiveScene(): Promise<Record<string, unknown>> {
  liveScenePromise ??= (async () => {
    const asset = EDITOR_TOUR_ASSET_MANIFEST.assets.world;
    const [response, { parsePreparedScenePackage, ingestPreparedPackage }] = await Promise.all([
      fetch(editorTourAssetUrl(asset.filename), { credentials: 'omit' }),
      import('@astrid/packs/rendering/ui/threejs-live-editor/authoring'),
    ]);
    if (!response.ok) throw new Error(`Could not load the tour world (${response.status}).`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== asset.size || await sha256(bytes) !== `sha256:${asset.sha256}`) {
      throw new Error('The tour world failed its integrity check.');
    }
    const parsed = await parsePreparedScenePackage(bytes);
    return (await ingestPreparedPackage(createMemoryObjectStorage(), parsed)).liveScene;
  })().catch((error) => {
    liveScenePromise = null;
    throw error;
  });
  return liveScenePromise;
}
