import { getEffectiveClipVolume } from '@/tools/video-editor/lib/clip-volume.ts';
import { useCallback } from 'react';
import { detachAudioFromVideo } from '@/tools/video-editor/lib/editor-utils.ts';
import type { ClipMeta } from '@/tools/video-editor/lib/timeline-data.ts';
import type { ClipEditingContext } from './types.ts';

export function useClipAudioManagement(ctx: ClipEditingContext) {
  const {
    applyRowsEdit,
    applyConfigEdit,
    dataRef,
    resolvedConfig,
    selectedClipId,
    getValidClipIds,
  } = ctx;

  const handleToggleMuteClips = useCallback((clipIds: string[]) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const validClipIds = getValidClipIds(clipIds);
    if (validClipIds.length === 0) {
      return;
    }

    const metaUpdates = Object.fromEntries(
      validClipIds.map((clipId) => {
        const volume = getEffectiveClipVolume(current.meta[clipId] ?? {});
        return [clipId, { volume: volume <= 0 ? 1 : 0 }];
      }),
    ) as Record<string, Partial<ClipMeta>>;

    applyRowsEdit(current.rows, metaUpdates);
  }, [applyRowsEdit, dataRef, getValidClipIds]);

  const handleToggleMute = useCallback(() => {
    if (!selectedClipId || !resolvedConfig) {
      return;
    }

    handleToggleMuteClips([selectedClipId]);
  }, [handleToggleMuteClips, resolvedConfig, selectedClipId]);

  const handleDetachAudioClip = useCallback((clipId: string) => {
    if (!resolvedConfig) {
      return;
    }

    const nextConfig = detachAudioFromVideo(resolvedConfig, clipId);
    if (nextConfig === resolvedConfig) {
      return;
    }

    applyConfigEdit(nextConfig, { selectedClipId: clipId });
  }, [applyConfigEdit, resolvedConfig]);

  return { handleToggleMuteClips, handleToggleMute, handleDetachAudioClip };
}
