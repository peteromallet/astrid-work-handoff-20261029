import { useCallback, useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { GenerationRow } from '@/domains/generation/types';
import { isTimelineWriteActive } from '@/shared/lib/timelineWriteQueue';
import {
  buildServerPositions,
  createPositionsSyncKey,
  mergePendingUpdates,
  type PendingUpdate,
} from './timelinePositionCalc';

interface UseTimelinePositionSyncParams {
  shotId: string | null;
  shotGenerations: GenerationRow[];
  onPositionsChange?: (positions: Map<string, number>) => void;
  setPositions: Dispatch<SetStateAction<Map<string, number>>>;
  positionsRef: MutableRefObject<Map<string, number>>;
  pendingUpdatesRef: MutableRefObject<Map<string, PendingUpdate>>;
  lastSyncRef: MutableRefObject<string>;
  isLockedRef: MutableRefObject<boolean>;
  isUpdatingRef: MutableRefObject<boolean>;
  writeInFlightRef: MutableRefObject<number>;
}

export function useTimelinePositionSync({
  shotId,
  shotGenerations,
  onPositionsChange,
  setPositions,
  positionsRef,
  pendingUpdatesRef,
  lastSyncRef,
  isLockedRef,
  isUpdatingRef,
  writeInFlightRef,
}: UseTimelinePositionSyncParams): () => void {
  /**
   * Sync positions from database data
   * Only updates if we're idle and data has changed.
   */
  const syncFromDatabase = useCallback(() => {
    if (isLockedRef.current) {
      return;
    }

    if (isUpdatingRef.current) {
      return;
    }

    if (writeInFlightRef.current > 0) {
      return;
    }

    // Cross-path guard: suppress sync while ANY serialized write is active for
    // this shot — including writes from the batch editor.
    if (shotId && isTimelineWriteActive(shotId) && positionsRef.current.size > 0) {
      return;
    }

    const serverPositions = buildServerPositions(shotGenerations);
    const { merged: mergedPositions, idsToClear } = mergePendingUpdates(serverPositions, pendingUpdatesRef.current);
    if (idsToClear.length > 0) {
      idsToClear.forEach(id => pendingUpdatesRef.current.delete(id));
    }

    const syncKey = createPositionsSyncKey(mergedPositions);
    if (syncKey === lastSyncRef.current) {
      return;
    }
    lastSyncRef.current = syncKey;

    setPositions(mergedPositions);

    if (onPositionsChange) {
      onPositionsChange(mergedPositions);
    }
  }, [shotGenerations, onPositionsChange, shotId, setPositions, positionsRef, pendingUpdatesRef, lastSyncRef, isLockedRef, isUpdatingRef, writeInFlightRef]);

  useEffect(() => {
    if (shotId && shotGenerations.length > 0) {
      syncFromDatabase();
    }
  }, [shotId, shotGenerations, syncFromDatabase]);

  return syncFromDatabase;
}
