import { useState, useCallback } from 'react';
import type { GenerationRow } from '@/domains/generation/types';
import { useToolSettings, type SettingsScope } from '@/shared/hooks/settings/useToolSettings';

/**
 * Shared hook for the edit tools' media selection.
 * Holds the selected media and the tool's UI settings; the selection itself is
 * not restored from or written to a backend.
 *
 * Used by EditImagesPage and EditVideoPage.
 */

interface UseEditToolMediaPersistenceParams {
  /** The tool settings key, e.g. 'edit-images-ui' */
  settingsToolId: string;
  /** Current project ID */
  projectId: string | undefined;
}

interface UseEditToolMediaPersistenceReturn {
  /** The selected media, or null */
  selectedMedia: GenerationRow | null;
  /** Set the selected media */
  setSelectedMedia: (media: GenerationRow | null) => void;
  /** Call this when user explicitly closes the editor */
  handleEditorClose: () => void;
  /** Whether to show the loading skeleton */
  showSkeleton: boolean;
  /** The update function from useToolSettings */
  updateUISettings: (scope: SettingsScope, settings: Record<string, unknown>) => Promise<void>;
  /** Whether the underlying tool settings are loading */
  isUISettingsLoading: boolean;
}

export function useEditToolMediaPersistence({
  settingsToolId,
  projectId,
}: UseEditToolMediaPersistenceParams): UseEditToolMediaPersistenceReturn {
  const [selectedMedia, setSelectedMediaState] = useState<GenerationRow | null>(null);

  // Project-level UI settings of the tool
  const {
    update: updateUISettings,
    isLoading: isUISettingsLoading,
  } = useToolSettings<Record<string, unknown>>(settingsToolId, {
    projectId,
    enabled: !!projectId,
  });

  // Wrapper to set media from outside (e.g. gallery selection, upload result)
  const setSelectedMedia = useCallback((media: GenerationRow | null) => {
    setSelectedMediaState(media);
  }, []);

  // Call when user explicitly closes the editor
  const handleEditorClose = useCallback(() => {
    setSelectedMediaState(null);
  }, []);

  return {
    selectedMedia,
    setSelectedMedia,
    handleEditorClose,
    showSkeleton: isUISettingsLoading,
    updateUISettings,
    isUISettingsLoading,
  };
}
