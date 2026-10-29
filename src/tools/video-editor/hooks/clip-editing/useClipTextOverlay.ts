import { useCallback } from 'react';
import { createClipMetaFromDescriptor } from '@/tools/video-editor/clip-types/runtime.ts';
import { getVisualTracks } from '@/tools/video-editor/lib/editor-utils.ts';
import { updateClipOrder } from '@/tools/video-editor/lib/coordinate-utils.ts';
import { resolveOverlaps } from '@/tools/video-editor/lib/resolve-overlaps.ts';
import { getNextClipId } from '@/tools/video-editor/lib/timeline-data.ts';
import { createTrackAtTop } from '@/tools/video-editor/lib/external-drop-utils.ts';
import type { TimelineAction } from '@/tools/video-editor/types/timeline-canvas.ts';
import type { ClipEditingContext } from './types.ts';

/** How long a new text clip runs. */
const TEXT_CLIP_SECONDS = 5;

export function useClipTextOverlay(ctx: ClipEditingContext) {
  const {
    applyRowsEdit,
    dataRef,
    currentTimeRef,
    selectClip,
    setSelectedTrackId,
  } = ctx;

  const handleAddTextAt = useCallback((trackId: string, time: number) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    // Ensure the target track is visual; fall back to first visual track
    const targetTrack = current.tracks.find((t) => t.id === trackId);
    const visualTrack = targetTrack?.kind === 'visual'
      ? targetTrack
      : getVisualTracks(current.resolvedConfig)[0];
    if (!visualTrack) {
      return;
    }

    const clipId = getNextClipId(current.meta);
    const action: TimelineAction = {
      id: clipId,
      start: Math.max(0, time),
      end: Math.max(0, time) + TEXT_CLIP_SECONDS,
      effectId: `effect-${clipId}`,
    };
    const rowsWithClip = current.rows.map((row) => (
      row.id === visualTrack.id
        ? { ...row, actions: [...row.actions, action] }
        : row
    ));
    const { rows: nextRows, metaPatches, adjustments: _adjustments } = resolveOverlaps(
      rowsWithClip, visualTrack.id, clipId, current.meta,
    );
    const nextClipOrder = updateClipOrder(current.clipOrder, visualTrack.id, (ids) => [...ids, clipId]);
    const clipMeta = createClipMetaFromDescriptor({
      clipType: 'text',
      trackId: visualTrack.id,
    });
    if (!clipMeta) {
      return;
    }
    applyRowsEdit(nextRows, {
      ...metaPatches,
      [clipId]: clipMeta,
    }, undefined, nextClipOrder);
    selectClip(clipId);
    setSelectedTrackId(visualTrack.id);
  }, [applyRowsEdit, dataRef, selectClip, setSelectedTrackId]);

  /**
   * New text at the playhead, in front of the picture: on the front visual track (the top row)
   * when it has room there, otherwise on a new track above it. Used where there is no drop
   * position to read (the touch editor's Text button).
   */
  const handleAddText = useCallback(() => {
    if (!dataRef.current) {
      return;
    }
    const start = Math.max(0, currentTimeRef.current);
    const end = start + TEXT_CLIP_SECONDS;
    const { tracks, rows } = dataRef.current;
    const frontTrack = tracks.find((track) => track.kind === 'visual');
    const frontIsFree = frontTrack
      && !rows.find((row) => row.id === frontTrack.id)?.actions.some((action) => action.start < end && action.end > start);
    const trackId = frontIsFree ? frontTrack.id : createTrackAtTop(dataRef, 'visual')?.trackId;
    if (trackId) {
      handleAddTextAt(trackId, start);
    }
  }, [currentTimeRef, dataRef, handleAddTextAt]);

  return { handleAddText, handleAddTextAt };
}
