import { describe, expect, it, vi } from 'vitest';
import { createDataKindItemsHost } from './dataKindItems.ts';
import { sourceToTimelineTime, timelineToSourceTime } from '@/sdk/video/timeline/sourceTime.ts';
import { assembleDataLanes } from '@/tools/video-editor/data/typed/assembleDataLanes.ts';
import type { TimelineData } from '@/tools/video-editor/lib/timeline-data.ts';
import { buildTimelineData } from '@/tools/video-editor/lib/timeline-data.ts';
import type { SourceFrozenDataItem } from '@/tools/video-editor/data/typed/envelope.ts';

const item: SourceFrozenDataItem = {
  id: 'word-1', shape: 'interval', domain: 'source_seconds',
  extent: { start: 2, end: 4 }, schemaRef: 'example.words/v1',
  payload: { text: 'hello' }, sourceArtifactRef: { assetId: 'a' },
  provenance: { adapterId: 'example', adapterVersion: '1' },
};

describe('data-kind item channels', () => {
  it('routes persisted replacements through the saved timeline commit', async () => {
    const dataRef = { current: await buildTimelineData({
      output: { resolution: '1920x1080', fps: 30, file: 'out.mp4' }, tracks: [], clips: [],
    }, { assets: {} }, (file) => file) };
    const commitData = vi.fn((next: TimelineData) => { dataRef.current = next; });
    const host = createDataKindItemsHost({ dataRef, commitData });
    host.replacePersisted(item.schemaRef, [item]);
    expect(host.readPersisted(item.schemaRef)).toEqual([item]);
    expect(host.readTransient(item.schemaRef)).toEqual([]);
    expect(commitData.mock.calls[0][1]).toEqual({ save: true, semantic: true });
  });
  it('keeps transient projections outside TimelineData and notifies listeners', () => {
    const dataRef = { current: { sourceItemsBySchemaRef: {} } as TimelineData };
    const commitData = vi.fn();
    const host = createDataKindItemsHost({ dataRef, commitData });
    const listener = vi.fn();
    const stop = host.subscribe(listener);
    host.replaceTransient(item.schemaRef, [item]);
    expect(host.readTransient(item.schemaRef)).toEqual([item]);
    expect(dataRef.current.sourceItemsBySchemaRef).toEqual({});
    expect(commitData).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledTimes(1);
    host.replaceTransient(item.schemaRef, []);
    stop();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(() => host.replaceTransient('other/v1', [item])).toThrow('must use other/v1');
  });

  it('projects supplied source items through the generic lane path', () => {
    const lanes = assembleDataLanes({
      kinds: [{ kindId: 'example.words', schemaRef: item.schemaRef, shape: 'interval', domain: 'source_seconds' }],
      clips: [{ id: 'c', at: 10, from: 2, to: 8, speed: 2, asset: 'a' }] as never,
      segmentsByAsset: {},
      transientSourceItemsBySchemaRef: { [item.schemaRef]: [item] },
    });
    expect(lanes[0].items[0].timelineStart).toBe(10);
    expect(lanes[0].items[0].timelineEnd).toBe(11);
  });

  it('exposes only inverse trim/speed arithmetic in the SDK helper', () => {
    const clip = { at: 10, from: 2, speed: 2 };
    expect(sourceToTimelineTime(clip, 6)).toBe(12);
    expect(timelineToSourceTime(clip, 12)).toBe(6);
    expect(sourceToTimelineTime({ at: 3, from: 1, speed: 0 }, 5)).toBe(7);
  });
});
