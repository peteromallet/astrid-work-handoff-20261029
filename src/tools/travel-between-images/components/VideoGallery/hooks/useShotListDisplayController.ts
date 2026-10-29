import React from 'react';
import { useShots } from '@/shared/contexts/ShotsContext';
import { usePendingNewShotDrop } from './usePendingNewShotDrop';
import type { Shot } from '@/domains/generation/types';
import type { NewShotDropHandlers } from './newShotDrop.types';

interface UseShotListDisplayControllerParams extends NewShotDropHandlers {
  shots?: Shot[];
  sortMode: 'ordered' | 'newest' | 'oldest';
}

export function useShotListDisplayController({
  shots: propShots,
  sortMode,
  onGenerationDropForNewShot,
  onFilesDropForNewShot,
  onSkeletonSetupReady,
}: UseShotListDisplayControllerParams) {
  const { isLoading: shotsLoading, error: shotsError } = useShots();

  const shots = React.useMemo(() => {
    if (!propShots) return propShots;

    if (sortMode === 'newest') {
      return [...propShots].sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateB - dateA;
      });
    }

    if (sortMode === 'oldest') {
      return [...propShots].sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateA - dateB;
      });
    }

    return [...propShots].sort((a, b) => (a.position || 0) - (b.position || 0));
  }, [propShots, sortMode]);

  const currentShotIds = React.useMemo(() => shots?.map((s) => s.id) ?? [], [shots]);
  const pendingNewShot = usePendingNewShotDrop({
    currentShotIds,
    shots,
    onGenerationDropForNewShot,
    onFilesDropForNewShot,
    onSkeletonSetupReady,
  });

  return {
    shotsLoading,
    shotsError,
    shots,
    pendingNewShot,
  };
}
