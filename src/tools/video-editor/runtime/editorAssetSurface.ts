import type { CreativeAssetReadSurface } from '@/sdk/context.ts';
import type { AssetProfile } from '@/tools/video-editor/data/AssetResolver.ts';
import type { TimelineData } from '@/tools/video-editor/lib/timeline-data.ts';
import type { VideoEditorAssetResolver } from '@/tools/video-editor/lib/browser-runtime.ts';
import type { AssetRegistry } from '@/tools/video-editor/types/index.ts';

/** Preserve the resolver's profile hook precedence used by the editor. */
export async function loadEditorAssetProfile(
  resolver: VideoEditorAssetResolver,
  assetId: string,
  timelineId: string,
): Promise<AssetProfile | null> {
  const hooked = resolver as VideoEditorAssetResolver & {
    onProfileLoad?: (request: { assetId: string; timelineId: string }) => Promise<AssetProfile | null>;
  };
  if (hooked.onProfileLoad) return hooked.onProfileLoad({ assetId, timelineId });
  return resolver.loadAssetProfile?.(assetId) ?? null;
}

/** Create the editor's live asset registry view for extension contexts. */
export function createEditorAssetSurface(
  getData: () => TimelineData | null | undefined,
  loadProfile: (assetKey: string) => Promise<AssetProfile | null> = async () => null,
  getPlayedRegistry?: () => AssetRegistry | undefined,
): CreativeAssetReadSurface {
  // The projected composition includes assets inside placed shots. A timeline's
  // own registry remains authoritative if both registries contain the same key.
  const entries = () => ({
    ...getPlayedRegistry?.()?.assets,
    ...getData()?.registry.assets,
  });
  return {
    get(assetKey) {
      const entry = entries()[assetKey];
      return entry ? {
        ...(entry.metadata ?? {}),
        media_id: entry.media_id,
        content_sha256: entry.content_sha256,
        file: entry.file,
        kind: entry.type,
      } as NonNullable<ReturnType<CreativeAssetReadSurface['get']>> : undefined;
    },
    keys: () => Object.keys(entries()),
    has: (assetKey) => Object.prototype.hasOwnProperty.call(entries(), assetKey),
    search(fieldPath, value) {
      return Object.entries(entries()).filter(([, entry]) => {
        const field = fieldPath.split('.').reduce<unknown>((current, key) =>
          current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined,
        entry.metadata ?? entry);
        return field === value;
      }).map(([key]) => key);
    },
    loadProfile,
  };
}
