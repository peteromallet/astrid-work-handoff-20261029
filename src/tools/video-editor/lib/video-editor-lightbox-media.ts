import type { GenerationRow } from '@/domains/generation/types/index.ts';
import type { ResolvedAssetRegistryEntry } from '@/tools/video-editor/types/index.ts';
import { isOpenableAssetType } from './editor-utils.ts';
import { getAssetDisplayReference, getAssetResolvedSource } from './asset-registry.ts';

export function buildVideoEditorLightboxMedia(
  assetKey: string | null,
  asset: ResolvedAssetRegistryEntry | undefined,
): GenerationRow | null {
  if (!assetKey || !asset) {
    return null;
  }

  const src = getAssetResolvedSource(asset);
  if (!src || !isOpenableAssetType(asset.type, src)) {
    return null;
  }

  const isVideo = asset.type?.startsWith('video/')
    || /\.(mp4|mov|webm|m4v)(\?.*)?$/i.test(src);

  return {
    id: assetKey,
    generation_id: asset.generationId || assetKey,
    location: src,
    imageUrl: src,
    thumbUrl: asset.thumbnailUrl || src,
    type: isVideo ? 'video' : 'image',
    primary_variant_id: asset.variantId || null,
    name: getAssetDisplayReference(asset, assetKey),
  };
}
