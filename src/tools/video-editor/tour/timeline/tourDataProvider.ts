import type { AssetRegistry, DataProvider, TimelineConfig } from '@/tools/video-editor/index.ts';
import { TimelineNotFoundError } from '@/tools/video-editor/index.ts';
import {
  EDITOR_TOUR_TIMELINE_ID,
  createEditorTourAssetRegistry,
  createEditorTourTimeline,
} from './tourStages.ts';

export class EditorTourWriteError extends Error {
  constructor(operation: string) {
    super(`The editor tour is in memory only: ${operation} is unavailable.`);
    this.name = 'EditorTourWriteError';
  }
}

/**
 * The tour's in-memory provider (pattern: `createPublicAstridDataProvider`). Timeline and registry
 * come from memory, asset urls are the media slots' own urls, and no write path exists: edits live in
 * the editor's state and vanish with the tour.
 */
export function createEditorTourDataProvider(
  timeline: TimelineConfig = createEditorTourTimeline(),
  assetRegistry: AssetRegistry = createEditorTourAssetRegistry(),
): DataProvider {
  const requireTimeline = (requestedId: string) => {
    if (requestedId !== EDITOR_TOUR_TIMELINE_ID) throw new TimelineNotFoundError(requestedId);
  };
  return Object.freeze({
    persistenceEnabled: false,
    supportsDirectAssetUpload: false,
    async loadTimeline(requestedId: string) {
      requireTimeline(requestedId);
      return { config: structuredClone(timeline), configVersion: 1 };
    },
    async loadAssetRegistry(requestedId: string) {
      requireTimeline(requestedId);
      return structuredClone(assetRegistry);
    },
    async resolveAssetUrl(file: string): Promise<string> {
      return file;
    },
    async saveTimeline(): Promise<number> {
      throw new EditorTourWriteError('saveTimeline');
    },
  });
}
