import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { GenerationRow } from '@/domains/generation/types';

vi.mock('@/shared/lib/media/mediaTypeHelpers', () => ({
  getGenerationId: (gen: { generation_id?: string; id: string }) => gen.generation_id || gen.id,
}));

import { useSegmentOutputsForShot } from '../useSegmentOutputsForShot';

function createSegmentOutputGenerationRow(overrides: Partial<GenerationRow> = {}): GenerationRow {
  return {
    id: `gen-${Math.random().toString(36).slice(2)}`,
    generation_id: overrides.generation_id || `gen-id-${Math.random().toString(36).slice(2)}`,
    location: 'https://example.com/video.mp4',
    imageUrl: 'https://example.com/video.mp4',
    thumbUrl: 'https://example.com/thumb.png',
    type: 'video',
    created_at: '2025-01-01T00:00:00Z',
    createdAt: '2025-01-01T00:00:00Z',
    params: {},
    starred: false,
    timeline_frame: null,
    ...overrides,
  } as GenerationRow;
}

describe('useSegmentOutputsForShot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('with preloaded data', () => {
    it('derives parent generations from preloaded data', () => {
      const parentGen = createSegmentOutputGenerationRow({
        id: 'sg-parent',
        generation_id: 'parent-gen-id',
        type: 'video',
        parent_generation_id: undefined,
        params: { orchestrator_details: { num_new_segments_to_generate: 2 } },
      });

      const childGen = createSegmentOutputGenerationRow({
        id: 'sg-child',
        generation_id: 'child-gen-id',
        type: 'video',
        parent_generation_id: 'parent-gen-id',
        params: { segment_index: 0 },
      });

      const { result } = renderHook(
        () =>
          useSegmentOutputsForShot(
            'shot-1',
            undefined,
            undefined,
            undefined,
            [parentGen, childGen]
          )
      );

      expect(result.current.parentGenerations).toHaveLength(1);
      expect(result.current.parentGenerations[0].id).toBe('sg-parent');
    });

    it('excludes child generations from parent list', () => {
      const parentGen = createSegmentOutputGenerationRow({
        id: 'sg-parent',
        generation_id: 'parent-gen-id',
        type: 'video',
        parent_generation_id: undefined,
        params: { orchestrator_details: { num_new_segments_to_generate: 1 } },
      });

      const childGen = createSegmentOutputGenerationRow({
        id: 'sg-child',
        generation_id: 'child-gen-id',
        type: 'video',
        parent_generation_id: 'parent-gen-id',
        params: { segment_index: 0, orchestrator_details: {} },
      });

      const { result } = renderHook(
        () =>
          useSegmentOutputsForShot(
            'shot-1',
            undefined,
            undefined,
            undefined,
            [parentGen, childGen]
          )
      );

      // Only parent should be in the list
      const parentIds = result.current.parentGenerations.map(p => p.id);
      expect(parentIds).toContain('sg-parent');
      expect(parentIds).not.toContain('sg-child');
    });

    it('excludes non-video generations from parent list', () => {
      const imageGen = createSegmentOutputGenerationRow({
        id: 'sg-image',
        generation_id: 'image-gen-id',
        type: 'image',
        parent_generation_id: undefined,
        params: { orchestrator_details: {} },
      });

      const { result } = renderHook(
        () =>
          useSegmentOutputsForShot(
            'shot-1',
            undefined,
            undefined,
            undefined,
            [imageGen]
          )
      );

      expect(result.current.parentGenerations).toHaveLength(0);
    });

    it('sorts parent generations by created_at descending', () => {
      const older = createSegmentOutputGenerationRow({
        id: 'sg-older',
        generation_id: 'older-gen-id',
        type: 'video',
        created_at: '2025-01-01T00:00:00Z',
        parent_generation_id: undefined,
        params: { orchestrator_details: {} },
      });

      const newer = createSegmentOutputGenerationRow({
        id: 'sg-newer',
        generation_id: 'newer-gen-id',
        type: 'video',
        created_at: '2025-06-01T00:00:00Z',
        parent_generation_id: undefined,
        params: { orchestrator_details: {} },
      });

      const { result } = renderHook(
        () =>
          useSegmentOutputsForShot(
            'shot-1',
            undefined,
            undefined,
            undefined,
            [older, newer]
          )
      );

      expect(result.current.parentGenerations[0].id).toBe('sg-newer');
      expect(result.current.parentGenerations[1].id).toBe('sg-older');
    });
  });

  describe('controlled vs uncontrolled mode', () => {
    it('uses internal state in uncontrolled mode', () => {
      const { result } = renderHook(
        () => useSegmentOutputsForShot('shot-1')
      );

      expect(result.current.selectedParentId).toBeNull();
    });

    it('uses controlled value when provided', () => {
      const { result } = renderHook(
        () =>
          useSegmentOutputsForShot(
            'shot-1',
            undefined,
            'controlled-id',
            vi.fn()
          )
      );

      expect(result.current.selectedParentId).toBe('controlled-id');
    });

    it('calls onSelectedParentChange in controlled mode', () => {
      const onChange = vi.fn();
      const { result } = renderHook(
        () =>
          useSegmentOutputsForShot(
            'shot-1',
            undefined,
            'controlled-id',
            onChange
          )
      );

      act(() => {
        result.current.setSelectedParentId('new-id');
      });

      expect(onChange).toHaveBeenCalledWith('new-id');
    });
  });

  describe('segment progress', () => {
    it('computes progress from segment slots', () => {
      // With no data, should be 0/0
      const { result } = renderHook(
        () => useSegmentOutputsForShot('shot-1')
      );

      expect(result.current.segmentProgress).toEqual({ completed: 0, total: 0 });
    });
  });

  describe('disabled state', () => {
    it('handles null shotId gracefully', () => {
      const { result } = renderHook(
        () => useSegmentOutputsForShot(null)
      );

      expect(result.current.parentGenerations).toEqual([]);
    });
  });

  describe('hasFinalOutput', () => {
    it('returns false when no parent selected', () => {
      const { result } = renderHook(
        () => useSegmentOutputsForShot('shot-1')
      );

      expect(result.current.hasFinalOutput).toBe(false);
    });
  });

  describe('preloaded timeline data', () => {
    it('derives timeline data from preloaded generations', () => {
      const gen1 = createSegmentOutputGenerationRow({
        id: 'sg-1',
        generation_id: 'gen-1',
        timeline_frame: 0,
        type: 'image',
      });
      const gen2 = createSegmentOutputGenerationRow({
        id: 'sg-2',
        generation_id: 'gen-2',
        timeline_frame: 50,
        type: 'image',
      });
      const unpositioned = createSegmentOutputGenerationRow({
        id: 'sg-3',
        generation_id: 'gen-3',
        timeline_frame: null,
        type: 'image',
      });

      const { result } = renderHook(
        () =>
          useSegmentOutputsForShot(
            'shot-1',
            undefined,
            undefined,
            undefined,
            [gen1, gen2, unpositioned]
          )
      );

      // No parents should be found (these are images, not video with orchestrator_details)
      expect(result.current.parentGenerations).toHaveLength(0);
    });
  });
});
