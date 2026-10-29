import { Navigate } from 'react-router-dom';

import { AstridLoading } from '@/shared/components/AstridLoading';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { toolsUIManifest } from '@/shared/lib/tooling/toolManifest';
import { TOOL_IDS } from '@/shared/lib/tooling/toolIds';

const FALLBACK_TOOL_ID = TOOL_IDS.VIDEO_EDITOR;

export function DefaultToolRedirect() {
  const { value: defaultTool, isLoading: isLoadingDefaultTool } = useUserUIState('defaultTool', {
    toolId: FALLBACK_TOOL_ID,
  });

  if (isLoadingDefaultTool) {
    return <AstridLoading />;
  }

  const selectedTool = toolsUIManifest.find((tool) => tool.id === defaultTool.toolId);
  const resolvedToolId = selectedTool
    ? selectedTool.id
    : FALLBACK_TOOL_ID;

  const resolvedTool = toolsUIManifest.find((tool) => tool.id === resolvedToolId);
  return <Navigate to={resolvedTool?.path ?? '/tools/video-editor'} replace />;
}
