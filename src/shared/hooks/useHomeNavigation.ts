import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useProjectSelectionContext } from '@/shared/contexts/ProjectContext';
import { withRuntimeDocumentParams } from '@/app/runtime/runtimeDocument';
import { shotListLocation } from '@/shared/lib/tooling/toolRoutes.ts';
import { useToolSettings } from '@/shared/hooks/settings/useToolSettings';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import {
  isHomeToolPathActive,
  resolveHomeToolPath,
} from '@/shared/lib/tooling/homeNavigation';
import { TOOL_IDS } from '@/shared/lib/tooling/toolIds';
import { usePanesStore } from '@/shared/state/panesStore';
import { videoEditorSettings } from '@/tools/video-editor/settings/videoEditorDefaults';

export function useHomeNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedProjectId } = useProjectSelectionContext();
  const setIsShotsPaneLocked = usePanesStore((state) => state.setIsShotsPaneLocked);
  const { value: defaultTool } = useUserUIState('defaultTool', {
    toolId: TOOL_IDS.VIDEO_EDITOR,
  });
  const { settings: videoEditorProjectSettings } = useToolSettings(videoEditorSettings.id, {
    projectId: selectedProjectId ?? undefined,
    enabled: Boolean(selectedProjectId),
  });

  const targetPath = useMemo(
    () =>
      resolveHomeToolPath({
        preferredToolId: defaultTool.toolId,
        videoEditorTimelineId: videoEditorProjectSettings?.lastTimelineId,
      }),
    [
      defaultTool.toolId,
      videoEditorProjectSettings?.lastTimelineId,
    ],
  );

  const navigateHome = useCallback(() => {
    // Inside a video travel shot (deep-linked via hash): back out to the
    // shot list view first instead of the usual home behavior.
    if (
      location.pathname === '/tools/travel-between-images' &&
      location.hash
    ) {
      navigate(
        (new URLSearchParams(location.search).has('project') || new URLSearchParams(location.search).has('timeline'))
          ? shotListLocation(location.pathname, location.search)
          : location.pathname,
        { replace: true, state: { fromShotClick: false } },
      );
      return;
    }

    if (isHomeToolPathActive(location.pathname, targetPath)) {
      setIsShotsPaneLocked(true);
      return;
    }

    setIsShotsPaneLocked(false);
    navigate(withRuntimeDocumentParams(targetPath, location.search));
  }, [location.hash, location.pathname, location.search, navigate, setIsShotsPaneLocked, targetPath]);

  return {
    targetPath,
    navigateHome,
  };
}
