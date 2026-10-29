import { videoEditorPathWithTimeline } from '@/tools/video-editor/lib/video-editor-path';

import { TOOL_IDS } from './toolIds';
import { toolsUIManifest } from './toolManifest';

const FALLBACK_HOME_TOOL_ID = TOOL_IDS.VIDEO_EDITOR;

interface ResolveHomeToolPathInput {
  preferredToolId: string;
  videoEditorTimelineId?: string | null | undefined;
}

export function resolveHomeToolPath(input: ResolveHomeToolPathInput): string {
  const selectedTool = toolsUIManifest.find((tool) => tool.id === input.preferredToolId);
  const resolvedToolId = selectedTool
    ? selectedTool.id
    : FALLBACK_HOME_TOOL_ID;

  if (resolvedToolId === TOOL_IDS.VIDEO_EDITOR) {
    return videoEditorPathWithTimeline(input.videoEditorTimelineId);
  }

  return toolsUIManifest.find((tool) => tool.id === resolvedToolId)?.path ?? '/tools/video-editor';
}

export function isHomeToolPathActive(pathname: string, targetPath: string): boolean {
  const targetUrl = new URL(targetPath, 'https://astrid.local');
  return pathname === targetUrl.pathname;
}
