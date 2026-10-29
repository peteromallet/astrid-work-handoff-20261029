import { describe, expect, it } from 'vitest';
import { buildSegmentSlots } from './segmentSlotAssignment';

describe('buildSegmentSlots', () => {
  it('fills missing timeline slots with placeholders derived from live timeline data', () => {
    const slots = buildSegmentSlots({
      segments: [
        {
          id: 'child-1',
          child_order: 0,
          params: {},
        } as never,
      ],
      expectedSegmentData: {
        count: 2,
        frames: [12, 18],
        prompts: ['hold', 'pan right'],
        inputImages: ['img-a', 'img-b', 'img-c'],
        inputImageGenIds: ['gen-a', 'gen-b', 'gen-c'],
        pairShotGenIds: ['pair-1', 'pair-2'],
      },
      effectiveTimelineData: [
        { id: 'pair-1', generation_id: 'live-a', timeline_frame: 0 },
        { id: 'pair-2', generation_id: 'live-b', timeline_frame: 1 },
        { id: 'pair-3', generation_id: 'live-c', timeline_frame: 2 },
      ],
      liveShotGenIdToPosition: new Map(),
    });

    expect(slots).toHaveLength(2);
    expect(slots[0]).toEqual(
      expect.objectContaining({
        type: 'child',
        index: 0,
        pairShotGenerationId: 'pair-1',
      }),
    );
    expect(slots[1]).toEqual({
      type: 'placeholder',
      index: 1,
      expectedFrames: 18,
      expectedPrompt: 'pan right',
      startImage: 'live-b',
      endImage: 'live-c',
      pairShotGenerationId: 'pair-2',
    });
  });

  it('includes segment as orphan when start image is at last position (local positions)', () => {
    // Simulate: images [A, B, C] reordered to [B, C, A]
    // Segment for A (pairShotGenId = sg-A) — A is now at position 2 (last)
    const localPositions = new Map([
      ['sg-B', 0],
      ['sg-C', 1],
      ['sg-A', 2],
    ]);

    const slots = buildSegmentSlots({
      segments: [
        {
          id: 'seg-AB',
          location: 'video.mp4',
          pair_shot_generation_id: 'sg-A',
          params: {},
        } as never,
        {
          id: 'seg-BC',
          location: 'video2.mp4',
          pair_shot_generation_id: 'sg-B',
          params: {},
        } as never,
      ],
      expectedSegmentData: null,
      effectiveTimelineData: undefined,
      liveShotGenIdToPosition: new Map(),
      localShotGenPositions: localPositions,
    });

    // slotCount = 2 (3 images - 1). seg-BC gets slot 0. seg-AB is orphaned
    // (A at last position) but still included with index -1 for ID-based lookup.
    expect(slots).toHaveLength(3); // 1 child slot + 1 placeholder + 1 orphan
    expect(slots[0]).toEqual(
      expect.objectContaining({
        type: 'child',
        index: 0,
        child: expect.objectContaining({ id: 'seg-BC' }),
      }),
    );
    // Orphaned segment is appended with index -1, discoverable by pairShotGenerationId
    const orphan = slots.find(s => s.type === 'child' && s.pairShotGenerationId === 'sg-A');
    expect(orphan).toBeDefined();
    expect(orphan).toEqual(
      expect.objectContaining({
        type: 'child',
        index: -1,
        child: expect.objectContaining({ id: 'seg-AB' }),
        pairShotGenerationId: 'sg-A',
      }),
    );
  });

  it('prefers the child with a real location when multiple children collide on the same slot', () => {
    const slots = buildSegmentSlots({
      segments: [
        {
          id: 'child-empty',
          location: '',
          pair_shot_generation_id: 'pair-1',
          params: {},
        } as never,
        {
          id: 'child-complete',
          location: 'filled.png',
          pair_shot_generation_id: 'pair-1',
          params: {},
        } as never,
      ],
      expectedSegmentData: null,
      effectiveTimelineData: [
        { id: 'pair-1', generation_id: 'live-a', timeline_frame: 0 },
        { id: 'pair-2', generation_id: 'live-b', timeline_frame: 1 },
      ],
      liveShotGenIdToPosition: new Map([['pair-1', 0]]),
    });

    expect(slots).toHaveLength(1);
    expect(slots[0]).toEqual(
      expect.objectContaining({
        type: 'child',
        child: expect.objectContaining({
          id: 'child-complete',
          location: 'filled.png',
        }),
      }),
    );
  });
});
