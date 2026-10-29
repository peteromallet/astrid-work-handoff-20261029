import { describe, expect, it } from 'vitest';
import { getGenerationAssetDisplayMetadata, planGenerationAssetRegistration } from './timeline-asset-plans.ts';

describe('planGenerationAssetRegistration content type', () => {
  it('reads the MIME type from metadata so a Runtime video is not registered as a still image', () => {
    // Runtime generation rows carry their MIME type (e.g. video/mp4) in metadata.content_type.
    const withType = planGenerationAssetRegistration({
      generationId: 'g',
      variantType: 'image',
      imageUrl: '/api/runtime/v1/objects/sha256%3Aabc',
      metadata: { content_type: 'video/mp4' },
    });
    expect(withType).toMatchObject({ ok: true, assetEntry: { type: 'video/mp4' } });

    const withoutType = planGenerationAssetRegistration({
      generationId: 'g',
      variantType: 'image',
      imageUrl: '/api/runtime/v1/objects/sha256%3Aabc',
    });
    expect(withoutType).toMatchObject({ ok: true, assetEntry: { type: 'image/png' } });
  });

  it('keeps generation names on the asset registry entry for timeline labels', () => {
    const planned = planGenerationAssetRegistration({
      generationId: 'g',
      variantType: 'video',
      imageUrl: '/api/runtime/v1/objects/sha256%3Aabc',
      metadata: {
        original_filename: 'camera/clip.mp4',
        prompt: 'A slow pan over a valley',
      },
    });

    expect(planned).toMatchObject({
      ok: true,
      assetEntry: {
        original_filename: 'camera/clip.mp4',
        prompt: 'A slow pan over a valley',
      },
    });
  });

  it('collects original filename, display name, and prompt from generation records', () => {
    expect(getGenerationAssetDisplayMetadata({
      name: 'Mountain pass',
      metadata: { title: 'Opening shot' },
      params: {
        prompt: 'A slow pan across a valley',
        extra: { original_filename: 'camera/valley.mp4' },
      },
    })).toEqual({
      original_filename: 'camera/valley.mp4',
      name: 'Mountain pass',
      title: 'Opening shot',
      prompt: 'A slow pan across a valley',
    });
  });
});
