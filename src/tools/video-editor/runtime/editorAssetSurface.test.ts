import { describe, expect, it, vi } from 'vitest';
import { createEditorAssetSurface } from './editorAssetSurface.ts';
import type { TimelineData } from '@/tools/video-editor/lib/timeline-data.ts';
import type { AssetRegistry } from '@/tools/video-editor/types/index.ts';

function timelineData(assets: Record<string, Record<string, unknown>>): TimelineData {
  return { registry: { assets } } as unknown as TimelineData;
}

describe('editor asset surface', () => {
  it('reads current registry identity and delegates legacy profile reads', async () => {
    let data: TimelineData | null = timelineData({
      asset_a: {
        file: 'Interview.mov', type: 'video', media_id: 'media_a',
        content_sha256: 'sha256:abc', metadata: { category: 'source' },
      },
    });
    const loadProfile = vi.fn().mockResolvedValue({ transcript: { segments: [] } });
    const assets = createEditorAssetSurface(() => data, loadProfile);

    expect(assets.keys()).toEqual(['asset_a']);
    expect(assets.get('asset_a')).toMatchObject({
      file: 'Interview.mov', kind: 'video', media_id: 'media_a',
      content_sha256: 'sha256:abc', category: 'source',
    });
    expect(assets.search('category', 'source')).toEqual(['asset_a']);
    expect(assets.has('asset_a')).toBe(true);
    expect(await assets.loadProfile('asset_a')).toEqual({ transcript: { segments: [] } });
    expect(loadProfile).toHaveBeenCalledWith('asset_a');

    data = timelineData({ asset_b: { file: 'new.wav', type: 'audio' } });
    expect(assets.keys()).toEqual(['asset_b']);
    expect(assets.get('asset_a')).toBeUndefined();
  });

  it('includes assets played inside shots while preserving timeline registry precedence', () => {
    const data = timelineData({ shared: { media_id: 'timeline-id', type: 'video' } });
    let played: AssetRegistry | undefined = { assets: {
      shot_only: { media_id: 'shot-id', type: 'audio', file: 'Take.wav' },
      shared: { media_id: 'shot-shared-id', type: 'audio' },
    } };
    const assets = createEditorAssetSurface(() => data, undefined, () => played);

    expect(assets.keys()).toEqual(['shot_only', 'shared']);
    expect(assets.get('shot_only')).toMatchObject({ media_id: 'shot-id', kind: 'audio', file: 'Take.wav' });
    expect(assets.has('shot_only')).toBe(true);
    expect(assets.get('shared')?.media_id).toBe('timeline-id');

    played = undefined;
    expect(assets.get('shot_only')).toBeUndefined();
    expect(assets.keys()).toEqual(['shared']);
  });
});
