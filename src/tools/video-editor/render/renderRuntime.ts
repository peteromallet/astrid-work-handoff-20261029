import type { RenderExportDestination } from '@/tools/video-editor/lib/renderRouter.ts';

export interface RenderRuntime {
  projectId: string;
  destination?: RenderExportDestination;
}

export const FALLBACK_RENDER_RUNTIME: RenderRuntime = {
  projectId: '',
};

export function createRenderRuntime(input: {
  projectId: string;
  destination?: RenderExportDestination;
}): RenderRuntime {
  return {
    projectId: input.projectId,
    destination: input.destination ?? 'download',
  };
}
