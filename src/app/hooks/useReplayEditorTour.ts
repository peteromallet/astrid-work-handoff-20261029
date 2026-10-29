import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsMobile, useIsTablet } from '@/shared/hooks/mobile';
import { startEditorTour, useEditorTourRunning } from '@/shared/state/editorTourStore';
import { useVideoEditorRouteState } from './useVideoEditorRouteState';

const VIDEO_EDITOR_PATH = '/tools/video-editor';

/**
 * Settings' "Replay tour": the handler, or undefined where the item is not offered (a phone or tablet, where the
 * tour never runs, or while a tour is already running). Off the editor it first goes there: the editor page hosts
 * the tour, and it takes over from whatever project the user has open, so their own project and timeline return untouched.
 */
export function useReplayEditorTour(): (() => void) | undefined {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const running = useEditorTourRunning();
  const { isEditorRoute } = useVideoEditorRouteState();
  const navigate = useNavigate();
  const replay = useCallback(() => {
    if (!isEditorRoute) navigate(VIDEO_EDITOR_PATH);
    startEditorTour();
  }, [isEditorRoute, navigate]);
  return isMobile || isTablet || running ? undefined : replay;
}
