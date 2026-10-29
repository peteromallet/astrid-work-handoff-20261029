import { describe, expect, it } from 'vitest';

import fixture from '../data/shotComposition.fixture.json';
import { createShotCompositionAdapter } from '../data/shotCompositionAdapter.ts';
import { projectCanonicalComposition } from '../data/shotCompositionProjection.ts';
import { buildTimelineData } from './timeline-data';
import { createTimelineReader } from './timeline-reader.ts';
import { playedAssetRegistry, playedShotComposition, summarizeShotPlacements } from './timeline-shot-summaries.ts';

const prepared = createShotCompositionAdapter({ load: async () => fixture }).prepare(fixture);

describe('shot placements for timeline readers', () => {
  it('lists every placement in timeline order with the clips it plays, mapped to timeline seconds', () => {
    const shots = summarizeShotPlacements(prepared, null)!;
    const played = projectCanonicalComposition(prepared).config;
    expect(shots.map((shot) => shot.at)).toEqual([...shots.map((shot) => shot.at)].sort((a, b) => a - b));
    expect(new Set(shots.map((shot) => shot.id))).toEqual(new Set(prepared.occurrences.map((occurrence) => occurrence.occurrenceId)));
    const summarized = shots.flatMap((shot) => shot.clips.map((clip) => ({ shot, clip })));
    expect(summarized.length).toBeGreaterThan(0);
    for (const { shot, clip } of summarized) {
      expect(shot.name.length).toBeGreaterThan(0);
      expect(clip.id.startsWith(`${shot.id}:`)).toBe(true);
      const source = played.clips.find((candidate) => candidate.id === clip.id)!;
      expect(clip.at).toBe(source.at);
      expect(clip.assetKey).toBe(source.asset);
      expect(clip.sourceOffset).toBe(source.from ?? 0);
    }
  });

  it('feeds reader snapshots, recomputing only when the played composition changes', async () => {
    const data = await buildTimelineData({ output: { resolution: '1920x1080', fps: 30, file: 'out.mp4' }, tracks: [], clips: [] }, { assets: {} });
    let composition: typeof prepared | null = prepared;
    const reader = createTimelineReader({ data, shotComposition: () => composition });
    const first = reader.snapshot();
    expect(first.shots).toEqual(summarizeShotPlacements(prepared, data.resolvedConfig));
    expect(reader.snapshot()).toBe(first);
    composition = null;
    expect(reader.snapshot().shots).toBeUndefined();
  });

  it('plays the child-shot draft first, and only for local canonical editors', () => {
    const draft = { composition: { ...prepared } } as never;
    expect(playedShotComposition(null, { shotComposition: {} as never, canonicalComposition: prepared })).toBe(prepared);
    expect(playedShotComposition(null, { shotComposition: {} as never, canonicalComposition: prepared, canonicalDraft: draft })).toBe((draft as { composition: unknown }).composition);
    expect(playedShotComposition('user', { shotComposition: {} as never, canonicalComposition: prepared })).toBeNull();
    expect(playedShotComposition(null, { canonicalComposition: prepared })).toBeNull();
  });

  it('resolves the media identity of assets that only exist inside shots', () => {
    const registry = playedAssetRegistry(prepared, null)!;
    const assetKey = summarizeShotPlacements(prepared, null)!.flatMap((shot) => shot.clips).find((clip) => clip.assetKey)?.assetKey;
    expect(assetKey).toBeDefined();
    expect(registry.assets[assetKey!]?.media_id).toBeTruthy();
    expect(playedAssetRegistry(null, null)).toBeUndefined();
  });
});
